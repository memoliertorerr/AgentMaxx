import { requestFailed } from '../../errors'
import { fetchWithTokenRefresh, isAuthFailure, isSuccess, jsonObject, type HttpResponse } from '../../http'
import { asBool, asObject, asString, parseJson, type JsonObject } from '../../parse'
import { makeSnapshot, type ProviderContext, type ProviderRuntime } from '../../runtime'
import type { ProviderInfo, ProviderSnapshot } from '../../types'
import { fingerprint, metric } from '../shared'
import { cursorAuthError, isExpired, loadCursorAuth, needsRefresh, type CursorAuth } from './auth'
import { CURSOR_URLS, connectPost, refreshCursorToken, sessionGet } from './client'
import {
  CURSOR_LABELS,
  GENERIC_UNAVAILABLE,
  PlanUsageFacts,
  mapCursorUsage,
  mapGrokBotUsage,
  mapRequestBasedUsage,
  requestBasedFallback,
  stripeBalanceCents,
  type CursorMappedUsage
} from './mapper'
import { hasUsableSummary, mapUsageSummary } from './summary'

// Cursor plan usage from the Cursor app's login (upstream CursorProvider, without spend history).

export class CursorProvider implements ProviderRuntime {
  readonly info: ProviderInfo = {
    id: 'cursor',
    displayName: 'Cursor',
    brandColor: '#5B5BD6',
    links: [
      { label: 'Status', url: 'https://status.cursor.com/' },
      { label: 'Dashboard', url: 'https://www.cursor.com/dashboard' }
    ],
    autoEnable: true
  }

  readonly metrics = [
    metric(CURSOR_LABELS.total, { title: 'Total Usage' }),
    metric(CURSOR_LABELS.auto, { defaultPinned: true }),
    metric(CURSOR_LABELS.api, { defaultPinned: true }),
    metric(CURSOR_LABELS.grokBot, { title: 'Grok Bot', defaultOnDemand: true }),
    metric(CURSOR_LABELS.onDemand, { title: 'Extra Usage', valueWord: 'spent', defaultOnDemand: true }),
    metric(CURSOR_LABELS.requests, { defaultEnabled: false, defaultOnDemand: true }),
    metric(CURSOR_LABELS.credits, { valueWord: 'left', defaultEnabled: false, defaultOnDemand: true })
  ]

  /**
   * Access tokens refreshed by this app, per refresh token. Cursor's own database is never
   * written, so the fresh token is reused from memory until it nears expiry.
   */
  private readonly refreshed = new Map<string, string>()

  async hasLocalCredentials(ctx: ProviderContext): Promise<boolean> {
    try {
      return (await loadCursorAuth(ctx)) !== undefined
    } catch {
      return false
    }
  }

  async refresh(ctx: ProviderContext): Promise<ProviderSnapshot> {
    const auth = await loadCursorAuth(ctx)
    if (!auth) throw cursorAuthError.notLoggedIn()
    const accessToken = await this.usableAccessToken(ctx, auth)

    let current = accessToken
    const usageResponse = await fetchWithTokenRefresh({
      token: accessToken,
      attempt: (token) => connectPost(ctx, CURSOR_URLS.usage, token),
      refreshAccessToken: async () => {
        const token = await this.refreshAccessToken(ctx, auth)
        if (!token) throw cursorAuthError.tokenExpired()
        current = token
        return token
      },
      authExpired: cursorAuthError.tokenExpired
    })
    if (!isSuccess(usageResponse)) throw requestFailed(usageResponse.status, `usage HTTP ${usageResponse.status}`)
    const usage = jsonObject(usageResponse, 'Cursor usage')

    const { planName, planInfoUnavailable } = await this.planName(ctx, current)
    const mapped = await this.mapPrimary(ctx, usage, current, planName, planInfoUnavailable)

    const grokBot = await this.optionalJson(ctx, 'Grok Bot usage', () => connectPost(ctx, CURSOR_URLS.grokBot, current))
    const grokLine = grokBot ? mapGrokBotUsage(grokBot) : undefined
    if (grokLine) mapped.lines.push(grokLine)
    return makeSnapshot(this.info, ctx, mapped)
  }

  /**
   * Team/Enterprise accounts without usable plan data go to the usage-summary fallback; plans
   * with no limit data try the request-count endpoint; everything else maps the RPC usage.
   */
  private async mapPrimary(
    ctx: ProviderContext,
    usage: JsonObject,
    token: string,
    planName: string | undefined,
    planInfoUnavailable: boolean
  ): Promise<CursorMappedUsage> {
    const fallbackMessage = requestBasedFallback(usage, planName, planInfoUnavailable)
    if (fallbackMessage) return this.summaryFallback(ctx, token, planName, fallbackMessage)
    if (new PlanUsageFacts(usage).shouldTryGenericRequestFallback) {
      const requestBased = await this.tryRequestBased(ctx, token, planName)
      if (requestBased) return requestBased
    }
    const creditGrants = await this.creditGrants(ctx, token)
    const prepaid = stripeBalanceCents(await this.optionalJson(ctx, 'prepaid-balance', () => sessionGet(ctx, CURSOR_URLS.stripe, token)))
    return mapCursorUsage(usage, planName, creditGrants, prepaid)
  }

