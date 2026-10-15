import type { ApiKeyStatus } from './apiKeys'
import type { ResetMode, TimeFormat } from './format'
import type { DisplayMode } from './progress'
import { setMetricFlag, setProviderEnabled, togglePin, type Settings, type Theme } from './settings'
import type { AppState } from './state'
import type { MetricDescriptor } from './types'

// The contract between the renderer and the main process. The renderer can only ask for these
// things; main validates every payload (parseSettingsChange) before acting on it.

export const IPC = {
  state: 'usagemaxx:state',
  navigate: 'usagemaxx:navigate',
  getState: 'usagemaxx:get-state',
  refresh: 'usagemaxx:refresh',
  refreshProvider: 'usagemaxx:refresh-provider',
  updateSettings: 'usagemaxx:update-settings',
  openExternal: 'usagemaxx:open-external',
  hidePopup: 'usagemaxx:hide-popup',
  resizePopup: 'usagemaxx:resize-popup',
  quit: 'usagemaxx:quit',
  getKeyStatus: 'usagemaxx:get-key-status',
  saveKey: 'usagemaxx:save-key',
  clearKey: 'usagemaxx:clear-key',
  revealKey: 'usagemaxx:reveal-key'
} as const

export type SettingsChange =
  | { kind: 'displayMode'; value: DisplayMode }
  | { kind: 'resetMode'; value: ResetMode }
  | { kind: 'timeFormat'; value: TimeFormat }
  | { kind: 'theme'; value: Theme }
  | { kind: 'alwaysShowPacing'; value: boolean }
  | { kind: 'toggleExpanded'; providerId: string }
  | { kind: 'setProviderEnabled'; providerId: string; enabled: boolean }
  | { kind: 'togglePin'; providerId: string; metricId: string }
  | { kind: 'setMetricFlag'; providerId: string; metricId: string; flag: 'enabled' | 'onDemand'; value: boolean }
  | { kind: 'completeFirstRun'; enabledProviders: string[] }

export type ChangeResult = { ok: true } | { ok: false; reason: string }

/** Where a key-based provider's API key comes from. The key itself only crosses IPC on reveal. */
export interface ApiKeyEntry {
  providerId: string
  status: ApiKeyStatus
}

/** Screens the main process can ask the popup to show (e.g. tray menu → Settings). */
export type View = 'dashboard' | 'settings'

/** What the preload script exposes as `window.usagemaxx`. */
export interface UsageMaxxApi {
  getState(): Promise<AppState>
  onState(listener: (state: AppState) => void): () => void
  onNavigate(listener: (view: View) => void): () => void
  refresh(): Promise<void>
  refreshProvider(providerId: string): Promise<void>
  updateSettings(change: SettingsChange): Promise<ChangeResult>
  openExternal(url: string): Promise<void>
  hidePopup(): void
  resizePopup(height: number): void
  quit(): void
  getKeyStatus(): Promise<ApiKeyEntry[]>
  saveKey(providerId: string, key: string): Promise<ChangeResult>
  clearKey(providerId: string): Promise<ChangeResult>
  /** The key in use, decrypted — only when the user asks to see it. */
  revealKey(providerId: string): Promise<string | undefined>
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === 'string' && options.includes(value as T)
}

