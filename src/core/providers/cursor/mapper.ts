import { ProviderError, invalidResponse } from '../../errors'
import { asBool, asNumber, asObject, asString, centsToDollars, clampPercent, parseIsoDate, type JsonObject } from '../../parse'
import type { MetricLine } from '../../types'
import { titleCase } from '../shared'

// GetCurrentPeriodUsage (+ plan, credit grants, prepaid balance, Grok Bot) → metric lines
// (upstream CursorUsageMapper). Amounts arrive in cents.

export const MONTH_MS = 30 * 24 * 3_600_000
const WEEK_MS = 7 * 24 * 3_600_000

export const CURSOR_LABELS = {
  total: 'Total usage',
  auto: 'Cursor Models',
  api: 'Other Models',
  grokBot: 'Grok Bot usage',
  onDemand: 'On-demand',
  requests: 'Requests',
  credits: 'Credits'
} as const

export interface CursorMappedUsage {
  plan?: string
  lines: MetricLine[]
}

export const requestBasedUnavailable = (message: string) => new ProviderError('notAvailable', message)
export const GENERIC_UNAVAILABLE = 'Cursor request-based usage data unavailable. Try again later.'

/** Derived facts about a usage payload that decide which mapping applies. */
export class PlanUsageFacts {
  readonly isEnabled: boolean
  readonly hasPlanUsage: boolean
  readonly limit: number | undefined
  readonly totalPercentUsed: number | undefined
  readonly hasModelPools: boolean
  readonly spendLimitType: string | undefined
  readonly pooledLimit: number

  constructor(usage: JsonObject) {
    this.isEnabled = asBool(usage.enabled) !== false
    const planUsage = asObject(usage.planUsage)
    this.hasPlanUsage = planUsage !== undefined
    this.limit = asNumber(planUsage?.limit)
    this.totalPercentUsed = asNumber(planUsage?.totalPercentUsed)
    const auto = asNumber(planUsage?.autoPercentUsed)
    const api = asNumber(planUsage?.apiPercentUsed)
    const spent = asNumber(planUsage?.totalSpend) ?? (this.limit ?? 0) - (asNumber(planUsage?.remaining) ?? this.limit ?? 0)
    this.hasModelPools = auto !== undefined && api !== undefined && auto >= 0 && api >= 0 ? auto > 0 || api > 0 || spent === 0 : false
    const spendLimitUsage = asObject(usage.spendLimitUsage)
    this.spendLimitType = asString(spendLimitUsage?.limitType)?.toLowerCase()
    this.pooledLimit = asNumber(spendLimitUsage?.pooledLimit) ?? 0
  }

  get hasLimit(): boolean {
    return this.limit !== undefined
  }
  get planUsageLimitMissing(): boolean {
    return this.hasPlanUsage && !this.hasLimit
  }
  get planUsageUnusable(): boolean {
    return !this.hasPlanUsage || (this.planUsageLimitMissing && !this.hasModelPools)
  }
  get isTeamByShape(): boolean {
    return this.spendLimitType === 'team' || this.pooledLimit > 0
  }
  get shouldTryGenericRequestFallback(): boolean {
    return this.isEnabled && this.hasPlanUsage && !this.hasLimit && this.totalPercentUsed === undefined && !this.hasModelPools
  }
}

export function planLabel(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? titleCase(trimmed, { separator: /\s+/ }) : undefined
}

interface Cycle {
  resetsAt?: string
  periodDurationMs: number
}

function billingCycle(usage: JsonObject): Cycle {
  const start = asNumber(usage.billingCycleStart)
  const end = asNumber(usage.billingCycleEnd)
  if (start === undefined || end === undefined || end <= start) {
    return { periodDurationMs: MONTH_MS, ...(end !== undefined ? { resetsAt: new Date(end).toISOString() } : {}) }
  }
  return { resetsAt: new Date(end).toISOString(), periodDurationMs: end - start }
}

function percentLine(label: string, used: number, cycle: Cycle): MetricLine {
  return { type: 'progress', label, used, limit: 100, format: { kind: 'percent' }, periodDurationMs: cycle.periodDurationMs, ...(cycle.resetsAt ? { resetsAt: cycle.resetsAt } : {}) }
}

