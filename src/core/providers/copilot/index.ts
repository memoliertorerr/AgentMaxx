import { invalidResponse, requestFailed } from '../../errors'
import { isAuthFailure, isSuccess, jsonObject, type HttpResponse } from '../../http'
import { parseJson } from '../../parse'
import { makeSnapshot, type ProviderContext, type ProviderRuntime } from '../../runtime'
import type { MetricLine, ProviderInfo, ProviderSnapshot } from '../../types'
import { metric } from '../shared'
import { copilotAuthError, loadCopilotToken } from './auth'
import { mapCopilotUsage, orgBillingLines, orgLogins } from './mapper'

// GitHub Copilot quota from a token Copilot tooling already stored (upstream CopilotProvider).

const USAGE_URL = 'https://api.github.com/copilot_internal/user'
const ORGS_URL = 'https://api.github.com/user/orgs?per_page=100'

export class CopilotProvider implements ProviderRuntime {
  readonly info: ProviderInfo = {
    id: 'copilot',
    displayName: 'Copilot',
    brandColor: '#6E40C9',
    links: [
      { label: 'Status', url: 'https://www.githubstatus.com/' },
      { label: 'Dashboard', url: 'https://github.com/settings/billing' }
    ],
    autoEnable: true
  }

  readonly metrics = [
    metric('Credits', { defaultPinned: true }),
    metric('Extra Usage'),
    metric('Org Credits', { defaultOnDemand: true }),
    metric('Org Spend', { valueWord: 'spent', defaultOnDemand: true }),
    metric('Chat', { defaultOnDemand: true }),
    metric('Completions', { defaultOnDemand: true })
  ]

  /** The org whose billing reported Copilot usage last time, so later refreshes make one call. */
  private billingOrg: string | undefined

  async hasLocalCredentials(ctx: ProviderContext): Promise<boolean> {
    try {
      // Local only: files, the gh CLI, and Credential Manager — never the network.
      return (await loadCopilotToken(ctx)) !== undefined
    } catch {
      return false
    }
  }

  async refresh(ctx: ProviderContext): Promise<ProviderSnapshot> {
    const token = await loadCopilotToken(ctx)
    if (!token) throw copilotAuthError.notLoggedIn()
    ctx.log.debug('auth:copilot', `token source: ${token.source}`)

    const response = await this.get(ctx, USAGE_URL, token.value, {
      Accept: 'application/json',
      'Editor-Version': 'vscode/1.96.2',
      'Editor-Plugin-Version': 'copilot-chat/0.26.7',
      'User-Agent': 'GitHubCopilotChat/0.26.7',
      'X-Github-Api-Version': '2025-04-01'
    })
    if (isAuthFailure(response)) throw copilotAuthError.tokenInvalid()
    if (!isSuccess(response)) throw requestFailed(response.status, `usage HTTP ${response.status}`)

    const mapped = mapCopilotUsage(jsonObject(response, 'Copilot usage'))
    const lines = mapped.isOrgManagedSeat ? [...mapped.lines, ...(await this.orgLines(ctx, token.value))] : mapped.lines
    return makeSnapshot(this.info, ctx, { lines, ...(mapped.plan ? { plan: mapped.plan } : {}) })
  }

  private get(ctx: ProviderContext, url: string, token: string, headers: Record<string, string>): Promise<HttpResponse> {
    return ctx.http.request({ url, headers: { Authorization: `token ${token}`, ...headers }, timeoutMs: 15_000 }, ctx.signal)
  }

  private billingGet(ctx: ProviderContext, url: string, token: string): Promise<HttpResponse> {
    return this.get(ctx, url, token, {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AgentMaxx',
      'X-GitHub-Api-Version': '2022-11-28'
    })
  }

  /** Org Credits / Org Spend for org-managed seats. Best-effort: never fails the card. */
  private async orgLines(ctx: ProviderContext, token: string): Promise<MetricLine[]> {
    if (this.billingOrg) {
      try {
        const lines = await this.orgUsage(ctx, this.billingOrg, token)
        if (lines) return lines
        this.billingOrg = undefined
      } catch (error) {
        ctx.log.warn('copilot', `org billing lookup failed for the remembered org: ${String(error)}`)
        return []
      }
    }
    let orgs: string[]
    try {
      const response = await this.billingGet(ctx, ORGS_URL, token)
      if (response.status !== 200) {
        // 403: the token can't list orgs (common for editor tokens). Expected, not an error.
        ctx.log.info('copilot', `org list HTTP ${response.status}; skipping org billing lookup`)
        return []
      }
      orgs = orgLogins(parseJson(response.text))
    } catch (error) {
      ctx.log.warn('copilot', `org list fetch failed: ${String(error)}`)
      return []
    }
    for (const org of orgs) {
      try {
        const lines = await this.orgUsage(ctx, org, token)
        if (lines) {
          this.billingOrg = org
          return lines
        }
      } catch (error) {
        ctx.log.warn('copilot', `org billing summary failed for one org; trying the next: ${String(error)}`)
      }
    }
    return []
  }

  private async orgUsage(ctx: ProviderContext, org: string, token: string): Promise<MetricLine[] | undefined> {
    const response = await this.billingGet(ctx, `https://api.github.com/orgs/${encodeURIComponent(org)}/settings/billing/usage/summary`, token)
    if (response.status !== 200) {
      if (response.status === 429 || response.status >= 500) throw requestFailed(response.status)
      return undefined
    }
    const body = parseJson(response.text)
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw invalidResponse('org billing summary is not an object')
    return orgBillingLines(body as Record<string, unknown>)
  }
}
