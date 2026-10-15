import { describe, expect, it } from 'vitest'
import type { ProviderRuntime } from './runtime'
import { defaultSettings } from './settings'
import { buildAppState, pinnedMetrics, type ProviderState } from './state'

const provider: ProviderRuntime = {
  info: { id: 'claude', displayName: 'Claude', brandColor: '#D97757', links: [], autoEnable: true },
  metrics: [
    { id: 'Session', defaultEnabled: true, defaultOnDemand: false, defaultPinned: true, sessionStartSignal: 'missingResetDate' },
    { id: 'Weekly', defaultEnabled: true, defaultOnDemand: false, defaultPinned: true },
    { id: 'Extra Usage', defaultEnabled: true, defaultOnDemand: true, defaultPinned: false }
  ],
  refresh: async () => {
    throw new Error('unused')
  },
  hasLocalCredentials: async () => true
}

const now = new Date('2026-10-15T12:00:00Z')

function stateWith(refreshedAt: string): ProviderState {
  return {
    fromPreviousSession: false,
    refreshing: false,
    snapshot: {
      providerId: 'claude',
      displayName: 'Claude',
      plan: 'Pro',
      refreshedAt,
      lines: [{ type: 'progress', label: 'Session', used: 30, limit: 100, format: { kind: 'percent' } }]
    }
  }
}

function build(state: ProviderState | undefined, enabled: string[] | null = ['claude']) {
  return buildAppState({
    version: '0.1.0',
    providers: [provider],
    states: () => state,
    settings: { ...defaultSettings(), enabledProviders: enabled },
    now,
    intervalMs: 5 * 60_000,
    demo: false
  })
}

describe('buildAppState', () => {
  it('joins descriptors, settings, and snapshot lines', () => {
    const app = build(stateWith('2026-10-15T11:58:00Z'))
    const claude = app.providers[0]
    expect(claude?.enabled).toBe(true)
    expect(claude?.plan).toBe('Pro')
    expect(claude?.stale).toBe(false)
    expect(claude?.metrics.map((m) => [m.id, m.pinned, m.onDemand, m.line?.type])).toEqual([
      ['Session', true, false, 'progress'],
      ['Weekly', true, false, undefined],
      ['Extra Usage', false, true, undefined]
    ])
    expect(app.firstRun).toBe(false)
  })

  it('marks data older than two intervals as stale', () => {
    expect(build(stateWith('2026-10-15T11:49:00Z')).providers[0]?.stale).toBe(true)
  })

  it('flags first run while no provider choice exists', () => {
    expect(build(undefined, null).firstRun).toBe(true)
  })

  it('lists pinned metrics that have data', () => {
    const pins = pinnedMetrics(build(stateWith('2026-10-15T11:58:00Z')))
    expect(pins.map((pin) => pin.metric.id)).toEqual(['Session'])
    expect(pinnedMetrics(build(stateWith('2026-10-15T11:58:00Z'), []))).toEqual([])
  })
})
