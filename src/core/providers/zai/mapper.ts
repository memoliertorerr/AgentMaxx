import { invalidResponse } from '../../errors'
import { asArray, asNumber, asObject, asString, clampPercent, parseEpoch, parseJson, type JsonObject } from '../../parse'
import type { MetricLine } from '../../types'

// Z.ai quota + subscription payloads → metric lines (upstream ZAIUsageMapper):
// - CREDIT_LIMIT (TOKENS_LIMIT in older responses) is a percentage window; a sub-daily window is
//   Session and a multi-day one is Weekly, each carrying the payload's own window length;
// - TIME_LIMIT is the monthly web-search / web-reader / Zread count.

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
export const MONTH_MS = 30 * DAY_MS

/** Z.ai's window units: 3 hours, 4 days, 5 months, 6 weeks. Unknown units are skipped. */
const UNIT_MS: Readonly<Record<number, number>> = { 3: HOUR_MS, 4: DAY_MS, 5: MONTH_MS, 6: 7 * DAY_MS }

/** A 2xx `success:false` body saying the account has no GLM Coding Plan (the key itself is fine). */
export function isNoCodingPlan(body: unknown): boolean {
  const root = asObject(body)
  if (!root || root.success !== false) return false
  return (typeof root.msg === 'string' ? root.msg : '').toLowerCase().includes('coding plan')
}

/** `productName` of the first subscription ("GLM Coding Max"). */
export function planName(body: unknown): string | undefined {
  const first = asObject(asArray(asObject(body)?.data)?.[0])
  return asString(first?.productName)
}

function entryType(entry: JsonObject): string | undefined {
  // Z.ai has used either field across revisions.
  if (typeof entry.type === 'string') return entry.type
  return typeof entry.name === 'string' ? entry.name : undefined
}

function windowMs(entry: JsonObject): number | undefined {
  const unit = asNumber(entry.unit)
  const number = asNumber(entry.number)
  if (unit === undefined || number === undefined || !(number > 0)) throw invalidResponse('quota window without unit/number')
  const unitMs = UNIT_MS[unit]
  if (unitMs === undefined) return undefined
  const duration = unitMs * number
  if (!(duration >= 1) || !Number.isSafeInteger(Math.trunc(duration))) throw invalidResponse('quota window out of range')
  return Math.trunc(duration)
}

function resetsAt(entry: JsonObject): string | undefined {
  // Epoch milliseconds, e.g. 1770648402389.
  return parseEpoch(entry.nextResetTime, 'milliseconds')?.toISOString()
}

function percentLine(entry: JsonObject, label: string, periodMs: number): MetricLine {
  const percentage = asNumber(entry.percentage)
  if (percentage === undefined) throw invalidResponse(`${label} quota without a percentage`)
  const reset = resetsAt(entry)
  return { type: 'progress', label, used: clampPercent(percentage), limit: 100, format: { kind: 'percent' }, periodDurationMs: periodMs, ...(reset ? { resetsAt: reset } : {}) }
}

function webSearchLine(entry: JsonObject): MetricLine {
  const used = asNumber(entry.currentValue)
  const limit = asNumber(entry.usage)
  if (used === undefined || limit === undefined || used < 0 || limit < 0) throw invalidResponse('web-search quota without currentValue/usage')
  const reset = resetsAt(entry)
  return {
    type: 'progress',
    label: 'Web Searches',
    used,
    limit,
    format: { kind: 'count', suffix: 'searches' },
    periodDurationMs: MONTH_MS,
    ...(reset ? { resetsAt: reset } : {})
  }
}

/**
 * Session, Weekly, and Web Searches from the quota body. Missing required values are an invalid
 * response, never zero usage; an empty `limits` array is a valid no-data state (no lines).
 */
export function mapZaiQuota(body: unknown): MetricLine[] {
  const root = asObject(body)
  if (!root) throw invalidResponse('quota body is not an object')
  // `data.limits`, or `limits` on the root object (older responses).
  let container: JsonObject = root
  if (root.data !== undefined) {
    const data = asObject(root.data)
    if (!data) throw invalidResponse('quota data is not an object')
    container = data
  }
  const rawLimits = asArray(container.limits)
  const limits = rawLimits?.map(asObject)
  if (!limits || limits.some((entry) => entry === undefined)) throw invalidResponse('quota limits missing')
  const entries = limits as JsonObject[]

  const lines: MetricLine[] = []
  let sawRecognizedLimit = false
  for (const entry of entries) {
    const type = entryType(entry)
    if (type !== 'CREDIT_LIMIT' && type !== 'TOKENS_LIMIT') continue
    const periodMs = windowMs(entry)
    if (periodMs === undefined) continue
    sawRecognizedLimit = true
    lines.push(percentLine(entry, periodMs < DAY_MS ? 'Session' : 'Weekly', periodMs))
  }
  const web = entries.find((entry) => entry.type === 'TIME_LIMIT' || entry.name === 'TIME_LIMIT')
  if (web) {
    sawRecognizedLimit = true
    lines.push(webSearchLine(web))
  }
  if (lines.length === 0 && sawRecognizedLimit) throw invalidResponse('recognized limits produced no lines')
  return lines
}

export function parseZaiBody(text: string): unknown {
  const parsed = parseJson(text)
  if (parsed === undefined) throw invalidResponse(`quota body is not JSON (${text.length} bytes)`)
  return parsed
}
