import { invalidResponse } from '../../errors'
import { asNumber, asObject, asString, clampPercent, parseIsoDate, parseJson } from '../../parse'
import type { MetricLine } from '../../types'

// `GET /zen/go/v1/usage` → Session / Weekly / Monthly percent meters (upstream OpenCodeUsageMapper).

const HOUR_MS = 3_600_000
const SESSION_MS = 5 * HOUR_MS
const WEEK_MS = 7 * 24 * HOUR_MS
const MONTH_MS = 30 * 24 * HOUR_MS

/**
 * How close to exactly one period a zero-usage rolling reset must be to count as the "if you
 * started now" placeholder. OpenCode rounds to whole seconds, and so do HTTP Date headers.
 */
const PLACEHOLDER_TOLERANCE_MS = 2000

/**
 * One window. With nothing used in the rolling session, the API answers `resetsAt = now + 5h`
 * on every request; that placeholder is dropped so the row reads "Not started". It's judged at
 * capture time against the server's own clock (the Date header) to avoid local clock skew.
 */
function window(raw: unknown, label: string, periodMs: number, capturedAt: Date, dropsPlaceholderReset = false): MetricLine {
  const object = asObject(raw)
  const percent = asNumber(object?.percent)
  const reportedReset = typeof object?.resetsAt === 'string' ? parseIsoDate(object.resetsAt) : undefined
  if (percent === undefined || !reportedReset) throw invalidResponse(`${label} window missing percent or resetsAt`)
  const used = clampPercent(percent)
  let resetsAt: Date | undefined = reportedReset
  if (dropsPlaceholderReset && used === 0) {
    const distance = Math.abs(reportedReset.getTime() - capturedAt.getTime() - periodMs)
    if (distance <= PLACEHOLDER_TOLERANCE_MS) resetsAt = undefined
  }
  return { type: 'progress', label, used, limit: 100, format: { kind: 'percent' }, periodDurationMs: periodMs, ...(resetsAt ? { resetsAt: resetsAt.toISOString() } : {}) }
}

/** The response's own clock (HTTP Date header), else when it was received. */
export function referenceDate(dateHeader: string | undefined, receivedAt: Date): Date {
  const parsed = dateHeader ? Date.parse(dateHeader) : Number.NaN
  return Number.isNaN(parsed) ? receivedAt : new Date(parsed)
}

export function mapGoUsage(text: string, capturedAt: Date): MetricLine[] {
  const usage = asObject(asObject(parseJson(text))?.usage)
  if (!usage) throw invalidResponse('Go usage body without a usage object')
  return [
    window(usage.rolling, 'Session', SESSION_MS, capturedAt, true),
    window(usage.weekly, 'Weekly', WEEK_MS, capturedAt),
    window(usage.monthly, 'Monthly', MONTH_MS, capturedAt)
  ]
}

/** The `{ error: { type } }` discriminator (`AuthError`, `EntitlementError`, …), when present. */
export function errorType(text: string): string | undefined {
  return asString(asObject(asObject(parseJson(text))?.error)?.type)
}
