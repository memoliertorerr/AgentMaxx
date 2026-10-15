import { describe, expect, it } from 'vitest'
import { MemoryFileSystem, silentLogger } from '../../tests/helpers/fakes'
import {
  defaultSettings,
  normalizeSettings,
  resolveMetrics,
  setMetricFlag,
  setProviderEnabled,
  togglePin
} from './settings'
import { SettingsStore } from './settingsStore'
import type { MetricDescriptor } from './types'

const descriptors: MetricDescriptor[] = [
  { id: 'Session', defaultEnabled: true, defaultOnDemand: false, defaultPinned: true },
  { id: 'Weekly', defaultEnabled: true, defaultOnDemand: false, defaultPinned: true },
  { id: 'Sonnet', defaultEnabled: false, defaultOnDemand: true, defaultPinned: false }
]

describe('normalizeSettings', () => {
  it('defaults everything for junk input', () => {
    expect(normalizeSettings('nope')).toEqual(defaultSettings())
  })

  it('keeps valid values, drops unknown keys, and defaults the rest', () => {
    const settings = normalizeSettings({
      enabledProviders: ['claude', 'claude', 7],
      displayMode: 'used',
      resetMode: 'sideways',
      surprise: true,
      metricPrefs: { claude: { pinned: ['Session', 'Weekly', 'Sonnet'] }, bad: 3 }
    })
    expect(settings.enabledProviders).toEqual(['claude'])
    expect(settings.displayMode).toBe('used')
    expect(settings.resetMode).toBe('countdown')
    expect(settings).not.toHaveProperty('surprise')
    expect(settings.metricPrefs).toEqual({ claude: { pinned: ['Session', 'Weekly'] } })
  })

  it('keeps Read-only Logins off unless it was switched on with a real boolean', () => {
    expect(defaultSettings().readOnlyLogins).toBe(false)
    expect(normalizeSettings({ readOnlyLogins: true }).readOnlyLogins).toBe(true)
    expect(normalizeSettings({ readOnlyLogins: 'yes' }).readOnlyLogins).toBe(false)
  })

  it('treats a missing enabled list as first run', () => {
    expect(normalizeSettings({}).enabledProviders).toBeNull()
  })
})

describe('metric preferences', () => {
  it('resolves descriptor defaults', () => {
    expect(resolveMetrics(descriptors, undefined)).toEqual([
      { id: 'Session', enabled: true, onDemand: false, pinned: true },
      { id: 'Weekly', enabled: true, onDemand: false, pinned: true },
      { id: 'Sonnet', enabled: false, onDemand: true, pinned: false }
    ])
  })

  it('allows at most two pins per provider', () => {
    const blocked = togglePin(defaultSettings(), 'claude', 'Sonnet', descriptors)
    expect(blocked).toEqual({ ok: false, reason: 'Up to 2 pins per provider' })

    const unpinned = togglePin(defaultSettings(), 'claude', 'Weekly', descriptors)
    expect(unpinned.ok && unpinned.settings.metricPrefs.claude?.pinned).toEqual(['Session'])
    if (!unpinned.ok) return
    const repinned = togglePin(unpinned.settings, 'claude', 'Sonnet', descriptors)
    expect(repinned.ok && repinned.settings.metricPrefs.claude?.pinned).toEqual(['Session', 'Sonnet'])
  })

  it('materializes defaults when a single flag changes', () => {
    const settings = setMetricFlag(defaultSettings(), 'claude', 'Sonnet', 'enabled', true, descriptors)
    expect(settings.metricPrefs.claude?.enabled).toEqual(['Session', 'Weekly', 'Sonnet'])
    const hidden = setMetricFlag(settings, 'claude', 'Weekly', 'enabled', false, descriptors)
    expect(hidden.metricPrefs.claude?.enabled).toEqual(['Session', 'Sonnet'])
  })

  it('keeps enabled providers in registry order and records them as known', () => {
    const order = ['claude', 'codex', 'cursor']
    let settings = setProviderEnabled(defaultSettings(), 'cursor', true, order)
    settings = setProviderEnabled(settings, 'claude', true, order)
    expect(settings.enabledProviders).toEqual(['claude', 'cursor'])
    settings = setProviderEnabled(settings, 'cursor', false, order)
    expect(settings.enabledProviders).toEqual(['claude'])
    expect(settings.knownProviders).toEqual(['cursor', 'claude'])
  })
})

describe('SettingsStore', () => {
  const file = 'C:\\data\\settings.json'

  it('round-trips through the file', async () => {
    const fs = new MemoryFileSystem()
    const store = new SettingsStore(fs, file, silentLogger)
    const settings = { ...defaultSettings(), enabledProviders: ['codex'], theme: 'dark' as const }
    await store.save(settings)
    expect(await store.load()).toEqual(settings)
  })

  it('returns defaults when the file is missing', async () => {
    expect(await new SettingsStore(new MemoryFileSystem(), file, silentLogger).load()).toEqual(defaultSettings())
  })

  it('survives a corrupt file by resetting it', async () => {
    const fs = new MemoryFileSystem({ [file]: '{not json' })
    const loaded = await new SettingsStore(fs, file, silentLogger).load()
    expect(loaded).toEqual(defaultSettings())
    expect(JSON.parse(fs.files.get(file) ?? '')).toEqual(defaultSettings())
  })

  it('returns defaults when the file is unreadable', async () => {
    const fs = new MemoryFileSystem({ [file]: '{}' })
    fs.unreadable.add(file)
    expect(await new SettingsStore(fs, file, silentLogger).load()).toEqual(defaultSettings())
  })
})
