import { requestFailed } from '../../errors'
import { isSuccess } from '../../http'
import { makeSnapshot, type ProviderContext, type ProviderRuntime } from '../../runtime'
import type { ProviderInfo, ProviderSnapshot } from '../../types'
import { metric } from '../shared'
import { loadGoKey, openCodeError } from './auth'
import { fetchGoUsage } from './client'
import { errorType, mapGoUsage, referenceDate } from './mapper'

// OpenCode Go plan windows from OpenCode's usage API (upstream OpenCodeProvider). The local spend
// tiles from OpenCode's SQLite logs are Later.

export class OpenCodeProvider implements ProviderRuntime {
  readonly info: ProviderInfo = {
    id: 'opencode',
    displayName: 'OpenCode',
    brandColor: '#4B5563',
    links: [{ label: 'Dashboard', url: 'https://opencode.ai/auth' }],
    autoEnable: true
  }

  readonly metrics = [metric('Session', { sessionStartSignal: 'missingResetDate' }), metric('Weekly'), metric('Monthly')]

  /** Logs a persistently unreadable auth.json once per run, not on every refresh. */
  private loggedUnreadable = false

  async hasLocalCredentials(ctx: ProviderContext): Promise<boolean> {
    try {
      return (await loadGoKey(ctx)) !== undefined
    } catch {
      // An unreadable auth.json is still an OpenCode install: enable it so the error shows.
      return true
    }
  }

  async refresh(ctx: ProviderContext): Promise<ProviderSnapshot> {
    let key: string | undefined
    try {
      key = await loadGoKey(ctx)
      this.loggedUnreadable = false
    } catch (error) {
      if (!this.loggedUnreadable) {
        this.loggedUnreadable = true
        ctx.log.warn('opencode', `auth.json unreadable: ${String(error)}`)
      }
      throw error
    }
    if (!key) throw openCodeError.notLoggedIn()

    const response = await fetchGoUsage(ctx, key)
    if (response.status === 401) throw openCodeError.unauthorized()
    if (response.status === 403 && errorType(response.text) === 'EntitlementError') {
      ctx.log.info('opencode', 'Go usage endpoint: no active subscription')
      throw openCodeError.noGoSubscription()
    }
    if (!isSuccess(response)) throw requestFailed(response.status, `Go usage HTTP ${response.status}`)
    const lines = mapGoUsage(response.text, referenceDate(response.headers.date, ctx.now()))
    return makeSnapshot(this.info, ctx, { plan: 'Go', lines })
  }
}
