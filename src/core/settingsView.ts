import type { ApiKeyProvider } from './apiKeys'
import type { ApiKeyEntry, SettingsTab, View } from './ipc'
import { MAX_PINS_PER_PROVIDER } from './settings'
import type { ProviderView } from './state'
import type { ProviderInfo } from './types'

// View models for the welcome screen and the Settings view, kept out of React so they're unit
// tested. Renderer-safe: no Node imports.

export const SETTINGS_TABS: ReadonlyArray<{ id: SettingsTab; label: string }> = [
  { id: 'providers', label: 'Providers' },
  { id: 'keys', label: 'API Keys' },
  { id: 'general', label: 'General' },
  { id: 'about', label: 'About' }
]

export type Route = { screen: 'dashboard' } | { screen: 'settings'; tab: SettingsTab; providerId?: string }

/** A navigation request from main or the smoke script; anything unknown opens the dashboard. */
export function parseRoute(view: View | string): Route {
  if (view === 'settings') return { screen: 'settings', tab: 'providers' }
  const tab = SETTINGS_TABS.find((candidate) => candidate.id === view)
  if (tab) return { screen: 'settings', tab: tab.id }
  if (view.startsWith('providers:') && view.length > 'providers:'.length) {
    return { screen: 'settings', tab: 'providers', providerId: view.slice('providers:'.length) }
  }
  return { screen: 'dashboard' }
}

export interface WelcomeChoices {
  /** Providers signed in on this PC, preselected (never one that must be turned on by hand). */
  found: ProviderInfo[]
  /** Everything else, behind "Show all providers". */
  others: ProviderInfo[]
}

export function welcomeChoices(providers: ReadonlyArray<{ info: ProviderInfo }>, detected: Readonly<Record<string, boolean>>): WelcomeChoices {
  const found: ProviderInfo[] = []
  const others: ProviderInfo[] = []
  for (const { info } of providers) {
    if (detected[info.id] === true && info.autoEnable) found.push(info)
    else others.push(info)
  }
  return { found, others }
}

export interface MetricSettingsRow {
  id: string
  title: string
  enabled: boolean
  onDemand: boolean
  pinned: boolean
  /** False when the provider already has its maximum of pins and this one isn't among them. */
  canPin: boolean
}

export interface MetricSettings {
  rows: MetricSettingsRow[]
  pinLimitReached: boolean
}

/** A provider's metrics with the per-provider pin rule applied. */
export function metricSettings(provider: ProviderView): MetricSettings {
  const pinnedCount = provider.metrics.filter((metric) => metric.pinned).length
  const pinLimitReached = pinnedCount >= MAX_PINS_PER_PROVIDER
  return {
    pinLimitReached,
    rows: provider.metrics.map((metric) => ({
      id: metric.id,
      title: metric.title,
      enabled: metric.enabled,
      onDemand: metric.onDemand,
      pinned: metric.pinned,
      canPin: metric.pinned || !pinLimitReached
    }))
  }
}

export const PIN_LIMIT_TEXT = `Up to ${MAX_PINS_PER_PROVIDER} pins per provider`

/** "4 of 6 metrics shown". */
export function providerSummary(provider: ProviderView): string {
  const shown = provider.metrics.filter((metric) => metric.enabled).length
  const total = provider.metrics.length
  return `${shown} of ${total} ${total === 1 ? 'metric' : 'metrics'} shown`
}

/** One line saying where the key in use comes from. */
export function keyStatusText(entry: ApiKeyEntry | undefined, provider: ApiKeyProvider): string {
  const variable = entry?.environmentVariable ?? provider.envNames[0]
  switch (entry?.status) {
    case 'saved':
      return 'Saved in AgentMaxx, encrypted'
    case 'overrideActive':
      return `Saved in AgentMaxx, used instead of ${variable}`
    case 'fromEnvironment':
      return `From the ${variable} environment variable`
    default:
      return 'Not set'
  }
}
