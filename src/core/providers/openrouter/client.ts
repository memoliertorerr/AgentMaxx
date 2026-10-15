import type { HttpResponse } from '../../http'
import type { ProviderContext } from '../../runtime'

// The two OpenRouter REST calls (upstream OpenRouterUsageClient). They're fetched independently:
// OpenRouter gates some endpoints to specific key types, so one failing mustn't hide the other.

/** Account-wide `total_credits` and `total_usage`. */
export const CREDITS_URL = 'https://openrouter.ai/api/v1/credits'
/** Key metadata: tier, period spend, and an optional per-key cap. */
export const KEY_URL = 'https://openrouter.ai/api/v1/key'

export function fetchOpenRouter(ctx: ProviderContext, url: string, apiKey: string): Promise<HttpResponse> {
  return ctx.http.request(
    { url, headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, timeoutMs: 15_000 },
    ctx.signal
  )
}
