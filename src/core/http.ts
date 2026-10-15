import { ProviderError, invalidResponse, usageErrorText } from './errors'

// The only way providers talk to the network. Injected through the provider context so tests
// substitute a fake and nothing in a test can reach a real API.

export interface HttpRequest {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export interface HttpResponse {
  status: number
  /** Header names are lower-cased. */
  headers: Record<string, string>
  text: string
}

export interface HttpClient {
  request(request: HttpRequest, signal?: AbortSignal): Promise<HttpResponse>
}

export const DEFAULT_HTTP_TIMEOUT_MS = 30_000

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/** Origin + path only, so query strings never reach the log. */
function describe(request: HttpRequest): string {
  try {
    const url = new URL(request.url)
    return `${request.method ?? 'GET'} ${url.origin}${url.pathname}`
  } catch {
    return `${request.method ?? 'GET'} <invalid url>`
  }
}

export function createFetchHttpClient(fetchImpl: FetchLike = (url, init) => fetch(url, init)): HttpClient {
  return {
    async request(request, signal) {
      const timeout = AbortSignal.timeout(request.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS)
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
      try {
        const response = await fetchImpl(request.url, {
          method: request.method ?? 'GET',
          ...(request.headers ? { headers: request.headers } : {}),
          ...(request.body !== undefined ? { body: request.body } : {}),
          signal: combined,
          redirect: 'follow'
        })
        const text = await response.text()
        const headers: Record<string, string> = {}
        response.headers.forEach((value, name) => {
          headers[name.toLowerCase()] = value
        })
        return { status: response.status, headers, text }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        if (signal?.aborted) {
          throw new ProviderError('other', 'Refresh cancelled.', `${describe(request)}: cancelled`)
        }
        if (timeout.aborted) {
          throw new ProviderError('timeout', 'The request timed out. Try again later.', `${describe(request)}: timed out`)
        }
        throw new ProviderError('network', usageErrorText.connectionFailed, `${describe(request)}: ${reason}`)
      }
    }
  }
}

export function isSuccess(response: HttpResponse): boolean {
  return response.status >= 200 && response.status < 300
}

/** 401/403: the credential is bad rather than the request (upstream `ProviderAuthRetry`). */
export function isAuthFailure(response: HttpResponse): boolean {
  return response.status === 401 || response.status === 403
}

/** Parses a JSON object body or throws an invalid-response error naming `what`. */
export function jsonObject(response: HttpResponse, what: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(response.text)
  } catch {
    throw invalidResponse(`${what}: body is not JSON (${response.text.length} bytes, HTTP ${response.status})`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidResponse(`${what}: body is not a JSON object`)
  }
  return parsed as Record<string, unknown>
}

/**
 * The authenticated-fetch sequence OAuth providers share (upstream `ProviderAuthRetry.fetch`):
 * attempt → on 401/403 refresh the token → retry once → a second 401/403 is a hard auth failure.
 * Any other status is returned untouched for the provider to interpret.
 */
export async function fetchWithTokenRefresh(options: {
  token: string
  attempt: (accessToken: string) => Promise<HttpResponse>
  refreshAccessToken: () => Promise<string>
  authExpired: () => ProviderError
}): Promise<HttpResponse> {
  const first = await options.attempt(options.token)
  if (!isAuthFailure(first)) return first
  const refreshed = await options.refreshAccessToken()
  const retried = await options.attempt(refreshed)
  if (isAuthFailure(retried)) throw options.authExpired()
  return retried
}
