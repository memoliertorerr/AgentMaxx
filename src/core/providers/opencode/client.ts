import type { HttpResponse } from '../../http'
import type { ProviderContext } from '../../runtime'

// OpenCode's official Go usage endpoint, called with the local `opencode-go` key.

export const USAGE_URL = 'https://opencode.ai/zen/go/v1/usage'

export function fetchGoUsage(ctx: ProviderContext, apiKey: string): Promise<HttpResponse> {
  return ctx.http.request({ url: USAGE_URL, headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' }, timeoutMs: 15_000 }, ctx.signal)
}
