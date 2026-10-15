import { ProviderError, invalidResponse, requestFailed } from '../../errors'
import { fetchWithTokenRefresh, isSuccess, jsonObject } from '../../http'
import { asNumber, asObject, asString, parseJson } from '../../parse'
import { makeSnapshot, type ProviderContext, type ProviderRuntime } from '../../runtime'
import type { ProviderInfo, ProviderSnapshot } from '../../types'
import { fingerprint, metric, parseRetryAfterSeconds } from '../shared'
import {
  allowsFallback,
  claudeAuthText,
  claudeOAuthConfig,
  isExpired,
  liveUsageAvailability,
  loadClaudeCredentials,
  needsRefresh,
  saveRotatedTokens,
  type ClaudeCredential,
  type ClaudeOAuthConfig
} from './auth'
import { fetchClaudeProfile, fetchClaudeUsage, refreshClaudeToken } from './client'
import { EXTRA_USAGE_LABEL, formatClaudePlan, formatLivePlan, mapClaudeUsage, rateLimitedWarning, type ClaudeMappedUsage } from './mapper'

// Claude subscription limits from Claude Code's login (upstream ClaudeProvider, Windows sources).

const RATE_LIMIT_COOLDOWN_S = 5 * 60

const tokenExpired = () => new ProviderError('authExpired', claudeAuthText.tokenExpired)
const sessionExpired = () => new ProviderError('authExpired', claudeAuthText.sessionExpired)
/** Read-only Logins: the login isn't renewed, so the user signs in again with Claude Code. */
const loginExpired = () => new ProviderError('authExpired', claudeAuthText.loginExpired)

export class ClaudeProvider implements ProviderRuntime {
  readonly info: ProviderInfo = {
    id: 'claude',
    displayName: 'Claude',
    brandColor: '#D97757',
    links: [
      { label: 'Status', url: 'https://status.anthropic.com/' },
      { label: 'Dashboard', url: 'https://claude.ai/settings/usage' }
    ],
    autoEnable: true
  }

  readonly metrics = [
    metric('Session', { defaultPinned: true, sessionStartSignal: 'missingResetDate' }),
    metric('Weekly', { defaultPinned: true }),
    metric('Fable'),
    metric('Sonnet', { defaultEnabled: false, defaultOnDemand: true }),
    metric(EXTRA_USAGE_LABEL, { title: 'Extra Usage', valueWord: 'spent' })
  ]

  /** Last good live usage and an active rate-limit cooldown, for the credential they belong to. */
  private lastGood: { key: string; usage: ClaudeMappedUsage } | undefined
  private cooldown: { key: string; until: number } | undefined
  /** Live plan per access token: looked up at most once per token (Anthropic rate-limits it). */
  private readonly livePlans = new Map<string, string | null>()

  async hasLocalCredentials(ctx: ProviderContext): Promise<boolean> {
    try {
      return (await loadClaudeCredentials(ctx)).some((credential) => Boolean(credential.oauth.accessToken))
    } catch {
      return false
    }
  }

  async refresh(ctx: ProviderContext): Promise<ProviderSnapshot> {
    const config = claudeOAuthConfig(ctx)
    const candidates = await loadClaudeCredentials(ctx)
    if (candidates.length === 0) throw new ProviderError('notLoggedIn', claudeAuthText.notLoggedIn)

    let lastFallback: unknown
    for (const credential of candidates) {
      try {
        return await this.probe(ctx, config, credential)
      } catch (error) {
        if (!allowsFallback(error)) throw error
        ctx.log.warn('auth:claude', `${credential.source} credential failed; trying the next source if any`)
        lastFallback = error
      }
    }
    throw lastFallback ?? new ProviderError('notLoggedIn', claudeAuthText.notLoggedIn)
  }

  private async probe(ctx: ProviderContext, config: ClaudeOAuthConfig, credential: ClaudeCredential): Promise<ProviderSnapshot> {
    const storedPlan = formatClaudePlan(credential.oauth.subscriptionType, credential.oauth.rateLimitTier)
    switch (liveUsageAvailability(credential)) {
      case 'missingProfileScope':
        ctx.log.warn('claude', 'credential lacks the user:profile scope; live usage unavailable')
        return makeSnapshot(this.info, ctx, { lines: [], warning: claudeAuthText.missingProfileScope, ...(storedPlan ? { plan: storedPlan } : {}) })
      case 'inferenceOnly':
        return makeSnapshot(this.info, ctx, { lines: [], warning: claudeAuthText.environmentOnly, ...(storedPlan ? { plan: storedPlan } : {}) })
      case 'available':
        return makeSnapshot(this.info, ctx, await this.fetchLiveUsage(ctx, config, credential))
    }
  }

