import { describe, expect, it } from 'vitest'
import { applySettingsChange, isSafeExternalUrl, parseSettingsChange, type ProviderCatalog } from './ipc'
import { defaultSettings } from './settings'
import type { MetricDescriptor } from './types'

const claudeMetrics: MetricDescriptor[] = [
  { id: 'Session', defaultEnabled: true, defaultOnDemand: false, defaultPinned: true },
  { id: 'Weekly', defaultEnabled: true, defaultOnDemand: false, defaultPinned: true },
  { id: 'Sonnet', defaultEnabled: false, defaultOnDemand: true, defaultPinned: false }
]
const catalog: ProviderCatalog = {
  order: ['claude', 'codex'],
  descriptors: (id) => (id === 'claude' ? claudeMetrics : id === 'codex' ? [] : undefined)
}

describe('parseSettingsChange', () => {
  it('accepts well-formed changes', () => {
    expect(parseSettingsChange({ kind: 'displayMode', value: 'used' })).toEqual({ kind: 'displayMode', value: 'used' })
    expect(parseSettingsChange({ kind: 'togglePin', providerId: 'claude', metricId: 'Sonnet' })).toEqual({
      kind: 'togglePin',
      providerId: 'claude',
      metricId: 'Sonnet'
    })
  })

  it('rejects malformed changes', () => {
    expect(parseSettingsChange({ kind: 'displayMode', value: 'sideways' })).toBeUndefined()
    expect(parseSettingsChange({ kind: 'setProviderEnabled', providerId: 'claude', enabled: 'yes' })).toBeUndefined()
    expect(parseSettingsChange({ kind: 'completeFirstRun', enabledProviders: ['claude', 3] })).toBeUndefined()
    expect(parseSettingsChange({ kind: '__proto__' })).toBeUndefined()
    expect(parseSettingsChange(null)).toBeUndefined()
  })
})

describe('applySettingsChange', () => {
  it('rejects unknown providers and metrics', () => {
    const settings = defaultSettings()
    expect(applySettingsChange(settings, { kind: 'setProviderEnabled', providerId: 'nope', enabled: true }, catalog)).toEqual({
      ok: false,
      reason: 'Unknown provider'
    })
    expect(applySettingsChange(settings, { kind: 'togglePin', providerId: 'claude', metricId: 'Nope' }, catalog)).toEqual({
      ok: false,
      reason: 'Unknown metric'
    })
  })

  it('surfaces the pin limit', () => {
    expect(applySettingsChange(defaultSettings(), { kind: 'togglePin', providerId: 'claude', metricId: 'Sonnet' }, catalog)).toEqual({
      ok: false,
      reason: 'Up to 2 pins per provider'
    })
  })

  it('completes first run with known providers in registry order', () => {
    const result = applySettingsChange(defaultSettings(), { kind: 'completeFirstRun', enabledProviders: ['codex', 'ghost', 'claude'] }, catalog)
    expect(result.ok && result.settings.enabledProviders).toEqual(['claude', 'codex'])
    expect(result.ok && result.settings.knownProviders).toEqual(['claude', 'codex'])
  })

  it('switches Read-only Logins only with a boolean', () => {
    expect(parseSettingsChange({ kind: 'readOnlyLogins', value: 1 })).toBeUndefined()
    const change = parseSettingsChange({ kind: 'readOnlyLogins', value: true })
    expect(change).toEqual({ kind: 'readOnlyLogins', value: true })
    const result = change ? applySettingsChange(defaultSettings(), change, catalog) : undefined
    expect(result?.ok && result.settings.readOnlyLogins).toBe(true)
  })

  it('toggles a provider card open and closed', () => {
    const opened = applySettingsChange(defaultSettings(), { kind: 'toggleExpanded', providerId: 'claude' }, catalog)
    expect(opened.ok && opened.settings.expandedProviders).toEqual(['claude'])
    if (!opened.ok) return
    const closed = applySettingsChange(opened.settings, { kind: 'toggleExpanded', providerId: 'claude' }, catalog)
    expect(closed.ok && closed.settings.expandedProviders).toEqual([])
  })
})

describe('isSafeExternalUrl', () => {
  it('only allows web links', () => {
    expect(isSafeExternalUrl('https://status.anthropic.com')).toBe(true)
    expect(isSafeExternalUrl('file:///C:/Windows/System32/calc.exe')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl(42)).toBe(false)
  })
})
