import { describe, expect, it } from 'vitest'
import {
  barFraction,
  evaluatePace,
  isFreshSessionWindow,
  meterState,
  meterTooltip,
  paceTick,
  progressHeadline,
  progressTrailing,
  severityOf,
  trayValue
} from './progress'
import type { ProgressLine } from './types'

const HOUR = 3600_000
const SESSION_MS = 5 * HOUR
const now = new Date('2026-10-15T12:00:00Z')

/** A 5-hour percent meter whose window started `elapsedHours` ago. */
function session(used: number, elapsedHours: number): ProgressLine {
  return {
    type: 'progress',
    label: 'Session',
    used,
    limit: 100,
    format: { kind: 'percent' },
    resetsAt: new Date(now.getTime() + SESSION_MS - elapsedHours * HOUR).toISOString(),
    periodDurationMs: SESSION_MS
  }
}

describe('headline and bar', () => {
  it('flips between used and left', () => {
    const line = session(48, 2)
    expect(progressHeadline(line, 'used')).toBe('48% used')
    expect(progressHeadline(line, 'left')).toBe('52% left')
    expect(barFraction(line, 'left')).toBeCloseTo(0.52)
  })

  it('never shows negative remaining or out-of-range bars', () => {
    const over: ProgressLine = { ...session(130, 2), used: 130 }
    expect(progressHeadline(over, 'left')).toBe('0% left')
    expect(barFraction(over, 'used')).toBe(1)
  })

  it('formats dollar meters', () => {
    const line: ProgressLine = { type: 'progress', label: 'Extra Usage', used: 12.345, limit: 50, format: { kind: 'dollars' } }
    expect(progressHeadline(line, 'used')).toBe('$12.35 used')
    expect(progressTrailing(line, { now })).toBe('$50 limit')
    expect(trayValue(line, 'left')).toBe('$38')
  })

  it('shows the count suffix when there is no reset', () => {
    const line: ProgressLine = { type: 'progress', label: 'Requests', used: 120, limit: 500, format: { kind: 'count', suffix: 'requests' } }
    expect(progressTrailing(line, { now })).toBe('requests')
  })
})

describe('evaluatePace', () => {
  it('projects usage at the current burn rate', () => {
    const resetsAt = new Date(now.getTime() + 3 * HOUR)
    // 40% used after 2 of 5 hours → 100% projected
    expect(evaluatePace(40, 100, resetsAt, SESSION_MS / 1000, now)).toEqual({ status: 'onTrack', projectedUsage: 100 })
    expect(evaluatePace(20, 100, resetsAt, SESSION_MS / 1000, now)?.status).toBe('ahead')
    expect(evaluatePace(60, 100, resetsAt, SESSION_MS / 1000, now)?.status).toBe('behind')
  })

  it('has no signal when nothing is used or the window just started', () => {
    expect(evaluatePace(0, 100, new Date(now.getTime() + HOUR), SESSION_MS / 1000, now)).toBeUndefined()
    // 30 s into a 5 h window is under the 3-minute minimum (1% of the period)
    expect(evaluatePace(5, 100, new Date(now.getTime() + SESSION_MS - 30_000), SESSION_MS / 1000, now)).toBeUndefined()
  })
})

describe('meterState', () => {
  it('is healthy (ok) when projected to finish with ≥10% spare', () => {
    const state = meterState(session(20, 2), { now })
    expect(state.kind).toBe('healthy')
    expect(severityOf(state)).toBe('normal')
    expect(meterTooltip(state)).toBe('~50% left at reset')
  })

  it('warns when projected inside the last 10%', () => {
    const state = meterState(session(38, 2), { now })
    expect(state).toEqual({ kind: 'closeToLimit', spare: '~5% spare', projectedFraction: 0.95 })
    expect(severityOf(state)).toBe('warning')
    expect(paceTick(session(38, 2), state, now, 'used')).toBeCloseTo(0.4)
  })

  it('is critical with a run-out time when projected past the limit', () => {
    const state = meterState(session(60, 2), { now })
    expect(state.kind).toBe('runningOut')
    expect(severityOf(state)).toBe('critical')
    // 60% in 2h → 30%/h → the remaining 40% lasts 1h 20m
    expect(state.kind === 'runningOut' && state.eta).toBe('Limit in 1h 20m')
    expect(meterTooltip(state)).toBe('~50% over limit at reset')
  })

  it('is spent when the remainder rounds to zero', () => {
    expect(meterState(session(99.6, 2), { now }).kind).toBe('spent')
  })

  it('distrusts a blow-out projection below 5% used', () => {
    // 2% after 3 minutes projects way over, but the meter stays calm
    const state = meterState(session(2, 0.06), { now })
    expect(state).toEqual({ kind: 'level', severity: 'normal' })
  })

  it('uses absolute bands without a reset window', () => {
    const credits: ProgressLine = { type: 'progress', label: 'Credits', used: 85, limit: 100, format: { kind: 'percent' } }
    expect(meterState(credits, { now })).toEqual({ kind: 'level', severity: 'warning' })
    expect(meterState({ ...credits, used: 91 }, { now })).toEqual({ kind: 'level', severity: 'critical' })
    expect(meterState({ ...credits, used: 10 }, { now })).toEqual({ kind: 'level', severity: 'normal' })
  })
})

describe('fresh session windows', () => {
  it('reads "Not started" when the API reports no reset time (Claude)', () => {
    const line: ProgressLine = { type: 'progress', label: 'Session', used: 0, limit: 100, format: { kind: 'percent' } }
    expect(isFreshSessionWindow(line, 'missingResetDate', now)).toBe(true)
    expect(progressTrailing(line, { now, sessionStartSignal: 'missingResetDate' })).toBe('Not started')
  })

  it('keeps the countdown once a reset time exists, even at 0%', () => {
    const line = session(0, 1)
    expect(isFreshSessionWindow(line, 'missingResetDate', now)).toBe(false)
    expect(progressTrailing(line, { now, sessionStartSignal: 'missingResetDate' })).toBe('Resets in 4h')
  })

  it('treats zero usage with a future reset as fresh for zeroUsage meters', () => {
    expect(isFreshSessionWindow(session(0, 1), 'zeroUsage', now)).toBe(true)
  })
})
