import { describe, expect, it } from 'vitest'
import { defaultSettings, type Settings } from '../core/settings'
import { buildAppState, type ProviderState } from '../core/state'
import type { MetricLine, ProviderEntry } from '../core/types'
import { WINDOWS_TOOLTIP_LIMIT, trayMeters, trayTooltip } from './trayModel'

const now = new Date('2026-10-15T12:00:00Z')
const HOUR = 3_600_000

function provider(id: string, displayName: string, pinned: string[]): ProviderEntry {
  return {
    info: { id, displayName, brandColor: '#000', links: [], autoEnable: true },
    metrics: ['Session', 'Weekly', 'Balance'].map((metricId) => ({
      id: metricId,
      defaultEnabled: true,
      defaultOnDemand: false,
      defaultPinned: pinned.includes(metricId)
    }))
  }
}

function state(lines: Record<string, MetricLine[]>, settings: Partial<Settings> = {}) {
  const providers = [provider('claude', 'Claude', ['Session', 'Weekly']), provider('openrouter', 'OpenRouter', ['Balance'])]
  const states = (id: string): ProviderState | undefined =>
    lines[id] ? { fromPreviousSession: false, refreshing: false, snapshot: { providerId: id, displayName: id, refreshedAt: now.toISOString(), lines: lines[id] } } : undefined
  return buildAppState({
    version: '0.1.0',
    providers,
    states,
    settings: { ...defaultSettings(), enabledProviders: ['claude', 'openrouter'], ...settings },
    now,
    intervalMs: 300_000,
    demo: false
  })
}

const session: MetricLine = {
  type: 'progress',
  label: 'Session',
  used: 38,
  limit: 100,
  format: { kind: 'percent' },
  resetsAt: new Date(now.getTime() + 2 * HOUR).toISOString(),
  periodDurationMs: 5 * HOUR
}
const weekly: MetricLine = { type: 'progress', label: 'Weekly', used: 92, limit: 100, format: { kind: 'percent' } }
const balance: MetricLine = { type: 'values', label: 'Balance', values: [{ number: 12.5, kind: 'dollars' }] }

describe('trayMeters', () => {
  it('turns the first two pinned meters into bars', () => {
    expect(trayMeters(state({ claude: [session, weekly] }), now)).toEqual([
      { fraction: 0.62, tone: 'normal' },
      { fraction: 0.08, tone: 'critical' }
    ])
  })

  it('follows the used/left display mode', () => {
    expect(trayMeters(state({ claude: [session] }, { displayMode: 'used' }), now)).toEqual([{ fraction: 0.38, tone: 'normal' }])
  })

  it('has no bars when nothing pinned has data', () => {
    expect(trayMeters(state({ openrouter: [balance] }), now)).toEqual([])
  })
})

describe('trayTooltip', () => {
  it('lists pinned readings per provider', () => {
    expect(trayTooltip(state({ claude: [session, weekly], openrouter: [balance] }))).toBe(
      'Claude: Session 62% left · Weekly 8% left\nOpenRouter: Balance $13'
    )
  })

  it('names the app when nothing is pinned', () => {
    expect(trayTooltip(state({}))).toBe('UsageMaxx')
  })

  it('stays within the Windows tooltip limit', () => {
    const many = Object.fromEntries(
      Array.from({ length: 6 }, (_, i) => [`p${i}`, [session, weekly]])
    ) as Record<string, MetricLine[]>
    const providers = Array.from({ length: 6 }, (_, i) => provider(`p${i}`, `Provider Number ${i}`, ['Session', 'Weekly']))
    const app = buildAppState({
      version: '0.1.0',
      providers,
      states: (id) => ({ fromPreviousSession: false, refreshing: false, snapshot: { providerId: id, displayName: id, refreshedAt: now.toISOString(), lines: many[id] ?? [] } }),
      settings: { ...defaultSettings(), enabledProviders: providers.map((p) => p.info.id) },
      now,
      intervalMs: 300_000,
      demo: false
    })
    const tooltip = trayTooltip(app)
    expect(tooltip.length).toBe(WINDOWS_TOOLTIP_LIMIT)
    expect(tooltip.endsWith('…')).toBe(true)
  })
})
