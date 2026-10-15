import { isAuthFailure, isSuccess, type HttpResponse } from '../../http'
import { requestFailed } from '../../errors'
import { makeSnapshot, type ProviderContext, type ProviderRuntime } from '../../runtime'
import type { ProviderInfo, ProviderSnapshot } from '../../types'
import { metric } from '../shared'
import { loadSigningKey, ollamaAuthError } from './auth'
import { fetchAccount, fetchBalance } from './client'
import { balanceLines, ollamaPlan, type OllamaPlan } from './mapper'

// Ollama Cloud plan usage, signed with the local Ollama key (upstream OllamaProvider).

/** One notice for every way the plan can go missing: the badge is gone, the meters are current. */
export const PLAN_WARNING = "Couldn't read your Ollama plan. Usage below is still up to date."

export class OllamaProvider implements ProviderRuntime {
  readonly info: ProviderInfo = {
    id: 'ollama',
    displayName: 'Ollama',
    brandColor: '#52525B',
    links: [
      { label: 'Usage', url: 'https://ollama.com/settings' },
      { label: 'API Keys', url: 'https://ollama.com/settings/keys' }
    ],
    // The key exists as soon as Ollama runs, signed in or not: never switch on by itself.
    autoEnable: false
  }

  readonly metrics = [
    metric('Session'),
    metric('Weekly'),
    metric('Monthly', { defaultPinned: true, limitNoun: 'included' }),
    metric('Purchased Credits', { valueWord: 'left', defaultOnDemand: true })
  ]

  /**
   * Always false (upstream): the key on disk can't say whether Ollama Cloud is set up, and probing
   * it would enable Ollama for everyone who only runs local models. The user turns it on.
   */
  async hasLocalCredentials(): Promise<boolean> {
    return false
  }

  async refresh(ctx: ProviderContext): Promise<ProviderSnapshot> {
    const key = await loadSigningKey(ctx)
    if (!key) throw ollamaAuthError.missingKey()

    // The plan is best-effort: its failure never blanks the meters, but it does explain itself.
    const [balance, account] = await Promise.all([fetchBalance(ctx, key), this.account(ctx, key)])
    if (isAuthFailure(balance)) throw ollamaAuthError.notSignedIn()
    if (!isSuccess(balance)) throw requestFailed(balance.status, `balance HTTP ${balance.status}`)
    const lines = balanceLines(balance.text)

    let plan: OllamaPlan = { kind: 'absent' }
    let warning: string | undefined
    if (account.kind === 'failed') {
      ctx.log.warn('ollama', `plan lookup failed (${account.reason}); meters unaffected`)
      warning = PLAN_WARNING
    } else {
      plan = ollamaPlan(account.response.text)
      if (plan.kind === 'unreadable') {
        ctx.log.warn('ollama', 'plan response unreadable; meters unaffected')
        warning = PLAN_WARNING
      }
    }
    return makeSnapshot(this.info, ctx, { lines, ...(plan.kind === 'named' ? { plan: plan.name } : {}), ...(warning ? { warning } : {}) })
  }

  private async account(ctx: ProviderContext, key: Parameters<typeof fetchAccount>[1]): Promise<{ kind: 'ok'; response: HttpResponse } | { kind: 'failed'; reason: string }> {
    try {
      const response = await fetchAccount(ctx, key)
      return isSuccess(response) ? { kind: 'ok', response } : { kind: 'failed', reason: `HTTP ${response.status}` }
    } catch (error) {
      return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) }
    }
  }
}
