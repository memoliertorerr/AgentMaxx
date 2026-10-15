import { ProviderError } from '../../errors'
import { fetchWithTokenRefresh, isSuccess, type HttpResponse } from '../../http'
import { makeSnapshot, type ProviderContext, type ProviderRuntime } from '../../runtime'
import type { MetricLine, ProviderInfo, ProviderSnapshot } from '../../types'
import { fingerprint, metric } from '../shared'
import {
  grokAuthError,
  grokClientId,
  grokRefreshToken,
  isExpired,
  loadGrokCandidates,
  needsRefresh,
  saveGrokRotation,
  tokenExpiresAt,
  type GrokCandidate,
  type GrokRotation
} from './auth'
import { decodeRefreshResponse, fetchCreditsConfig, fetchSettings, requestGrokRefresh } from './client'
import { TEAM_BILLING_WARNING, grokPlanName, grokUsageError, isTeamBillingUnavailable, mapCreditsConfig } from './mapper'

// Grok Build's weekly credit pool from the Grok CLI's login (upstream GrokProvider). The local spend
// tiles from ~/.grok/sessions are Later.

export class GrokProvider implements ProviderRuntime {
  readonly info: ProviderInfo = {
    id: 'grok',
    displayName: 'Grok',
    brandColor: '#3F4651',
    links: [{ label: 'Usage', url: 'https://grok.com/?_s=usage' }],
    autoEnable: true
  }

  readonly metrics = [
    metric('Weekly limit', { title: 'Weekly' }),
    metric('Pay as you go', { title: 'Extra Usage', defaultOnDemand: true })
  ]

  /**
   * Rotated tokens that couldn't be written back, keyed by the login still on disk, so the next
   * refresh doesn't spend a refresh token the server already rotated.
   */
  private readonly unsaved = new Map<string, GrokRotation>()

  async hasLocalCredentials(ctx: ProviderContext): Promise<boolean> {
    try {
      return (await loadGrokCandidates(ctx)).length > 0
    } catch {
      return false
    }
  }

  async refresh(ctx: ProviderContext): Promise<ProviderSnapshot> {
    const candidates = await loadGrokCandidates(ctx)
    let sawExpired = false
    for (const candidate of candidates) {
      this.applyUnsaved(candidate)
      if (needsRefresh(candidate, ctx.now())) {
        const refreshed = await this.refreshAccessToken(ctx, candidate)
        if (refreshed) return this.probe(ctx, candidate, refreshed)
        if (isExpired(candidate, ctx.now())) {
          sawExpired = true
          continue
        }
      }
      return this.probe(ctx, candidate, candidate.token)
    }
    throw sawExpired ? grokAuthError.expired() : grokAuthError.invalidAuth()
  }

  private async probe(ctx: ProviderContext, candidate: GrokCandidate, accessToken: string): Promise<ProviderSnapshot> {
    let response: HttpResponse
    try {
      response = await fetchWithTokenRefresh({
        token: accessToken,
        attempt: (token) => fetchCreditsConfig(ctx, token),
        refreshAccessToken: async () => {
          const refreshed = await this.refreshAccessToken(ctx, candidate)
          if (!refreshed) throw grokAuthError.expired()
          return refreshed
        },
        authExpired: grokAuthError.expired
      })
    } catch (error) {
      if (error instanceof ProviderError && error.category === 'network') throw grokUsageError.connectionFailed(error.detail)
      throw error
    }

    let lines: MetricLine[]
    let warning: string | undefined
    if (isTeamBillingUnavailable(response)) {
      ctx.log.warn('grok', 'credits config unavailable: team principal has no personal team; weekly and pay-as-you-go omitted')
      lines = []
      warning = TEAM_BILLING_WARNING
    } else {
      lines = mapCreditsConfig(response)
    }
    const plan = await this.planName(ctx, candidate.token)
    return makeSnapshot(this.info, ctx, { lines, ...(plan ? { plan } : {}), ...(warning ? { warning } : {}) })
  }

  private async planName(ctx: ProviderContext, accessToken: string): Promise<string | undefined> {
    try {
      return grokPlanName(await fetchSettings(ctx, accessToken))
    } catch (error) {
      ctx.log.info('grok', `settings lookup failed; no plan name this refresh: ${String(error)}`)
      return undefined
    }
  }

  /** A fresh access token, or undefined when the login can't be refreshed (the reason is logged). */
  private async refreshAccessToken(ctx: ProviderContext, candidate: GrokCandidate): Promise<string | undefined> {
    const refreshToken = grokRefreshToken(candidate.entry)
    if (!refreshToken) return undefined

    let response: HttpResponse
    try {
      response = await requestGrokRefresh(ctx, refreshToken, grokClientId(candidate))
    } catch (error) {
      ctx.log.warn('auth:grok', `token refresh request failed: ${error instanceof ProviderError ? (error.detail ?? error.message) : String(error)}`)
      return undefined
    }
    if (!isSuccess(response)) {
      ctx.log.warn('auth:grok', `token refresh failed (HTTP ${response.status})`)
      return undefined
    }
    const decoded = decodeRefreshResponse(response.text)
    if (!decoded) {
      ctx.log.warn('auth:grok', 'token refresh returned an undecodable or empty access token')
      return undefined
    }

    const now = ctx.now()
    const expiresAt =
      decoded.expiresIn !== undefined && decoded.expiresIn > 0
        ? new Date(now.getTime() + decoded.expiresIn * 1000)
        : (tokenExpiresAt(decoded.accessToken) ?? new Date(now.getTime() + 3_600_000))
    const rotation: GrokRotation = {
      key: decoded.accessToken,
      expiresAt: expiresAt.toISOString(),
      ...(decoded.refreshToken ? { refreshToken: decoded.refreshToken } : {}),
      ...(decoded.idToken ? { idToken: decoded.idToken } : {})
    }
    this.apply(candidate, rotation)

    // Keyed by the login on disk, so a chain of unsaved rotations always resolves to the newest.
    const memoryKey = fingerprint(candidate.entryKey, candidate.diskRefreshToken)
    try {
      await saveGrokRotation(ctx, candidate, rotation)
      this.unsaved.delete(memoryKey)
    } catch (error) {
      // The refreshed token still serves this session; keep it in memory for later refreshes.
      ctx.log.error('auth:grok', `failed to persist rotated credentials; using them for this session only: ${String(error)}`)
      this.unsaved.set(memoryKey, rotation)
    }
    return decoded.accessToken
  }

  private apply(candidate: GrokCandidate, rotation: GrokRotation): void {
    candidate.token = rotation.key
    candidate.entry = {
      ...candidate.entry,
      key: rotation.key,
      expiresAt: rotation.expiresAt,
      ...(rotation.refreshToken ? { refreshToken: rotation.refreshToken } : {}),
      ...(rotation.idToken ? { idToken: rotation.idToken } : {})
    }
  }

  private applyUnsaved(candidate: GrokCandidate): void {
    const rotation = this.unsaved.get(fingerprint(candidate.entryKey, candidate.diskRefreshToken))
    if (rotation) this.apply(candidate, rotation)
  }
}