/** Grok Bot's separate weekly allowance, or undefined for accounts without one. */
export function mapGrokBotUsage(usage: JsonObject): MetricLine | undefined {
  if (asBool(usage.usesPooledEnterpriseAllowance) === true) return undefined
  if (asBool(usage.hasNonZeroIncludedLimit) === false || asBool(usage.includedLimitZero) === true) return undefined
  const percent = typeof usage.usagePercent === 'boolean' ? undefined : asNumber(usage.usagePercent)
  if (percent === undefined || percent < 0) return undefined
  const reset = parseIsoDate(usage.nextResetTimestampUtc)
  const start = parseIsoDate(usage.currentPeriodStart)
  const periodDurationMs = start && reset && reset > start ? reset.getTime() - start.getTime() : WEEK_MS
  return {
    type: 'progress',
    label: CURSOR_LABELS.grokBot,
    used: clampPercent(percent),
    limit: 100,
    format: { kind: 'percent' },
    periodDurationMs,
    ...(reset ? { resetsAt: reset.toISOString() } : {})
  }
}

/** A negative Stripe customer balance is prepaid credit, in cents. */
export function stripeBalanceCents(body: JsonObject | undefined): number {
  const balance = asNumber(body?.customerBalance)
  return balance !== undefined && balance < 0 ? Math.abs(balance) : 0
}

function creditsLine(creditGrants: JsonObject | undefined, prepaidCents: number): MetricLine | undefined {
  const hasGrants = asBool(creditGrants?.hasCreditGrants) === true
  const totalCents = hasGrants ? (asNumber(creditGrants?.totalCents) ?? 0) : 0
  const usedCents = hasGrants ? (asNumber(creditGrants?.usedCents) ?? 0) : 0
  const validGrants = hasGrants && totalCents > 0
  const combined = (validGrants ? totalCents : 0) + prepaidCents
  if (combined <= 0) return undefined
  const remaining = Math.max(0, combined - (validGrants ? usedCents : 0))
  return { type: 'values', label: CURSOR_LABELS.credits, values: [{ number: centsToDollars(remaining), kind: 'dollars' }] }
}

function onDemandSpendCents(spendLimitUsage: JsonObject, limit: number, remaining: number): number {
  const reported = [spendLimitUsage.individualUsed, spendLimitUsage.pooledUsed, spendLimitUsage.totalSpend]
    .map(asNumber)
    .filter((value): value is number => value !== undefined)
  const positive = reported.find((value) => value > 0)
  if (positive !== undefined) return positive
  const inferred = Math.max(0, limit - remaining)
  return inferred > 0 ? inferred : (reported[0] ?? 0)
}

