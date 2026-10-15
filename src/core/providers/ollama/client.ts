import type { HttpResponse } from '../../http'
import type { ProviderContext } from '../../runtime'
import { ollamaAuthorization, type OllamaSigningKey } from './openssh'

// ollama.com's account endpoints, signed exactly as the Ollama CLI signs them (upstream
// OllamaUsageClient). The signed URI carries a `ts` unix-seconds parameter, which stops a captured
// header from being replayed later.

export const OLLAMA_HOST = 'https://ollama.com'
export const BALANCE_PATH = '/api/balance'
export const ACCOUNT_PATH = '/api/me'

function send(ctx: ProviderContext, method: 'GET' | 'POST', path: string, key: OllamaSigningKey): Promise<HttpResponse> {
  const requestUri = `${path}?ts=${Math.floor(ctx.now().getTime() / 1000)}`
  // The signature covers the exact URI on the wire, so the URL is built from the same string.
  return ctx.http.request(
    { url: OLLAMA_HOST + requestUri, method, headers: { Authorization: ollamaAuthorization(key, method, requestUri), Accept: 'application/json' }, timeoutMs: 15_000 },
    ctx.signal
  )
}

/** Included and purchased credits. Required. */
export function fetchBalance(ctx: ProviderContext, key: OllamaSigningKey): Promise<HttpResponse> {
  return send(ctx, 'GET', BALANCE_PATH, key)
}

/** The account, for the plan name only. */
export function fetchAccount(ctx: ProviderContext, key: OllamaSigningKey): Promise<HttpResponse> {
  return send(ctx, 'POST', ACCOUNT_PATH, key)
}