  private async fetchLiveUsage(ctx: ProviderContext, config: ClaudeOAuthConfig, credential: ClaudeCredential): Promise<ClaudeMappedUsage> {
    const working: ClaudeCredential = { ...credential, oauth: { ...credential.oauth } }
    const key = fingerprint(credential.source, credential.oauth.refreshToken ?? credential.oauth.accessToken)
    const now = ctx.now()

    if (this.cooldown?.key === key && now.getTime() < this.cooldown.until) {
      return this.rateLimited(key, Math.ceil((this.cooldown.until - now.getTime()) / 1000))
    }

    if (needsRefresh(working.oauth, now)) {
      // Read-only: an expired token stops here; one that's only expiring is tried once as is.
      if (!ctx.allowTokenRefresh) {
        if (isExpired(working.oauth, now)) throw loginExpired()
      } else if (working.oauth.refreshToken) {
        await this.rotate(ctx, config, working)
      }
    }

    const response = await fetchWithTokenRefresh({
      token: working.oauth.accessToken ?? '',
      attempt: (token) => fetchClaudeUsage(ctx, config, token),
      refreshAccessToken: async () => {
        if (!ctx.allowTokenRefresh) throw loginExpired()
        if (!working.oauth.refreshToken) throw tokenExpired()
        await this.rotate(ctx, config, working)
        return working.oauth.accessToken ?? ''
      },
      authExpired: tokenExpired
    })

    if (response.status === 429) {
      const retryAfter = parseRetryAfterSeconds(response.headers['retry-after'], now)
      this.cooldown = { key, until: now.getTime() + (retryAfter ?? RATE_LIMIT_COOLDOWN_S) * 1000 }
      ctx.log.info('claude', `rate limited (serving ${this.lastGood?.key === key ? 'last good usage' : 'an error'})`)
      return this.rateLimited(key, retryAfter)
    }
    if (!isSuccess(response)) throw requestFailed(response.status, `usage HTTP ${response.status}`)

    const usage = mapClaudeUsage(jsonObject(response, 'Claude usage'), working.oauth)
    const livePlan = await this.livePlan(ctx, config, working.oauth.accessToken ?? '', working)
    if (livePlan) usage.plan = livePlan
    this.lastGood = { key, usage }
    this.cooldown = undefined
    return usage
  }

  /** Last good usage with the rate-limit warning, or an error when there's nothing to show yet. */
  private rateLimited(key: string, retryAfterSeconds: number | undefined): ClaudeMappedUsage {
    const warning = rateLimitedWarning(retryAfterSeconds)
    if (this.lastGood?.key === key) return { ...this.lastGood.usage, warning }
    throw new ProviderError('rateLimited', warning)
  }

  private async livePlan(ctx: ProviderContext, config: ClaudeOAuthConfig, accessToken: string, credential: ClaudeCredential): Promise<string | undefined> {
    const key = fingerprint(accessToken)
    if (this.livePlans.has(key)) return this.livePlans.get(key) ?? undefined
    let plan: string | undefined
    try {
      const response = await fetchClaudeProfile(ctx, config, accessToken)
      if (isSuccess(response)) plan = formatLivePlan(jsonObject(response, 'Claude profile'), credential.oauth)
      else ctx.log.warn('claude', `live plan lookup failed (HTTP ${response.status}); showing the stored plan`)
    } catch (error) {
      if (ctx.signal.aborted) return undefined
      ctx.log.warn('claude', `live plan lookup failed; showing the stored plan: ${String(error)}`)
    }
    this.livePlans.set(key, plan ?? null)
    return plan
  }

  /** Exchanges the refresh token, writes the rotation back, and moves `working` onto it. */
  private async rotate(ctx: ProviderContext, config: ClaudeOAuthConfig, working: ClaudeCredential): Promise<void> {
    if (!ctx.allowTokenRefresh) throw loginExpired()
    const refreshToken = working.oauth.refreshToken
    if (!refreshToken) throw tokenExpired()
    ctx.log.info('auth:claude', 'token refresh attempt')
    const response = await refreshClaudeToken(ctx, config, refreshToken)
    if (response.status === 400 || response.status === 401) {
      const body = asObject(parseJson(response.text))
      const code = asString(body?.error) ?? asString(body?.error_description)
      if (code === 'invalid_grant') throw sessionExpired()
      // Without a recognized OAuth code this may be a proxy page, not an expired login.
      throw requestFailed(response.status, `token refresh HTTP ${response.status}`)
    }
    if (!isSuccess(response)) throw requestFailed(response.status, `token refresh HTTP ${response.status}`)
    const body = jsonObject(response, 'Claude token refresh')
    const accessToken = asString(body.access_token)
    if (!accessToken) throw invalidResponse('token refresh response has no access_token')
    const nextRefresh = asString(body.refresh_token)
    const expiresIn = asNumber(body.expires_in)
    const rotated = {
      accessToken,
      ...(nextRefresh ? { refreshToken: nextRefresh } : {}),
      ...(expiresIn !== undefined ? { expiresAt: ctx.now().getTime() + expiresIn * 1000 } : {})
    }
    try {
      await saveRotatedTokens(ctx, working, rotated)
    } catch (error) {
      // The refreshed token still serves this refresh; a lost write only costs a re-refresh later.
      ctx.log.error('auth:claude', `failed to persist rotated credentials; using them for this session only: ${String(error)}`)
    }
    working.oauth = { ...working.oauth, ...rotated }
    ctx.log.info('auth:claude', 'token refresh ok')
  }
}
