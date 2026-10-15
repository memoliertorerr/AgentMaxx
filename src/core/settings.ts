import type { ResetMode, TimeFormat } from './format'
import type { DisplayMode } from './progress'
import type { MetricDescriptor } from './types'

// User settings: which providers are on, per-metric layout overrides, and display preferences.
// Parsing is tolerant — unknown keys are dropped, missing keys default, and a corrupt file
// falls back to defaults rather than crashing (upstream docs/settings.md, provider-enablement.md).

export const SETTINGS_VERSION = 1
export const MAX_PINS_PER_PROVIDER = 2

export type Theme = 'system' | 'light' | 'dark'

/** Per-provider overrides. An absent list means "use the descriptor defaults". */
export interface MetricPrefs {
  enabled?: string[]
  onDemand?: string[]
  pinned?: string[]
}

export interface Settings {
  version: number
  /** Providers currently on. `null` until the first-run welcome screen is answered. */
  enabledProviders: string[] | null
  /** Every provider this install has seen, so new providers can be told apart from switched-off ones. */
  knownProviders: string[]
  metricPrefs: Record<string, MetricPrefs>
  /** Providers whose on-demand caret is open. */
  expandedProviders: string[]
  displayMode: DisplayMode
  resetMode: ResetMode
  timeFormat: TimeFormat
  alwaysShowPacing: boolean
  theme: Theme
  /** Never renew provider logins; an expired one shows the provider's re-login hint. */
  readOnlyLogins: boolean
}

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    enabledProviders: null,
    knownProviders: [],
    metricPrefs: {},
    expandedProviders: [],
    displayMode: 'left',
    resetMode: 'countdown',
    timeFormat: 'auto',
    alwaysShowPacing: false,
    theme: 'system',
    readOnlyLogins: false
  }
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))]
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback
}

function parseMetricPrefs(value: unknown): Record<string, MetricPrefs> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, MetricPrefs> = {}
  for (const [providerId, raw] of Object.entries(value)) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
    const record = raw as Record<string, unknown>
    const prefs: MetricPrefs = {}
    const enabled = stringList(record.enabled)
    const onDemand = stringList(record.onDemand)
    const pinned = stringList(record.pinned)
    if (enabled) prefs.enabled = enabled
    if (onDemand) prefs.onDemand = onDemand
    if (pinned) prefs.pinned = pinned.slice(0, MAX_PINS_PER_PROVIDER)
    result[providerId] = prefs
  }
  return result
}

/** Builds valid settings from anything (a parsed file, an IPC payload merged onto current settings). */
export function normalizeSettings(raw: unknown): Settings {
  const defaults = defaultSettings()
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return defaults
  const record = raw as Record<string, unknown>
  return {
    version: SETTINGS_VERSION,
    enabledProviders: record.enabledProviders === null ? null : (stringList(record.enabledProviders) ?? null),
    knownProviders: stringList(record.knownProviders) ?? [],
    metricPrefs: parseMetricPrefs(record.metricPrefs),
    expandedProviders: stringList(record.expandedProviders) ?? [],
    displayMode: oneOf(record.displayMode, ['used', 'left'] as const, defaults.displayMode),
    resetMode: oneOf(record.resetMode, ['countdown', 'absolute'] as const, defaults.resetMode),
    timeFormat: oneOf(record.timeFormat, ['auto', '12h', '24h'] as const, defaults.timeFormat),
    alwaysShowPacing: typeof record.alwaysShowPacing === 'boolean' ? record.alwaysShowPacing : defaults.alwaysShowPacing,
    theme: oneOf(record.theme, ['system', 'light', 'dark'] as const, defaults.theme),
    readOnlyLogins: typeof record.readOnlyLogins === 'boolean' ? record.readOnlyLogins : defaults.readOnlyLogins
  }
}

export interface ResolvedMetric {
  id: string
  enabled: boolean
  onDemand: boolean
  pinned: boolean
}

/** Applies a provider's overrides to its descriptors, in descriptor order. */
export function resolveMetrics(descriptors: readonly MetricDescriptor[], prefs: MetricPrefs | undefined): ResolvedMetric[] {
  const pinned = prefs?.pinned ?? descriptors.filter((d) => d.defaultPinned).map((d) => d.id)
  return descriptors.map((descriptor) => ({
    id: descriptor.id,
    enabled: prefs?.enabled ? prefs.enabled.includes(descriptor.id) : descriptor.defaultEnabled,
    onDemand: prefs?.onDemand ? prefs.onDemand.includes(descriptor.id) : descriptor.defaultOnDemand,
    pinned: pinned.includes(descriptor.id)
  }))
}

export type PinResult = { ok: true; settings: Settings } | { ok: false; reason: string }

/** Stars or unstars a metric for the tray, enforcing the per-provider limit. */
export function togglePin(
  settings: Settings,
  providerId: string,
  metricId: string,
  descriptors: readonly MetricDescriptor[]
): PinResult {
  const current = resolveMetrics(descriptors, settings.metricPrefs[providerId])
    .filter((metric) => metric.pinned)
    .map((metric) => metric.id)
  let next: string[]
  if (current.includes(metricId)) {
    next = current.filter((id) => id !== metricId)
  } else {
    if (current.length >= MAX_PINS_PER_PROVIDER) {
      return { ok: false, reason: `Up to ${MAX_PINS_PER_PROVIDER} pins per provider` }
    }
    next = [...current, metricId]
  }
  return { ok: true, settings: withMetricPrefs(settings, providerId, { pinned: next }) }
}

/** Sets one metric's enabled or on-demand flag, materializing defaults into explicit lists. */
export function setMetricFlag(
  settings: Settings,
  providerId: string,
  metricId: string,
  flag: 'enabled' | 'onDemand',
  value: boolean,
  descriptors: readonly MetricDescriptor[]
): Settings {
  const resolved = resolveMetrics(descriptors, settings.metricPrefs[providerId])
  const ids = new Set(resolved.filter((metric) => metric[flag]).map((metric) => metric.id))
  if (value) ids.add(metricId)
  else ids.delete(metricId)
  const ordered = descriptors.map((d) => d.id).filter((id) => ids.has(id))
  return withMetricPrefs(settings, providerId, { [flag]: ordered })
}

function withMetricPrefs(settings: Settings, providerId: string, patch: MetricPrefs): Settings {
  return {
    ...settings,
    metricPrefs: { ...settings.metricPrefs, [providerId]: { ...settings.metricPrefs[providerId], ...patch } }
  }
}

/** Turns a provider on or off and records it as known. */
export function setProviderEnabled(settings: Settings, providerId: string, enabled: boolean, order: readonly string[]): Settings {
  const current = new Set(settings.enabledProviders ?? [])
  if (enabled) current.add(providerId)
  else current.delete(providerId)
  return {
    ...settings,
    enabledProviders: order.filter((id) => current.has(id)),
    knownProviders: [...new Set([...settings.knownProviders, providerId])]
  }
}
