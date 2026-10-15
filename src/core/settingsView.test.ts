import { describe, expect, it } from 'vitest'
import { API_KEY_PROVIDERS } from './apiKeys'
import { defaultSettings } from './settings'
import { PIN_LIMIT_TEXT, keyStatusText, metricSettings, parseRoute, providerSummary, welcomeChoices } from './settingsView'
import { buildAppState } from './state'
import type { MetricDescriptor, ProviderInfo } from './types'

const info = (id: string, autoEnable = true): ProviderInfo => ({ id, displayName: id, brandColor: '#000', links: [], autoEnable })
const metric = (id: string, flags: Partial<MetricDescriptor> = {}): MetricDescriptor => ({ id, defaultEnabled: true, defaultOnDemand: false, defaultPinned: false, ...flags })

function providerView(metrics: MetricDescriptor[], pinned?: string[]) {
  const settings = { ...defaultSettings(), enabledProviders: ['p'], ...(pinned ? { metricPrefs: { p: { pinned } } } : {}) }
  const state = buildAppState({ version: '0', providers: [{ info: info('p'), metrics }], states: () => undefined, settings, now: new Date(0), intervalMs: 1, demo: false })
  return state.providers[0]!
}

describe('parseRoute', () => {
  it('maps navigation requests to screens', () => {
    expect(parseRoute('dashboard')).toEqual({ screen: 'dashboard' })
    expect(parseRoute('settings')).toEqual({ screen: 'settings', tab: 'providers' })
    expect(parseRoute('keys')).toEqual({ screen: 'settings', tab: 'keys' })
    expect(parseRoute('about')).toEqual({ screen: 'settings', tab: 'about' })
    expect(parseRoute('providers:claude')).toEqual({ screen: 'settings', tab: 'providers', providerId: 'claude' })
    expect(parseRoute('providers:')).toEqual({ screen: 'dashboard' })
    expect(parseRoute('nonsense')).toEqual({ screen: 'dashboard' })
  })
})

describe('welcomeChoices', () => {
  it('preselects detected providers in registry order and never one that must be turned on by hand', () => {
    const providers = [info('claude'), info('codex'), info('cursor'), info('ollama', false)].map((i) => ({ info: i }))
    const choices = welcomeChoices(providers, { codex: true, claude: true, ollama: true })
    expect(choices.found.map((p) => p.id)).toEqual(['claude', 'codex'])
    expect(choices.others.map((p) => p.id)).toEqual(['cursor', 'ollama'])
  })

  it('finds nothing when detection found nothing', () => {
    expect(welcomeChoices([{ info: info('claude') }], {})).toEqual({ found: [], others: [info('claude')] })
  })
})

describe('metricSettings', () => {
  const metrics = [metric('Session', { defaultPinned: true }), metric('Weekly', { defaultPinned: true }), metric('Sonnet', { defaultEnabled: false, defaultOnDemand: true })]

  it('blocks a third pin and says why', () => {
    const settings = metricSettings(providerView(metrics))
    expect(settings.pinLimitReached).toBe(true)
    expect(settings.rows.map((row) => [row.id, row.pinned, row.canPin])).toEqual([
      ['Session', true, true],
      ['Weekly', true, true],
      ['Sonnet', false, false]
    ])
    expect(PIN_LIMIT_TEXT).toBe('Up to 2 pins per provider')
  })

  it('allows pinning again once a pin is freed', () => {
    const settings = metricSettings(providerView(metrics, ['Session']))
    expect(settings.pinLimitReached).toBe(false)
    expect(settings.rows.every((row) => row.canPin)).toBe(true)
  })

  it('summarizes how many metrics show', () => {
    expect(providerSummary(providerView(metrics))).toBe('2 of 3 metrics shown')
    expect(providerSummary(providerView([metric('Credits')]))).toBe('1 of 1 metric shown')
  })
})

describe('keyStatusText', () => {
  const [openRouter, zai] = API_KEY_PROVIDERS
  it('names where the key comes from', () => {
    expect(keyStatusText(undefined, openRouter!)).toBe('Not set')
    expect(keyStatusText({ providerId: 'openrouter', status: 'saved' }, openRouter!)).toBe('Saved in UsageMaxx, encrypted')
    expect(keyStatusText({ providerId: 'zai', status: 'fromEnvironment', environmentVariable: 'GLM_API_KEY' }, zai!)).toBe('From the GLM_API_KEY environment variable')
    expect(keyStatusText({ providerId: 'zai', status: 'overrideActive', environmentVariable: 'ZAI_API_KEY' }, zai!)).toBe('Saved in UsageMaxx, used instead of ZAI_API_KEY')
  })
})
