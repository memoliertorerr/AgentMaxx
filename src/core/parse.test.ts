import { describe, expect, it } from 'vitest'
import { asBool, asNumber, asObject, asString, centsToDollars, clampPercent, jwtPayload, parseEpoch, parseIsoDate } from './parse'

describe('scalar readers', () => {
  it('reads numbers and numeric strings, rejecting booleans', () => {
    expect(asNumber(42)).toBe(42)
    expect(asNumber(' 12.5 ')).toBe(12.5)
    expect(asNumber(true)).toBeUndefined()
    expect(asNumber('')).toBeUndefined()
    expect(asNumber(Number.POSITIVE_INFINITY)).toBeUndefined()
  })

  it('reads booleans permissively', () => {
    expect(asBool('TRUE')).toBe(true)
    expect(asBool(0)).toBe(false)
    expect(asBool('yes')).toBeUndefined()
  })

  it('reads non-empty strings and plain objects', () => {
    expect(asString('  hi ')).toBe('hi')
    expect(asString('   ')).toBeUndefined()
    expect(asObject([])).toBeUndefined()
    expect(asObject({ a: 1 })).toEqual({ a: 1 })
  })

  it('clamps percents and converts cents', () => {
    expect(clampPercent(140)).toBe(100)
    expect(clampPercent(Number.NaN)).toBe(0)
    expect(centsToDollars(1999.4)).toBe(19.99)
  })
})

describe('jwtPayload', () => {
  it('decodes the base64url middle segment', () => {
    const payload = Buffer.from(JSON.stringify({ sub: 'user-1', exp: 1 })).toString('base64url')
    expect(jwtPayload(`header.${payload}.sig`)).toEqual({ sub: 'user-1', exp: 1 })
    expect(jwtPayload('not-a-jwt')).toBeUndefined()
  })
})

describe('parseIsoDate', () => {
  it('parses the shapes providers return', () => {
    expect(parseIsoDate('2026-10-15T12:00:00Z')?.toISOString()).toBe('2026-10-15T12:00:00.000Z')
    expect(parseIsoDate('2026-10-15T12:00:00.123456+02:00')?.toISOString()).toBe('2026-10-15T10:00:00.123Z')
    expect(parseIsoDate('2026-10-15 12:00:00 UTC')?.toISOString()).toBe('2026-10-15T12:00:00.000Z')
    expect(parseIsoDate('2026-10-15T12:00:00')?.toISOString()).toBe('2026-10-15T12:00:00.000Z')
  })

  it('rejects junk', () => {
    expect(parseIsoDate('soon')).toBeUndefined()
    expect(parseIsoDate(12)).toBeUndefined()
  })
})

describe('parseEpoch', () => {
  it('reads seconds and milliseconds as documented', () => {
    expect(parseEpoch(1_760_529_600, 'seconds')?.toISOString()).toBe('2025-10-15T12:00:00.000Z')
    expect(parseEpoch('1760529600000', 'milliseconds')?.toISOString()).toBe('2025-10-15T12:00:00.000Z')
    expect(parseEpoch(0, 'seconds')).toBeUndefined()
  })
})