export function mapCursorUsage(
  usage: JsonObject,
  planName: string | undefined,
  creditGrants: JsonObject | undefined,
  prepaidCents: number
): CursorMappedUsage {
  const facts = new PlanUsageFacts(usage)
  const planUsage = asObject(usage.planUsage)
  if (!facts.isEnabled || !planUsage) throw new ProviderError('notAvailable', 'No active Cursor subscription.')
  if (!facts.hasLimit && facts.totalPercentUsed === undefined && !facts.hasModelPools) {
    throw invalidResponse('Total usage limit missing from API response.')
  }

  const lines: MetricLine[] = []
  const credits = creditsLine(creditGrants, prepaidCents)
  if (credits) lines.push(credits)

  const usedCents = asNumber(planUsage.totalSpend) ?? (facts.limit ?? 0) - (asNumber(planUsage.remaining) ?? 0)
  const computedPercent = facts.limit !== undefined && facts.limit > 0 ? (usedCents / facts.limit) * 100 : 0
  const cycle = billingCycle(usage)
  const isTeam = planName?.trim().toLowerCase() === 'team' || facts.isTeamByShape

  if (isTeam && facts.hasModelPools) {
    // Modern Teams seats still report a stale $20 allowance; only Cursor's structured percent counts.
    if (facts.totalPercentUsed !== undefined) lines.push(percentLine(CURSOR_LABELS.total, facts.totalPercentUsed, cycle))
  } else if (isTeam) {
    if (facts.limit === undefined) throw requestBasedUnavailable(GENERIC_UNAVAILABLE)
    lines.push({
      type: 'progress',
      label: CURSOR_LABELS.total,
      used: centsToDollars(usedCents),
      limit: centsToDollars(facts.limit),
      format: { kind: 'dollars' },
      periodDurationMs: cycle.periodDurationMs,
      ...(cycle.resetsAt ? { resetsAt: cycle.resetsAt } : {})
    })
  } else {
    lines.push(percentLine(CURSOR_LABELS.total, facts.totalPercentUsed ?? computedPercent, cycle))
  }

  const auto = asNumber(planUsage.autoPercentUsed)
  if (auto !== undefined) lines.push(percentLine(CURSOR_LABELS.auto, auto, cycle))
  const api = asNumber(planUsage.apiPercentUsed)
  if (api !== undefined) lines.push(percentLine(CURSOR_LABELS.api, api, cycle))

  const spendLimitUsage = asObject(usage.spendLimitUsage)
  if (spendLimitUsage) {
    const limit = asNumber(spendLimitUsage.individualLimit) ?? asNumber(spendLimitUsage.pooledLimit) ?? 0
    const remaining = asNumber(spendLimitUsage.individualRemaining) ?? asNumber(spendLimitUsage.pooledRemaining) ?? 0
    const spent = onDemandSpendCents(spendLimitUsage, limit, remaining)
    if (limit > 0) {
      lines.push({ type: 'progress', label: CURSOR_LABELS.onDemand, used: centsToDollars(spent), limit: centsToDollars(limit), format: { kind: 'dollars' } })
    } else if (spent > 0) {
      lines.push({ type: 'values', label: CURSOR_LABELS.onDemand, values: [{ number: centsToDollars(spent), kind: 'dollars' }] })
    }
  }

  const plan = planLabel(planName)
  return { lines, ...(plan ? { plan } : {}) }
}

/** The legacy request-count shape from cursor.com/api/usage. */
export function mapRequestBasedUsage(usage: JsonObject | undefined, planName: string | undefined, unavailableMessage: string): CursorMappedUsage {
  const requests = asObject(usage?.['gpt-4'])
  const limit = asNumber(requests?.maxRequestUsage)
  if (!requests || limit === undefined || limit <= 0) throw requestBasedUnavailable(unavailableMessage)
  const used = asNumber(requests.numRequests) ?? 0
  const cycleStart = parseIsoDate(usage?.startOfMonth)
  const resetsAt = cycleStart ? new Date(cycleStart.getTime() + MONTH_MS).toISOString() : undefined
  const plan = planLabel(planName)
  return {
    lines: [
      { type: 'progress', label: CURSOR_LABELS.requests, used, limit, format: { kind: 'count', suffix: 'requests' }, periodDurationMs: MONTH_MS, ...(resetsAt ? { resetsAt } : {}) }
    ],
    ...(plan ? { plan } : {})
  }
}

/** Whether to switch to the team/enterprise summary fallback, and the message if it has nothing. */
export function requestBasedFallback(usage: JsonObject, planName: string | undefined, planInfoUnavailable: boolean): string | undefined {
  const facts = new PlanUsageFacts(usage)
  if (!facts.isEnabled) return undefined
  const plan = planName?.trim().toLowerCase() ?? ''
  if (facts.planUsageUnusable && plan === 'enterprise') return 'Enterprise usage data unavailable. Try again later.'
  if (facts.planUsageUnusable && plan === 'team') return 'Team request-based usage data unavailable. Try again later.'
  if (facts.planUsageUnusable && facts.totalPercentUsed === undefined && plan === '' && planInfoUnavailable) return GENERIC_UNAVAILABLE
  if (facts.isTeamByShape && facts.planUsageLimitMissing && !facts.hasModelPools) return GENERIC_UNAVAILABLE
  return undefined
}
