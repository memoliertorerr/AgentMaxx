import type { HttpResponse } from '../../http'
import { asNumber, asObject, asString, parseJson } from '../../parse'
import type { ProviderContext } from '../../runtime'
import { formEncode } from '../shared'

// Grok's CLI proxy and xAI's token endpoint (upstream GrokUsageClient). The credits call is the
// exact one the Grok CLI itself makes (`/billing?format=credits`).

export const CREDITS_CONFIG_URL = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits'
export const SETTINGS_URL = 'https://cli-chat-proxy.grok.com/v1/settings'
export const REFRESH_URL = 'https://auth.x.ai/oauth2/token'
export const TOKEN_AUTH_HEADER = 'xai-grok-cli'

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken.trim()}`,
    'X-XAI-Token-Auth': TOKEN_AUTH_HEADER,
    Accept: 'application/json',
    'User-Agent': 'UsageMaxx'
  }
}

export function fetchCreditsConfig(ctx: ProviderContext, accessToken: string): Promise<HttpResponse> {
  return ctx.http.request({ url: CREDITS_CONFIG_URL, headers: authHeaders(accessToken), timeoutMs: 10_000 }, ctx.signal)
}

export function fetchSettings(ctx: ProviderContext, accessToken: string): Promise<HttpResponse> {
  return ctx.http.request({ url: SETTINGS_URL, headers: authHeaders(accessToken), timeoutMs: 10_000 }, ctx.signal)
}

export function requestGrokRefresh(ctx: ProviderContext, refreshToken: string, clientId: string): Promise<HttpResponse> {
  return ctx.http.request(
    {
      url: REFRESH_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formEncode([
        ['grant_type', 'refresh_token'],
        ['client_id', clientId],
        ['refresh_token', refreshToken]
      ]),
      timeoutMs: 15_000
    },
    ctx.signal
  )
}

export interface GrokRefreshResponse {
  accessToken: string
  refreshToken?: string
  idToken?: string
  /** Seconds. */
  expiresIn?: number
}

export function decodeRefreshResponse(text: string): GrokRefreshResponse | undefined {
  const body = asObject(parseJson(text))
  const accessToken = asString(body?.access_token)
  if (!body || !accessToken) return undefined
  const refreshToken = asString(body.refresh_token)
  const idToken = asString(body.id_token)
  const expiresIn = asNumber(body.expires_in)
  return {
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    ...(idToken ? { idToken } : {}),
    ...(expiresIn !== undefined ? { expiresIn } : {})
  }
}
