import { asBool, asNumber, asObject, asString, centsToDollars, parseIsoDate, type JsonObject } from '../../parse'
import type { MetricLine } from '../../types'
import { CURSOR_LABELS, MONTH_MS, planLabel, requestBasedUnavailable, type CursorMappedUsage } from './mapper'

// The Team/Enterprise fallback: cursor.com/api/usage-summary combined with the request-count
// endpoint (upstream CursorUsageSummaryMapper). Neither response is the whole picture alone.

interface Cycle {
  resetsAt?: string
  periodDurationMs: number
}

interface DollarMeter {
  used: number
  limit: number
}

function dollarMeter(value: unknown): DollarMeter | undefined {
  const bucket = asObject(value)
  if (!bucket || asBool(bucket.enabled) === false) return undefined
  const limit = asNumber(bucket.limit)
  if (limit === undefined || limit <= 0) return undefined
  const reported = asNumber(bucket.used)
  const inferred = Math.max(0, limit - (asNumber(bucket.remaining) ?? limit))
  const used = reported !== undefined && reported > 0 ? reported : inferred
  return { used: Math.max(0, used), limit }
}

function usableDollarBucket(value: unknown): boolean {
  const bucket = asObject(value)
  if (!bucket || asBool(bucket.enabled) === false) return false
  return dollarMeter(bucket) !== undefined || (asNumber(bucket.used) ?? 0) > 0
}

export function hasUsableSummary(summary: JsonObject): boolean {
  const start = parseIsoDate(summary.billingCycleStart)
  const end = parseIsoDate(summary.billingCycleEnd)
  if (start && end && end > start) return true
  const individual = asObject(summary.individualUsage)
  const team = asObject(summary.teamUsage)
  const plan = asObject(individual?.plan)
  if (['totalPercentUsed', 'autoPercentUsed', 'apiPercentUsed'].some((key) => asNumber(plan?.[key]) !== undefined)) return true
  return [individual?.onDemand, individual?.overall, team?.onDemand, team?.pooled].some(usableDollarBucket)
}

function billingCycle(summary: JsonObject | undefined, requestUsage: JsonObject | undefined): Cycle {
  const start = parseIsoDate(summary?.billingCycleStart)
  const end = parseIsoDate(summary?.billingCycleEnd)
  if (start && end && end > start) return { resetsAt: end.toISOString(), periodDurationMs: end.getTime() - start.getTime() }
  const requestStart = parseIsoDate(requestUsage?.startOfMonth)
  return { periodDurationMs: MONTH_MS, ...(requestStart ? { resetsAt: new Date(requestStart.getTime() + MONTH_MS).toISOString() } : {}) }
}

function withCycle(cycle: Cycle): Pick<Extract<MetricLine, { type: 'progress' }>, 'periodDurationMs' | 'resetsAt'> {
  return { periodDurationMs: cycle.periodDurationMs, ...(cycle.resetsAt ? { resetsAt: cycle.resetsAt } : {}) }
}

function dollarLine(meter: DollarMeter, label: string, cycle: Cycle): MetricLine {
  return { type: 'progress', label, used: centsToDollars(meter.used), limit: centsToDollars(meter.limit), format: { kind: 'dollars' }, ...withCycle(cycle) }
}

export function mapUsageSummary(
  summary: JsonObject | undefined,
  requestUsage: JsonObject | undefined,
  planName: string | undefined,
  unavailableMessage: string
): CursorMappedUsage {
  const cycle = billingCycle(summary, requestUsage)
  const lines: MetricLine[] = []
  const individual = asObject(summary?.individualUsage)
  const team = asObject(summary?.teamUsage)

  const requests = asObject(requestUsage?.['gpt-4'])
  const requestLimit = asNumber(requests?.maxRequestUsage)
  if (requests && requestLimit !== undefined && requestLimit > 0) {
    const used = Math.max(0, asNumber(requests.numRequests) ?? asNumber(requests.numRequestsTotal) ?? 0)
    for (const label of [CURSOR_LABELS.total, CURSOR_LABELS.requests]) {
      lines.push({ type: 'progress', label, used, limit: requestLimit, format: { kind: 'count', suffix: 'requests' }, ...withCycle(cycle) })
    }
  } else {
    const limitType = asString(summary?.limitType)?.toLowerCase()
    const pooled = dollarMeter(team?.pooled)
    const percent = asNumber(asObject(individual?.plan)?.totalPercentUsed)
    const overall = dollarMeter(individual?.overall)
    if (limitType === 'team' && pooled) lines.push(dollarLine(pooled, CURSOR_LABELS.total, cycle))
    else if (percent !== undefined) {
      lines.push({ type: 'progress', label: CURSOR_LABELS.total, used: percent, limit: 100, format: { kind: 'percent' }, ...withCycle(cycle) })
    } else if (overall) lines.push(dollarLine(overall, CURSOR_LABELS.total, cycle))
    else if (pooled) lines.push(dollarLine(pooled, CURSOR_LABELS.total, cycle))
  }

  const plan = asObject(individual?.plan)
  for (const [key, label] of [
    ['autoPercentUsed', CURSOR_LABELS.auto],
    ['apiPercentUsed', CURSOR_LABELS.api]
  ] as const) {
    const percent = asNumber(plan?.[key])
    if (percent !== undefined) lines.push({ type: 'progress', label, used: percent, limit: 100, format: { kind: 'percent' }, ...withCycle(cycle) })
  }

  for (const value of [individual?.onDemand, team?.onDemand]) {
    const bucket = asObject(value)
    if (!bucket || asBool(bucket.enabled) === false) continue
    const meter = dollarMeter(bucket)
    if (meter) {
      lines.push(dollarLine(meter, CURSOR_LABELS.onDemand, cycle))
      break
    }
    const usedCents = asNumber(bucket.used)
    if (usedCents !== undefined && usedCents > 0) {
      lines.push({ type: 'values', label: CURSOR_LABELS.onDemand, values: [{ number: centsToDollars(usedCents), kind: 'dollars' }] })
      break
    }
  }

  if (lines.length === 0) throw requestBasedUnavailable(unavailableMessage)
  const label = planLabel(planName) ?? planLabel(asString(summary?.membershipType))
  return { lines, ...(label ? { plan: label } : {}) }
}