  /** The stored token, a token this app refreshed earlier, or a fresh one when it's expiring. */
  private async usableAccessToken(ctx: ProviderContext, auth: CursorAuth): Promise<string> {
    const now = ctx.now()
    const cached = auth.refreshToken ? this.refreshed.get(fingerprint(auth.refreshToken)) : undefined
    if (cached && !needsRefresh(cached, now)) return cached
    if (auth.accessToken && !needsRefresh(auth.accessToken, now)) return auth.accessToken
    if (!ctx.allowTokenRefresh) {
      // Read-only: an expiring token is tried once as is; an expired one asks for a new sign-in.
      if (auth.accessToken && !isExpired(auth.accessToken, now)) return auth.accessToken
      throw cursorAuthError.loginExpired()
    }
    try {
      const token = await this.refreshAccessToken(ctx, auth)
      if (token) return token
    } catch (error) {
      if (!auth.accessToken) throw error
      ctx.log.warn('auth:cursor', 'token refresh failed; trying the stored token')
    }
    if (!auth.accessToken) throw cursorAuthError.notLoggedIn()
    return auth.accessToken
  }

  private async refreshAccessToken(ctx: ProviderContext, auth: CursorAuth): Promise<string | undefined> {
    if (!ctx.allowTokenRefresh) throw cursorAuthError.loginExpired()
    const refreshToken = auth.refreshToken
    if (!refreshToken) return undefined
    const response = await refreshCursorToken(ctx, refreshToken)
    const body = asObject(parseJson(response.text))
    if (response.status === 400 || response.status === 401) {
      throw asBool(body?.shouldLogout) === true ? cursorAuthError.sessionExpired() : cursorAuthError.tokenExpired()
    }
    if (!isSuccess(response) || !body) return undefined
    if (asBool(body.shouldLogout) === true) throw cursorAuthError.sessionExpired()
    const token = asString(body.access_token)
    if (token) this.refreshed.set(fingerprint(refreshToken), token)
    return token
  }

  private async planName(ctx: ProviderContext, token: string): Promise<{ planName: string | undefined; planInfoUnavailable: boolean }> {
    const body = await this.optionalJson(ctx, 'plan', () => connectPost(ctx, CURSOR_URLS.plan, token))
    const planName = asString(asObject(body?.planInfo)?.planName)
    if (body && !planName) ctx.log.warn('cursor', 'optional plan response contained invalid plan metadata')
    return { planName, planInfoUnavailable: planName === undefined }
  }

  private async creditGrants(ctx: ProviderContext, token: string): Promise<JsonObject | undefined> {
    const body = await this.optionalJson(ctx, 'credit-grants', () => connectPost(ctx, CURSOR_URLS.credits, token))
    if (!body) return undefined
    if (typeof body.hasCreditGrants !== 'boolean') {
      ctx.log.warn('cursor', 'optional credit-grants response contained invalid grant metadata')
      return undefined
    }
    return body
  }

  private async summaryFallback(ctx: ProviderContext, token: string, planName: string | undefined, message: string): Promise<CursorMappedUsage> {
    const summary = await this.optionalJson(ctx, 'usage-summary', () => sessionGet(ctx, CURSOR_URLS.usageSummary, token))
    if (summary && !hasUsableSummary(summary)) ctx.log.warn('cursor', 'usage-summary response contained no usable usage fields')
    const requests = await this.optionalJson(ctx, 'request-based usage', () => sessionGet(ctx, CURSOR_URLS.restUsage, token, { withUser: true }))
    return mapUsageSummary(summary, requests, planName, message)
  }

  private async tryRequestBased(ctx: ProviderContext, token: string, planName: string | undefined): Promise<CursorMappedUsage | undefined> {
    const body = await this.optionalJson(ctx, 'request-based usage', () => sessionGet(ctx, CURSOR_URLS.restUsage, token, { withUser: true }))
    try {
      return mapRequestBasedUsage(body, planName, GENERIC_UNAVAILABLE)
    } catch {
      ctx.log.warn('cursor', 'optional request-based usage fallback failed')
      return undefined
    }
  }

  /**
   * Optional endpoints enrich a usable snapshot and never fail it. Every failure mode is logged
   * with a fixed, credential-free message.
   */
  private async optionalJson(
    ctx: ProviderContext,
    label: string,
    request: () => Promise<HttpResponse> | undefined
  ): Promise<JsonObject | undefined> {
    let response: HttpResponse | undefined
    try {
      response = await request()
    } catch {
      ctx.log.warn('cursor', `optional ${label} request failed`)
      return undefined
    }
    if (!response) {
      ctx.log.warn('cursor', `optional ${label} request could not be prepared from the current session`)
      return undefined
    }
    if (!isSuccess(response)) {
      if (!isAuthFailure(response)) ctx.log.warn('cursor', `optional ${label} request returned HTTP ${response.status}`)
      return undefined
    }
    const body = asObject(parseJson(response.text))
    if (!body) ctx.log.warn('cursor', `optional ${label} response was invalid`)
    return body
  }
}
