import type { HttpResponse } from '../../http'
import type { ProviderContext } from '../../runtime'

// Z.ai's two internal endpoints, the ones its own subscription page uses (upstream ZAIUsageClient).

/** The active subscription(s); used only for the plan name. */
export const SUBSCRIPTION_URL = 'https://api.z.ai/api/biz/subscription/list'
/** Session, weekly, and web-search quotas. Required. */
export const QUOTA_URL = 'https://api.z.ai/api/monitor/usage/quota/limit'

export function fetchZai(ctx: ProviderContext, url: string, apiKey: string): Promise<HttpResponse> {
  return ctx.http.request(
    { url, headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, timeoutMs: 15_000 },
    ctx.signal
  )
}
