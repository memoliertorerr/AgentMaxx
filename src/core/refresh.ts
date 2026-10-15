import { ProviderError, toErrorInfo, type ErrorInfo } from './errors'
import type { Logger, ProviderContext, ProviderRuntime } from './runtime'
import type { ProviderSnapshot } from './types'

// The refresh loop (upstream docs/refreshing.md): every enabled provider refreshes in parallel
// at launch and every five minutes; a provider that hangs is given up on after two minutes; a
// failed refresh keeps the last good values and records the error beside them.

export const REFRESH_INTERVAL_MS = 5 * 60_000
export const PROVIDER_TIMEOUT_MS = 120_000

export interface ProviderState {
  snapshot?: ProviderSnapshot
  /** ISO time of the last successful refresh in this session. */
  lastSuccessAt?: string
  /** True while the snapshot came from the disk cache and hasn't been refreshed this session. */
  fromPreviousSession: boolean
  refreshing: boolean
  error?: ErrorInfo
}

export interface RefreshEngineOptions {
  providers: readonly ProviderRuntime[]
  makeContext: (options: { signal: AbortSignal; manual: boolean }) => ProviderContext
  now: () => Date
  log: Logger
  intervalMs?: number
  timeoutMs?: number
}

export class RefreshEngine {
  private readonly providers: ReadonlyMap<string, ProviderRuntime>
  private readonly states = new Map<string, ProviderState>()
  private readonly inFlight = new Map<string, Promise<void>>()
  private readonly listeners = new Set<() => void>()
  private enabled = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private running = false
  private batch: Promise<void> | undefined
  private nextRefresh: Date | undefined
  readonly intervalMs: number
  private readonly timeoutMs: number

  constructor(private readonly options: RefreshEngineOptions) {
    this.providers = new Map(options.providers.map((provider) => [provider.info.id, provider]))
    this.intervalMs = options.intervalMs ?? REFRESH_INTERVAL_MS
    this.timeoutMs = options.timeoutMs ?? PROVIDER_TIMEOUT_MS
    for (const id of this.providers.keys()) this.states.set(id, { fromPreviousSession: false, refreshing: false })
  }

  /** Shows cached snapshots immediately; they still refetch on the first pass. */
  seed(cached: Readonly<Record<string, ProviderSnapshot>>): void {
    for (const [id, snapshot] of Object.entries(cached)) {
      const state = this.states.get(id)
      if (!state) continue
      this.states.set(id, { ...state, snapshot, fromPreviousSession: true })
    }
    this.emit()
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  state(id: string): ProviderState | undefined {
    return this.states.get(id)
  }

  get nextRefreshAt(): Date | undefined {
    return this.nextRefresh
  }

  get enabledIds(): readonly string[] {
    return [...this.enabled]
  }

  /** Last good snapshot per provider, for the disk cache. */
  snapshots(): Record<string, ProviderSnapshot> {
    const result: Record<string, ProviderSnapshot> = {}
    for (const [id, state] of this.states) if (state.snapshot) result[id] = state.snapshot
    return result
  }

  /** Sets the enabled providers. A newly enabled provider refreshes right away (when running). */
  setEnabled(ids: readonly string[]): void {
    const next = new Set(ids.filter((id) => this.providers.has(id)))
    const added = [...next].filter((id) => !this.enabled.has(id))
    this.enabled = next
    this.emit()
    if (this.running) for (const id of added) void this.refreshOne(id)
  }

  /** Starts the loop: a pass now, then one every interval after each pass finishes. */
  start(): void {
    if (this.running) return
    this.running = true
    void this.loop()
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.nextRefresh = undefined
  }

  private async loop(): Promise<void> {
    if (!this.running) return
    await this.refreshAll()
    if (!this.running) return
    this.nextRefresh = new Date(this.options.now().getTime() + this.intervalMs)
    this.emit()
    this.timer = setTimeout(() => void this.loop(), this.intervalMs)
  }

  /**
   * Refreshes every enabled provider in parallel and resolves when all have finished. Without
   * `force`, a provider refreshed successfully within the last interval is skipped.
   */
  refreshAll(options: { force?: boolean; manual?: boolean } = {}): Promise<void> {
    if (this.batch) return this.batch
    const now = this.options.now().getTime()
    const due = [...this.enabled].filter((id) => {
      if (options.force) return true
      const last = this.states.get(id)?.lastSuccessAt
      return !last || now - Date.parse(last) >= this.intervalMs * 0.9
    })
    this.batch = Promise.all(due.map((id) => this.refreshOne(id, { manual: options.manual ?? false }))).then(() => {
      this.batch = undefined
    })
    return this.batch
  }

  /** Refreshes one provider; joins the refresh already in flight for it, if any. */
  refreshOne(id: string, options: { manual?: boolean } = {}): Promise<void> {
    const existing = this.inFlight.get(id)
    if (existing) return existing
    const provider = this.providers.get(id)
    if (!provider) return Promise.resolve()
    const run = this.run(provider, options.manual ?? false).finally(() => this.inFlight.delete(id))
    this.inFlight.set(id, run)
    return run
  }

  private async run(provider: ProviderRuntime, manual: boolean): Promise<void> {
    const id = provider.info.id
    this.update(id, { refreshing: true })
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new ProviderError('timeout', `Refresh timed out after ${Math.round(this.timeoutMs / 1000)}s`))
      }, this.timeoutMs)
    })
    try {
      const context = this.options.makeContext({ signal: controller.signal, manual })
      const snapshot = await Promise.race([provider.refresh(context), timeout])
      const { error: _cleared, ...rest } = this.states.get(id) ?? { fromPreviousSession: false, refreshing: false }
      this.states.set(id, {
        ...rest,
        snapshot,
        lastSuccessAt: this.options.now().toISOString(),
        fromPreviousSession: false,
        refreshing: false
      })
      this.emit()
    } catch (error) {
      const info = toErrorInfo(error)
      this.options.log.warn(`refresh:${id}`, `${info.category}: ${info.detail ?? info.message}`)
      this.update(id, { refreshing: false, error: { message: info.message, category: info.category } })
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private update(id: string, patch: Partial<ProviderState>): void {
    const state = this.states.get(id)
    if (!state) return
    this.states.set(id, { ...state, ...patch })
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error) {
        this.options.log.error('refresh', `change listener failed: ${String(error)}`)
      }
    }
  }
}
