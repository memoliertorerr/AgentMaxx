import { ProviderError, httpCategory } from '../../errors'
import { isAuthFailure, isSuccess } from '../../http'
import type { JsonObject } from '../../parse'
import { makeSnapshot, type ProviderContext, type ProviderRuntime } from '../../runtime'
import type { MetricLine, ProviderInfo, ProviderSnapshot } from '../../types'
import { hasApiKey, metric, resolveApiKey } from '../shared'
import { CREDITS_URL, KEY_URL, fetchOpenRouter } from './client'
import { creditsLines, dataObject, keyMetrics } from './mapper'

// OpenRouter credit balance and spend from the user's API key (upstream OpenRouterProvider).

export const openRouterError = {
  missingKey: () => new ProviderError('notLoggedIn', 'No OpenRouter API key. Add one in Settings → API Keys or set OPENROUTER_API_KEY.'),
  invalidKey: () => new ProviderError('authInvalid', 'OpenRouter API key invalid. Check your key at openrouter.ai/keys.'),
  connectionFailed: (detail?: string) => new ProviderError('network', "Couldn't reach OpenRouter. Check your connection.", detail),
  invalidResponse: (detail?: string) => new ProviderError('decoding', 'OpenRouter usage data unavailable. Try again later.', detail),
  requestFailed: (status: number) => new ProviderError(httpCategory(status), `OpenRouter request failed (HTTP ${status}).`)
}

type EndpointResult = { kind: 'success'; data: JsonObject } | { kind: 'authFailure' } | { kind: 'failed'; error: unknown }

/** One endpoint call, classified so the other endpoint's data still renders when this one fails. */
async function load(ctx: ProviderContext, url: string, apiKey: string): Promise<EndpointResult> {
  try {
    const response = await fetchOpenRouter(ctx, url, apiKey)
    if (isAuthFailure(response)) return { kind: 'authFailure' }
    if (!isSuccess(response)) return { kind: 'failed', error: openRouterError.requestFailed(response.status) }
    const data = dataObject(response.text)
    return data ? { kind: 'success', data } : { kind: 'failed', error: openRouterError.invalidResponse(`${url}: no data object`) }
  } catch (error) {
    if (error instanceof ProviderError && error.category === 'network') {
      return { kind: 'failed', error: openRouterError.connectionFailed(error.detail) }
    }
    return { kind: 'failed', error }
  }
}

export class OpenRouterProvider implements ProviderRuntime {
  readonly info: ProviderInfo = {
    id: 'openrouter',
    displayName: 'OpenRouter',
    brandColor: '#6467F2',
    links: [
      { label: 'Activity', url: 'https://openrouter.ai/activity' },
      { label: 'Credits', url: 'https://openrouter.ai/settings/credits' }
    ],
    autoEnable: true
  }

  readonly metrics = [
    metric('Credits', { defaultPinned: true, limitNoun: 'purchased' }),
    metric('Balance', { valueWord: 'left' }),
    metric('Today', { defaultOnDemand: true }),
    metric('This Week', { defaultOnDemand: true }),
    metric('This Month', { defaultOnDemand: true }),
    metric('Key Limit', { defaultOnDemand: true })
  ]

  async hasLocalCredentials(ctx: ProviderContext): Promise<boolean> {
    try {
      return await hasApiKey(ctx, this.info.id)
    } catch {
      return false
    }
  }

  async refresh(ctx: ProviderContext): Promise<ProviderSnapshot> {
    const apiKey = await resolveApiKey(ctx, this.info.id)
    if (!apiKey) throw openRouterError.missingKey()
    ctx.log.debug('auth:openrouter', `key source: ${apiKey.source}`)

    const [credits, key] = await Promise.all([load(ctx, CREDITS_URL, apiKey.value), load(ctx, KEY_URL, apiKey.value)])
    const lines: MetricLine[] = []
    let plan: string | undefined
    if (credits.kind === 'success') lines.push(...creditsLines(credits.data))
    if (key.kind === 'success') {
      const mapped = keyMetrics(key.data)
      plan = mapped.plan
      lines.push(...mapped.lines)
    }
    if (lines.length > 0) return makeSnapshot(this.info, ctx, { lines, ...(plan ? { plan } : {}) })

    // Only both endpoints rejecting the key means it's invalid: a single 403 can be a gated
    // endpoint for this key type.
    if (credits.kind === 'authFailure' && key.kind === 'authFailure') throw openRouterError.invalidKey()
    if (credits.kind === 'failed') throw credits.error
    if (key.kind === 'failed') throw key.error
    throw openRouterError.invalidResponse('neither endpoint produced a metric')
  }
}
