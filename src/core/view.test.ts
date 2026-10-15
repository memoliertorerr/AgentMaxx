import { describe, expect, it } from 'vitest'
import { defaultSettings } from './settings'
import type { MetricView, ProviderView } from './state'
import type { ProgressLine } from './types'
import { cardSections, hasExpander, lastUpdatedText, nextUpdateText, progressRow, valuesText, valuesTooltip } from './view'

const HOUR = 3_600_000
const now = new Date('2026-10-15T12:00:00Z')
const settings = { ...defaultSettings(), timeFormat: '24h' as const }

function session(used: number, elapsedHours: number): ProgressLine {
  return {
    type: 'progress',
    label: 'Session',
    used,
    limit: 100,
    format: { kind: 'percent' },
    resetsAt: new Date(now.getTime() + 5 * HOUR - elapsedHours * HOUR).toISOString(),
    periodDurationMs: 5 * HOUR
  }
}

describe('progressRow', () => {
  it('shows headline, reset, and no pace decoration when healthy', () => {
    const row = progressRow(session(20, 2), {}, settings, now)
    expect(row).toMatchObject({ headline: '80% left', trailing: 'Resets in 3h', trailingIsReset: true, severity: 'normal' })
    expect(row.note).toBeUndefined()
    expect(row.tick).toBeUndefined()
    expect(row.barTooltip).toBe('~50% left at reset')
  })

  it('adds the pacing note and tick when Always Show Pacing is on', () => {
    const row = progressRow(session(20, 2), {}, { ...settings, alwaysShowPacing: true }, now)
    expect(row.note).toEqual({ kind: 'pacing', text: '~50% left at reset' })
    expect(row.tick).toBeCloseTo(0.6) // left view: 1 - 2/5
  })

  it('shows the spare note and tick when close to the limit', () => {
    const row = progressRow(session(38, 2), {}, settings, now)
    expect(row.severity).toBe('warning')
    expect(row.note).toEqual({ kind: 'spare', text: '~5% spare' })
    expect(row.tick).toBeCloseTo(0.6)
  })

  it('shows the run-out time when projected past the limit', () => {
    const row = progressRow(session(60, 2), {}, settings, now)
    expect(row.severity).toBe('critical')
    expect(row.note).toEqual({ kind: 'runOut', text: 'Limit in 1h 20m' })
  })

  it('reads "Limit reached" when spent', () => {
    expect(progressRow(session(100, 2), {}, settings, now).note).toEqual({ kind: 'runOut', text: 'Limit reached' })
  })

  it('offers the other reset format on hover', () => {
    const row = progressRow(session(20, 2), {}, settings, now)
    expect(row.trailingTooltip).toMatch(/^Resets today at \d{2}:00$/)
  })

  it('explains a session that has not started', () => {
    const fresh: ProgressLine = { type: 'progress', label: 'Session', used: 0, limit: 100, format: { kind: 'percent' } }
    const row = progressRow(fresh, { sessionStartSignal: 'missingResetDate' }, settings, now)
    expect(row.trailing).toBe('Not started')
    expect(row.trailingIsReset).toBe(false)
    expect(row.trailingTooltip).toBe('Sessions start after you send your first message.')
  })
})

describe('values rows', () => {
  it('joins values compactly and offers full precision on hover', () => {
    const line = {
      type: 'values' as const,
      label: 'Credits',
      values: [
        { number: 2059.07, kind: 'dollars' as const },
        { number: 796, kind: 'count' as const, label: 'credits' }
      ]
    }
    expect(valuesText(line)).toBe('$2.1K · 796 credits')
    expect(valuesTooltip(line)).toBe('$2,059.07 · 796 credits')
    expect(valuesTooltip({ ...line, values: [{ number: 4, kind: 'dollars' }] })).toBeUndefined()
  })
})

function provider(metrics: Array<Partial<MetricView> & { id: string }>, links = 0): ProviderView {
  return {
    info: {
      id: 'p',
      displayName: 'P',
      brandColor: '#000',
      links: Array.from({ length: links }, (_, i) => ({ label: `L${i}`, url: 'https://example.test' })),
      autoEnable: true
    },
    enabled: true,
    metrics: metrics.map((metric) => ({ enabled: true, onDemand: false, pinned: false, ...metric })),
    refreshing: false,
    stale: false,
    hasSnapshot: true,
    expanded: false
  }
}

describe('cardSections', () => {
  it('splits always-visible and on-demand, skipping disabled metrics', () => {
    const sections = cardSections(provider([{ id: 'A' }, { id: 'B', onDemand: true }, { id: 'C', enabled: false }]))
    expect(sections.primary.map((m) => m.id)).toEqual(['A'])
    expect(sections.onDemand.map((m) => m.id)).toEqual(['B'])
  })

  it('promotes everything when all metrics are on demand', () => {
    const sections = cardSections(provider([{ id: 'A', onDemand: true }, { id: 'B', onDemand: true }]))
    expect(sections.primary.map((m) => m.id)).toEqual(['A', 'B'])
    expect(sections.onDemand).toEqual([])
  })

  it('needs a caret for on-demand rows or quick links', () => {
    expect(hasExpander(provider([{ id: 'A' }]))).toBe(false)
    expect(hasExpander(provider([{ id: 'A' }], 1))).toBe(true)
  })
})

describe('footer text', () => {
  it('counts down to the next update', () => {
    // Minutes round up, like upstream's compactDuration: 4m 10s reads "5m".
    expect(nextUpdateText('2026-10-15T12:04:10Z', false, now)).toBe('Next update in 5m')
    expect(nextUpdateText('2026-10-15T12:00:30Z', false, now)).toBe('Next update in <1m')
    expect(nextUpdateText(undefined, true, now)).toBe('Updating…')
  })

  it('describes data age', () => {
    expect(lastUpdatedText('2026-10-15T09:00:00Z', now)).toBe('Last updated 3h ago')
  })
})
