import { ProviderError, requestFailed } from '../../errors'
import { isAuthFailure, isSuccess } from '../../http'
import { parseJson } from '../../parse'
import { makeSnapshot, type ProviderContext, type ProviderRuntime } from '../../runtime'
import type { ProviderInfo, ProviderSnapshot } from '../../types'
import { hasApiKey, metric, resolveApiKey } from '../shared'
import { QUOTA_URL, SUBSCRIPTION_URL, fetchZai } from './client'
import { isNoCodingPlan, mapZaiQuota, parseZaiBody, planName } from './mapper'

// Z.ai GLM Coding Plan quotas from the user's API key (upstream ZAIProvider).

export const zaiError = {
  missingKey: () => new ProviderError('notLoggedIn', 'No Z.ai API key. Add one in Settings → API Keys or set ZAI_API_KEY.'),
  invalidKey: () => new ProviderError('authInvalid', 'Z.ai API key invalid. Check your key at z.ai/manage-apikey/apikey-list.'),
  noCodingPlan: () => new ProviderError('notAvailable', 'No active GLM Coding Plan. Subscribe at z.ai/subscribe to see usage.')
}

export class ZaiProvider implements ProviderRuntime {
  readonly info: ProviderInfo = {
    id: 'zai',
    displayName: 'Z.ai',
    brandColor: '#2D2D8F',
    links: [
      { label: 'Dashboard', url: 'https://z.ai/manage-apikey/coding-plan/personal/my-plan' },
      { label: 'API Keys', url: 'https://z.ai/manage-apikey/apikey-list' }
    ],
    autoEnable: true
  }

  readonly metrics = [
    metric('Session', { defaultPinned: true }),
    metric('Weekly', { defaultPinned: true }),
    metric('Web Searches', { defaultOnDemand: true })
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
    if (!apiKey) throw zaiError.missingKey()
    ctx.log.debug('auth:zai', `key source: ${apiKey.source}`)

    // The plan name is best-effort: its failure never blanks the meters.
    const [quota, plan] = await Promise.all([fetchZai(ctx, QUOTA_URL, apiKey.value), this.plan(ctx, apiKey.value)])
    if (isAuthFailure(quota)) throw zaiError.invalidKey()
    if (!isSuccess(quota)) throw requestFailed(quota.status, `quota HTTP ${quota.status}`)

    const body = parseZaiBody(quota.text)
    // A valid key on an account without a GLM Coding Plan: say so instead of blank meters.
    if (isNoCodingPlan(body)) throw zaiError.noCodingPlan()
    const lines = mapZaiQuota(body)
    return makeSnapshot(this.info, ctx, { lines, ...(plan ? { plan } : {}) })
  }

  private async plan(ctx: ProviderContext, apiKey: string): Promise<string | undefined> {
    try {
      const response = await fetchZai(ctx, SUBSCRIPTION_URL, apiKey)
      return isSuccess(response) ? planName(parseJson(response.text)) : undefined
    } catch (error) {
      ctx.log.info('zai', `subscription lookup failed; no plan name this refresh: ${String(error)}`)
      return undefined
    }
  }
}
