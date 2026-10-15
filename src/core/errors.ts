// Refresh failures carry a stable category (upstream `ErrorCategory`) plus a short, friendly
// message for the UI. The technical detail goes to the log only.

export type ErrorCategory =
  | 'notLoggedIn'
  | 'authExpired'
  | 'authInvalid'
  | 'credentialAccess'
  | 'network'
  | 'timeout'
  | 'decoding'
  | 'http4xx'
  | 'http5xx'
  | 'rateLimited'
  | 'notAvailable'
  | 'other'

export class ProviderError extends Error {
  readonly category: ErrorCategory
  /** Technical detail for the log. Never shown to the user, never contains secrets. */
  readonly detail: string | undefined

  constructor(category: ErrorCategory, userMessage: string, detail?: string) {
    super(userMessage)
    this.name = 'ProviderError'
    this.category = category
    this.detail = detail
  }
}

/** Classifies a non-2xx HTTP status (upstream `ErrorCategory.http`). */
export function httpCategory(status: number): ErrorCategory {
  if (status === 429) return 'rateLimited'
  if (status >= 400 && status < 500) return 'http4xx'
  if (status >= 500 && status < 600) return 'http5xx'
  return 'other'
}

/** Shared copy for the usage-error cases every provider repeats (upstream `ProviderUsageErrorText`). */
export const usageErrorText = {
  connectionFailed: 'Usage request failed. Check your connection.',
  invalidResponse: 'Usage response invalid. Try again later.',
  requestFailed: (status: number) => `Usage request failed (HTTP ${status}). Try again later.`
} as const

export function requestFailed(status: number, detail?: string): ProviderError {
  return new ProviderError(httpCategory(status), usageErrorText.requestFailed(status), detail)
}

export function invalidResponse(detail?: string): ProviderError {
  return new ProviderError('decoding', usageErrorText.invalidResponse, detail)
}

export interface ErrorInfo {
  message: string
  category: ErrorCategory
}

/** Normalizes anything thrown during a refresh into what the UI and log need. */
export function toErrorInfo(error: unknown): ErrorInfo & { detail?: string } {
  if (error instanceof ProviderError) {
    return {
      message: error.message,
      category: error.category,
      ...(error.detail !== undefined ? { detail: error.detail } : {})
    }
  }
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return { message: 'Something went wrong. Try refreshing.', category: 'other', detail }
}