/** Validates a renderer-supplied change. Anything malformed returns undefined. */
export function parseSettingsChange(raw: unknown): SettingsChange | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  switch (r.kind) {
    case 'displayMode':
      return oneOf(r.value, ['used', 'left'] as const) ? { kind: 'displayMode', value: r.value } : undefined
    case 'resetMode':
      return oneOf(r.value, ['countdown', 'absolute'] as const) ? { kind: 'resetMode', value: r.value } : undefined
    case 'timeFormat':
      return oneOf(r.value, ['auto', '12h', '24h'] as const) ? { kind: 'timeFormat', value: r.value } : undefined
    case 'theme':
      return oneOf(r.value, ['system', 'light', 'dark'] as const) ? { kind: 'theme', value: r.value } : undefined
    case 'alwaysShowPacing':
      return typeof r.value === 'boolean' ? { kind: 'alwaysShowPacing', value: r.value } : undefined
    case 'toggleExpanded':
      return isString(r.providerId) ? { kind: 'toggleExpanded', providerId: r.providerId } : undefined
    case 'setProviderEnabled':
      return isString(r.providerId) && typeof r.enabled === 'boolean'
        ? { kind: 'setProviderEnabled', providerId: r.providerId, enabled: r.enabled }
        : undefined
    case 'togglePin':
      return isString(r.providerId) && isString(r.metricId)
        ? { kind: 'togglePin', providerId: r.providerId, metricId: r.metricId }
        : undefined
    case 'setMetricFlag':
      return isString(r.providerId) && isString(r.metricId) && oneOf(r.flag, ['enabled', 'onDemand'] as const) && typeof r.value === 'boolean'
        ? { kind: 'setMetricFlag', providerId: r.providerId, metricId: r.metricId, flag: r.flag, value: r.value }
        : undefined
    case 'completeFirstRun':
      return Array.isArray(r.enabledProviders) && r.enabledProviders.every(isString)
        ? { kind: 'completeFirstRun', enabledProviders: r.enabledProviders as string[] }
        : undefined
    default:
      return undefined
  }
}

export interface ProviderCatalog {
  /** Provider ids in registry order. */
  order: readonly string[]
  descriptors(providerId: string): readonly MetricDescriptor[] | undefined
}

export type ApplyResult = { ok: true; settings: Settings } | { ok: false; reason: string }

/** Applies a validated change to settings. Unknown providers or metrics are rejected. */
export function applySettingsChange(settings: Settings, change: SettingsChange, catalog: ProviderCatalog): ApplyResult {
  const knownProvider = (id: string) => catalog.order.includes(id)
  switch (change.kind) {
    case 'displayMode':
      return { ok: true, settings: { ...settings, displayMode: change.value } }
    case 'resetMode':
      return { ok: true, settings: { ...settings, resetMode: change.value } }
    case 'timeFormat':
      return { ok: true, settings: { ...settings, timeFormat: change.value } }
    case 'theme':
      return { ok: true, settings: { ...settings, theme: change.value } }
    case 'alwaysShowPacing':
      return { ok: true, settings: { ...settings, alwaysShowPacing: change.value } }
    case 'toggleExpanded': {
      if (!knownProvider(change.providerId)) return { ok: false, reason: 'Unknown provider' }
      const expanded = new Set(settings.expandedProviders)
      if (expanded.has(change.providerId)) expanded.delete(change.providerId)
      else expanded.add(change.providerId)
      return { ok: true, settings: { ...settings, expandedProviders: [...expanded] } }
    }
    case 'setProviderEnabled':
      if (!knownProvider(change.providerId)) return { ok: false, reason: 'Unknown provider' }
      return { ok: true, settings: setProviderEnabled(settings, change.providerId, change.enabled, catalog.order) }
    case 'togglePin':
    case 'setMetricFlag': {
      const descriptors = catalog.descriptors(change.providerId)
      if (!descriptors) return { ok: false, reason: 'Unknown provider' }
      if (!descriptors.some((d) => d.id === change.metricId)) return { ok: false, reason: 'Unknown metric' }
      if (change.kind === 'togglePin') return togglePin(settings, change.providerId, change.metricId, descriptors)
      return {
        ok: true,
        settings: setMetricFlag(settings, change.providerId, change.metricId, change.flag, change.value, descriptors)
      }
    }
    case 'completeFirstRun': {
      const chosen = new Set(change.enabledProviders.filter(knownProvider))
      return {
        ok: true,
        settings: {
          ...settings,
          enabledProviders: catalog.order.filter((id) => chosen.has(id)),
          knownProviders: [...catalog.order]
        }
      }
    }
  }
}

/** Only web links leave the app. */
export function isSafeExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}
