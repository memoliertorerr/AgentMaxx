import { ProviderError } from '../../errors'
import { isAuthFailure, isSuccess } from '../../http'
import { makeSnapshot, type ProviderContext, type ProviderRuntime } from '../../runtime'
import type { ProviderInfo, ProviderSnapshot } from '../../types'
import { metric } from '../shared'
import { devinAuthError, effectiveApiServerUrl, loadDevinAppAuth, loadDevinCliAuth, type DevinAuth } from './auth'
import { fetchUserStatus } from './client'
import { devinUsageError, mapUserStatusBody, type DevinMappedUsage } from './mapper'

// Devin quota from the Devin CLI's or app's login (upstream DevinProvider). There's no token
// refresh: a 401/403 moves on to the next auth source instead.

type Attempt = { kind: 'success'; mapped: DevinMappedUsage } | { kind: 'authFailure' } | { kind: 'unavailable'; error: unknown }

export class DevinProvider implements ProviderRuntime {
  readonly info: ProviderInfo = {
    id: 'devin',
    displayName: 'Devin',
    brandColor: '#1F7A6D',
    links: [{ label: 'Dashboard', url: 'https://app.devin.ai/settings/plans' }],
    autoEnable: true
  }

  readonly metrics = [
    metric('Daily quota', { title: 'Daily' }),
    metric('Weekly quota', { title: 'Weekly' }),
    metric('Extra usage balance', { title: 'Extra Balance', valueWord: 'left', defaultOnDemand: true })
  ]

  async hasLocalCredentials(ctx: ProviderContext): Promise<boolean> {
    try {
      return (await loadDevinCliAuth(ctx)) !== undefined || (await loadDevinAppAuth(ctx)) !== undefined
    } catch {
      return false
    }
  }

  async refresh(ctx: ProviderContext): Promise<ProviderSnapshot> {
    let sawKey = false
    let sawAuthFailure = false
    let firstFailure: unknown

    const record = (attempt: Attempt): ProviderSnapshot | undefined => {
      if (attempt.kind === 'success') return makeSnapshot(this.info, ctx, { plan: attempt.mapped.plan, lines: attempt.mapped.lines })
      if (attempt.kind === 'authFailure') sawAuthFailure = true
      else firstFailure ??= attempt.error
      return undefined
    }

    const cli = await loadDevinCliAuth(ctx)
    if (cli) {
      sawKey = true
      const snapshot = record(await this.attempt(ctx, cli))
      if (snapshot) return snapshot
    }
    const app = await loadDevinAppAuth(ctx)
    if (app && (!cli || app.apiKey !== cli.apiKey || effectiveApiServerUrl(app) !== effectiveApiServerUrl(cli))) {
      sawKey = true
      const snapshot = record(await this.attempt(ctx, app))
      if (snapshot) return snapshot
    }

    if (sawAuthFailure || !sawKey) throw devinAuthError.notLoggedIn()
    // A connection problem says so, rather than hiding behind "quota unavailable".
    if (firstFailure instanceof ProviderError && (firstFailure.category === 'network' || firstFailure.category === 'timeout')) throw firstFailure
    throw devinUsageError.quotaUnavailable()
  }

  private async attempt(ctx: ProviderContext, auth: DevinAuth): Promise<Attempt> {
    try {
      const response = await fetchUserStatus(ctx, auth)
      if (isAuthFailure(response)) {
        ctx.log.info('devin', `GetUserStatus rejected the ${auth.source} key (HTTP ${response.status})`)
        return { kind: 'authFailure' }
      }
      if (!isSuccess(response)) {
        ctx.log.warn('devin', `GetUserStatus HTTP ${response.status} with the ${auth.source} key`)
        return { kind: 'unavailable', error: undefined }
      }
      return { kind: 'success', mapped: mapUserStatusBody(response.text) }
    } catch (error) {
      ctx.log.warn('devin', `GetUserStatus failed with the ${auth.source} key: ${error instanceof ProviderError ? (error.detail ?? error.message) : String(error)}`)
      return { kind: 'unavailable', error }
    }
  }
}
