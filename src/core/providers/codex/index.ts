import { requestFailed } from '../../errors'
import { fetchWithTokenRefresh, isSuccess, jsonObject } from '../../http'
import { makeSnapshot, type ProviderContext, type ProviderRuntime } from '../../runtime'
import type { ProviderInfo, ProviderSnapshot } from '../../types'
import { metric } from '../shared'
import {
  allowsFallback,
  codexAuthError,
  loadCodexCredentialAt,
  loadCodexCredentials,
  needsRefresh,
  saveRotatedCodexTokens,
  type CodexCredential
} from './auth'
import { fetchCodexUsage, refreshCodexToken } from './client'
import { mapCodexUsage } from './mapper'

// ChatGPT/Codex subscription limits from the Codex CLI's login (upstream CodexProvider).

export class CodexProvider implements ProviderRuntime {
  readonly info: ProviderInfo = {
    id: 'codex',
    displayName: 'Codex',
    brandColor: '#10A37F',
    links: [
      { label: 'Status', url: 'https://status.openai.com/' },
      { label: 'Dashboard', url: 'https://chatgpt.com/settings/usage' }
    ],
    autoEnable: true
  }

  readonly metrics = [
    metric('Session', { defaultPinned: true }),
    metric('Weekly', { defaultPinned: true }),
    metric('Spark', { defaultOnDemand: true }),
    metric('Spark Weekly', { defaultOnDemand: true }),
    metric('Credits', { title: 'Extra Usage', defaultOnDemand: true }),
    metric('Rate Limit Resets', { defaultOnDemand: true })
  ]

  async hasLocalCredentials(ctx: ProviderContext): Promise<boolean> {
    try {
      return (await loadCodexCredentials(ctx)).some((credential) => Boolean(credential.tokens.accessToken))
    } catch {
      return false
    }
  }

  async refresh(ctx: ProviderContext): Promise<ProviderSnapshot> {
    const candidates = await loadCodexCredentials(ctx)
    let lastFallback: unknown
    for (const candidate of candidates) {
      try {
        return await this.probe(ctx, candidate)
      } catch (error) {
        if (!allowsFallback(error)) throw error
        ctx.log.warn('auth:codex', 'a Codex login failed; trying the next home if any')
        lastFallback = error
      }
    }
    throw lastFallback ?? codexAuthError.notLoggedIn()
  }

  private async probe(ctx: ProviderContext, loaded: CodexCredential): Promise<ProviderSnapshot> {
    if (!loaded.tokens.accessToken) {
      throw loaded.apiKey ? codexAuthError.usageApiKey() : codexAuthError.notLoggedIn()
    }
    // `working` is the credential in use; `onDisk` is what the file held when last read or written.
    let working = loaded
    let onDisk = loaded

    if (needsRefresh(working, ctx.now())) {
      // The CLI may already have rotated the token on disk; refreshing our stale copy would send
      // a used refresh token and trip `refresh_token_reused`.
      const live = await loadCodexCredentialAt(ctx, working.file.path)
      if (live?.tokens.accessToken) {
        working = live
        onDisk = live
      }
    }

    const rotate = async (): Promise<string> => {
      const refreshToken = working.tokens.refreshToken
      if (!refreshToken) throw codexAuthError.tokenExpired()
      const refreshed = await refreshCodexToken(ctx, refreshToken)
      const rotated = { ...working, tokens: { ...working.tokens, ...refreshed } }
      try {
        onDisk = await saveRotatedCodexTokens(ctx, onDisk, refreshed, ctx.now().toISOString())
      } catch (error) {
        if (allowsFallback(error)) throw error
        ctx.log.error('auth:codex', `failed to persist rotated credentials; using them for this session only: ${String(error)}`)
      }
      working = rotated
      return refreshed.accessToken
    }

    let accessToken = working.tokens.accessToken ?? ''
    if (needsRefresh(working, ctx.now()) && working.tokens.refreshToken) accessToken = await rotate()

    const response = await fetchWithTokenRefresh({
      token: accessToken,
      attempt: (token) => fetchCodexUsage(ctx, token, working.tokens.accountId),
      refreshAccessToken: rotate,
      authExpired: codexAuthError.tokenExpired
    })
    if (!isSuccess(response)) throw requestFailed(response.status, `usage HTTP ${response.status}`)
    const mapped = mapCodexUsage(jsonObject(response, 'Codex usage'), response.headers, ctx.now())
    return makeSnapshot(this.info, ctx, mapped)
  }
}
