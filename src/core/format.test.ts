import { describe, expect, it } from 'vitest'
import { compactDuration, deadlineLabel, formatAge, formatNumber, formatValue, resetLabel, whenLabel } from './format'

describe('formatNumber', () => {
  it('formats percent, clamped and rounded', () => {
    expect(formatNumber(41.6, 'percent', 'row')).toBe('42%')
    expect(formatNumber(-5, 'percent', 'row')).toBe('0%')
    expect(formatNumber(105, 'percent', 'tray')).toBe('100%')
  })

  it('formats dollars per style', () => {
    expect(formatNumber(40.756, 'dollars', 'row')).toBe('$40.76')
    expect(formatNumber(130.4, 'dollars', 'tray')).toBe('$130')
    expect(formatNumber(2059.07, 'dollars', 'row')).toBe('$2.1K')
    expect(formatNumber(2059.07, 'dollars', 'full')).toBe('$2,059.07')
    expect(formatNumber(1_200_000, 'dollars', 'tray')).toBe('$1.2M')
  })

  it('formats counts compactly except in full style', () => {
    expect(formatNumber(820.64, 'count', 'row')).toBe('820.6')
    expect(formatNumber(12_900, 'count', 'row')).toBe('12.9K')
    expect(formatNumber(56_904_995, 'count', 'full')).toBe('56,904,995')
  })

  it('appends a value label', () => {
    expect(formatValue({ number: 772, kind: 'count', label: 'credits' }, 'row')).toBe('772 credits')
    expect(formatValue({ number: 4.08, kind: 'dollars' }, 'row')).toBe('$4.08')
  })
})

describe('compactDuration', () => {
  it('shows two units at the day scale', () => {
    expect(compactDuration((2 * 24 + 4) * 3600)).toBe('2d 4h')
    expect(compactDuration(4 * 24 * 3600 + 52 * 60)).toBe('4d 0h')
  })

  it('shows hours and minutes, or minutes alone', () => {
    expect(compactDuration(3 * 3600 + 25 * 60)).toBe('3h 25m')
    expect(compactDuration(2 * 3600)).toBe('2h')
    expect(compactDuration(5 * 60)).toBe('5m')
    expect(compactDuration(10)).toBe('1m')
  })

  it('rejects non-positive spans', () => {
    expect(compactDuration(0)).toBeUndefined()
    expect(compactDuration(Number.NaN)).toBeUndefined()
  })
})

describe('reset labels', () => {
  const now = new Date(2026, 9, 15, 15, 0, 0)
  const at = (hours: number, minutes = 0) => new Date(now.getTime() + (hours * 60 + minutes) * 60_000)

  it('counts down', () => {
    expect(resetLabel(at(3, 25), 'countdown', now)).toBe('Resets in 3h 25m')
    expect(resetLabel(at(52), 'countdown', now)).toBe('Resets in 2d 4h')
  })

  it('collapses an imminent reset to "soon"', () => {
    expect(resetLabel(at(0, 4), 'countdown', now)).toBe('Resets soon')
    expect(resetLabel(at(-1), 'absolute', now)).toBe('Resets soon')
  })

  it('shows absolute times relative to today', () => {
    const options = { locale: 'en-US', timeFormat: '12h' as const }
    expect(resetLabel(new Date(2026, 9, 15, 18, 38), 'absolute', now, options)).toBe('Resets today at 6:38 PM')
    expect(resetLabel(new Date(2026, 9, 16, 9, 0), 'absolute', now, options)).toBe('Resets tomorrow at 9:00 AM')
    expect(resetLabel(new Date(2026, 9, 20, 15, 45), 'absolute', now, options)).toBe('Resets Oct 20 at 3:45 PM')
  })

  it('supports other verbs', () => {
    expect(deadlineLabel('Limit', at(3, 5), 'countdown', now)).toBe('Limit in 3h 5m')
    expect(whenLabel(at(1), 'countdown', now)).toBe('1h')
  })
})

describe('formatAge', () => {
  const now = new Date('2026-10-15T15:00:00Z')
  it('reads like "3h ago"', () => {
    expect(formatAge(new Date('2026-10-15T14:59:30Z'), now)).toBe('just now')
    expect(formatAge(new Date('2026-10-15T14:57:00Z'), now)).toBe('3m ago')
    expect(formatAge(new Date('2026-10-15T12:00:00Z'), now)).toBe('3h ago')
    expect(formatAge(new Date('2026-10-12T15:00:00Z'), now)).toBe('3d ago')
  })
})
