import path from 'node:path'
import { SnapshotCache } from '../core/cache'
import { nodeFileSystem } from '../core/fs'
import { RefreshEngine } from '../core/refresh'
import type { Logger, ProviderContext, ProviderRuntime } from '../core/runtime'
import type { Settings } from '../core/settings'
import { SettingsStore } from '../core/settingsStore'
import { buildAppState, type AppState } from '../core/state'

// Wires the refresh engine, snapshot cache, and settings to the app's user-data folder and
// publishes one AppState to the tray and the renderer.

const CACHE_SAVE_DELAY_MS = 1000

export interface AppStoreOptions {
  providers: readonly ProviderRuntime[]
  userDataDir: string
  log: Logger
  version: string
  demo: boolean
  makeContext: (options: { signal: AbortSignal; manual: boolean }) => ProviderContext
}

export class AppStore {
  private readonly engine: RefreshEngine
  private readonly cache: SnapshotCache
  private readonly settingsStore: SettingsStore
  private readonly listeners = new Set<(state: AppState) => void>()
  private cacheTimer: ReturnType<typeof setTimeout> | undefined
  private lastSnapshots: string | undefined

  private constructor(
    private readonly options: AppStoreOptions,
    private settings: Settings
  ) {
    this.engine = new RefreshEngine({
      providers: options.providers,
      makeContext: options.makeContext,
      now: () => new Date(),
      log: options.log
    })
    this.cache = new SnapshotCache(nodeFileSystem, path.join(options.userDataDir, 'snapshots.json'), options.log)
    this.settingsStore = new SettingsStore(nodeFileSystem, path.join(options.userDataDir, 'settings.json'), options.log)
    this.engine.onChange(() => {
      this.scheduleCacheSave()
      this.publish()
    })
  }

  static async create(options: AppStoreOptions): Promise<AppStore> {
    const settingsStore = new SettingsStore(nodeFileSystem, path.join(options.userDataDir, 'settings.json'), options.log)
    const settings = await settingsStore.load()
    const store = new AppStore(options, settings)
    store.engine.seed(await store.cache.load())
    store.engine.setEnabled(settings.enabledProviders ?? [])
    return store
  }

  get providers(): readonly ProviderRuntime[] {
    return this.options.providers
  }

  getSettings(): Settings {
    return this.settings
  }

  getState(): AppState {
    return buildAppState({
      version: this.options.version,
      providers: this.options.providers,
      states: (id) => this.engine.state(id),
      settings: this.settings,
      now: new Date(),
      intervalMs: this.engine.intervalMs,
      ...(this.engine.nextRefreshAt ? { nextRefreshAt: this.engine.nextRefreshAt } : {}),
      demo: this.options.demo
    })
  }

  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    this.engine.start()
  }

  async stop(): Promise<void> {
    this.engine.stop()
    if (this.cacheTimer) {
      clearTimeout(this.cacheTimer)
      this.cacheTimer = undefined
      await this.saveCache()
    }
  }

  refreshAll(manual: boolean): Promise<void> {
    return this.engine.refreshAll({ force: manual, manual })
  }

  refreshProvider(id: string): Promise<void> {
    return this.engine.refreshOne(id, { manual: true })
  }

  /** Applies a settings change, persists it, and updates the enabled providers. */
  async updateSettings(change: (current: Settings) => Settings): Promise<void> {
    this.settings = change(this.settings)
    this.engine.setEnabled(this.settings.enabledProviders ?? [])
    this.publish()
    try {
      await this.settingsStore.save(this.settings)
    } catch (error) {
      this.options.log.error('settings', `couldn't save settings: ${String(error)}`)
    }
  }

  private publish(): void {
    if (this.listeners.size === 0) return
    const state = this.getState()
    for (const listener of this.listeners) listener(state)
  }

  private scheduleCacheSave(): void {
    if (this.cacheTimer) return
    this.cacheTimer = setTimeout(() => {
      this.cacheTimer = undefined
      void this.saveCache()
    }, CACHE_SAVE_DELAY_MS)
  }

  private async saveCache(): Promise<void> {
    const snapshots = this.engine.snapshots()
    const serialized = JSON.stringify(snapshots)
    if (serialized === this.lastSnapshots) return
    try {
      await this.cache.save(snapshots)
      this.lastSnapshots = serialized
    } catch (error) {
      this.options.log.warn('cache', `couldn't save the snapshot cache: ${String(error)}`)
    }
  }
}
