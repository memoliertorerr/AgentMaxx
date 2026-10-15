import type { ErrorInfo } from './errors'
import type { ProviderState } from './refresh'
import type { ProviderRuntime } from './runtime'
import { resolveMetrics, type Settings } from './settings'
import type { MetricLine, ProviderInfo, SessionStartSignal } from './types'

// The read-only picture the renderer and tray draw from. Built by a pure function so the UI
// never reaches into the engine or settings directly. Renderer-safe types only.

export interface MetricView {
  id: string
  enabled: boolean
  onDemand: boolean
  pinned: boolean
  sessionStartSignal?: SessionStartSignal
  /** The snapshot line feeding this metric, when the last refresh produced one. */
  line?: MetricLine
}

export interface ProviderView {
  info: ProviderInfo
  enabled: boolean
  metrics: MetricView[]
  plan?: string
  warning?: string
  refreshing: boolean
  error?: ErrorInfo
  /** Data older than two refresh intervals ("Outdated"). */
  stale: boolean
  /** ISO time of the snapshot on screen. */
  refreshedAt?: string
  hasSnapshot: boolean
  expanded: boolean
}

export interface AppState {
  version: string
  providers: ProviderView[]
  settings: Settings
  /** ISO time of the next automatic refresh. */
  nextRefreshAt?: string
  refreshing: boolean
  /** True until the first-run welcome screen has been answered. */
  firstRun: boolean
  demo: boolean
}

export interface BuildStateInput {
  version: string
  providers: readonly ProviderRuntime[]
  states: (id: string) => ProviderState | undefined
  settings: Settings
  now: Date
  intervalMs: number
  nextRefreshAt?: Date
  demo: boolean
}

export function buildAppState(input: BuildStateInput): AppState {
  const enabled = new Set(input.settings.enabledProviders ?? [])
  const expanded = new Set(input.settings.expandedProviders)
  const staleAfter = input.intervalMs * 2

  const providers = input.providers.map((provider): ProviderView => {
    const id = provider.info.id
    const state = input.states(id)
    const snapshot = state?.snapshot
    const resolved = resolveMetrics(provider.metrics, input.settings.metricPrefs[id])
    const metrics = provider.metrics.map((descriptor, index): MetricView => {
      const flags = resolved[index] ?? { enabled: false, onDemand: false, pinned: false }
      const line = snapshot?.lines.find((candidate) => candidate.label === descriptor.id)
      return {
        id: descriptor.id,
        enabled: flags.enabled,
        onDemand: flags.onDemand,
        pinned: flags.pinned,
        ...(descriptor.sessionStartSignal ? { sessionStartSignal: descriptor.sessionStartSignal } : {}),
        ...(line ? { line } : {})
      }
    })
    const refreshedAt = snapshot?.refreshedAt
    const stale = refreshedAt !== undefined && input.now.getTime() - Date.parse(refreshedAt) > staleAfter
    return {
      info: provider.info,
      enabled: enabled.has(id),
      metrics,
      ...(snapshot?.plan ? { plan: snapshot.plan } : {}),
      ...(snapshot?.warning ? { warning: snapshot.warning } : {}),
      refreshing: state?.refreshing ?? false,
      ...(state?.error ? { error: state.error } : {}),
      stale,
      ...(refreshedAt ? { refreshedAt } : {}),
      hasSnapshot: snapshot !== undefined,
      expanded: expanded.has(id)
    }
  })

  return {
    version: input.version,
    providers,
    settings: input.settings,
    ...(input.nextRefreshAt ? { nextRefreshAt: input.nextRefreshAt.toISOString() } : {}),
    refreshing: providers.some((provider) => provider.enabled && provider.refreshing),
    firstRun: input.settings.enabledProviders === null,
    demo: input.demo
  }
}

export interface PinnedMetric {
  provider: ProviderView
  metric: MetricView
  line: MetricLine
}

/** Pinned metrics that have data, from enabled providers, in provider then metric order. */
export function pinnedMetrics(state: AppState): PinnedMetric[] {
  const result: PinnedMetric[] = []
  for (const provider of state.providers) {
    if (!provider.enabled) continue
    for (const metric of provider.metrics) {
      if (metric.pinned && metric.enabled && metric.line) result.push({ provider, metric, line: metric.line })
    }
  }
  return result
}
