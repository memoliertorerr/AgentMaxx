import { requestFailed } from '../../errors'
import { isSuccess, type HttpResponse } from '../../http'
import { asObject, asString, parseJson } from '../../parse'
import type { ProviderContext } from '../../runtime'
import { codexAuthError } from './auth'

// ChatGPT's Codex usage endpoint and OpenAI's token refresh (upstream CodexUsageClient).

export const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann'
const REFRESH_URL = 'https://auth.openai.com/oauth/token'
const USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage'
const USER_AGENT = 'AgentMaxx'

export function fetchCodexUsage(ctx: ProviderContext, accessToken: string, accountId: string | undefined): Promise<HttpResponse> {
  return ctx.http.request(
    {
      url: USAGE_URL,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
        ...(accountId ? { 'ChatGPT-Account-Id': accountId } : {})
      },
      timeoutMs: 10_000
    },
    ctx.signal
  )
}

export interface CodexRefreshResult {
  accessToken: string
  refreshToken?: string
  idToken?: string
}

function errorCode(text: string): string | undefined {
  const body = asObject(parseJson(text))
  if (!body) return undefined
  const error = body.error
  const nested = asObject(error)
  return asString(nested?.code) ?? asString(nested?.error) ?? asString(error) ?? asString(body.code)
}

export async function refreshCodexToken(ctx: ProviderContext, refreshToken: string): Promise<CodexRefreshResult> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: CODEX_CLIENT_ID, refresh_token: refreshToken })
  const response = await ctx.http.request(
    {
      url: REFRESH_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      timeoutMs: 15_000
    },
    ctx.signal
  )
  if (response.status === 400 || response.status === 401) {
    switch (errorCode(response.text)) {
      case 'refresh_token_expired':
        throw codexAuthError.sessionExpired()
      case 'refresh_token_reused':
        throw codexAuthError.tokenConflict()
      case 'refresh_token_invalidated':
        throw codexAuthError.tokenRevoked()
      default:
        // No recognized OAuth code (often a proxy page): report the status, not an expired login.
        throw requestFailed(response.status, `token refresh HTTP ${response.status}`)
    }
  }
  if (!isSuccess(response)) throw requestFailed(response.status, `token refresh HTTP ${response.status}`)
  const json = asObject(parseJson(response.text))
  const accessToken = asString(json?.access_token)
  if (!accessToken) throw codexAuthError.tokenExpired()
  const nextRefresh = asString(json?.refresh_token)
  const idToken = asString(json?.id_token)
  return { accessToken, ...(nextRefresh ? { refreshToken: nextRefresh } : {}), ...(idToken ? { idToken } : {}) }
}
