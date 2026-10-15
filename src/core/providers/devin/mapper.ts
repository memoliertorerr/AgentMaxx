import { ProviderError } from '../../errors'
import { asBool, asNumber, asObject, asString, clampPercent, parseEpoch, parseJson } from '../../parse'
import type { MetricLine } from '../../types'

// GetUserStatus → Daily / Weekly quota and the extra-usage balance (upstream DevinUsageMapper).
// Devin reports quota as percent *remaining*; every row shows percent used.

const DAY_MS = 24 * 3_600_000
const WEEK_MS = 7 * DAY_MS

export const devinUsageError = {
  invalidResponse: (detail?: string) => new ProviderError('decoding', 'Devin quota data unavailable. Try again later.', detail),
  quotaUnavailable: () => new ProviderError('notAvailable', 'Devin quota data unavailable. Try again later.')
}

export interface DevinMappedUsage {
  plan: string
  lines: MetricLine[]
}

function quotaLine(label: string, remaining: number, resetsAt: Date | undefined, periodDurationMs: number): MetricLine {
  return {
    type: 'progress',
    label,
    used: clampPercent(100 - remaining),
    limit: 100,
    format: { kind: 'percent' },
    periodDurationMs,
    ...(resetsAt ? { resetsAt: resetsAt.toISOString() } : {})
  }
}

export function mapUserStatusBody(text: string): DevinMappedUsage {
  const userStatus = asObject(asObject(parseJson(text))?.userStatus)
  if (!userStatus) throw devinUsageError.invalidResponse('no userStatus object')
  return mapUserStatus(userStatus)
}

export function mapUserStatus(userStatus: Record<string, unknown>): DevinMappedUsage {
  const planStatus = asObject(userStatus.planStatus) ?? {}
  const planInfo = asObject(planStatus.planInfo) ?? {}
  const plan = asString(planInfo.planName) ?? 'Unknown'
  const hideDailyQuota = asBool(planInfo.hideDailyQuota) === true

  const dailyRemaining = asNumber(planStatus.dailyQuotaRemainingPercent)
  const weeklyRemaining = asNumber(planStatus.weeklyQuotaRemainingPercent)
  // Present but unparsable is schema drift: it mustn't turn into an "exhausted" 100% below.
  if (planStatus.weeklyQuotaRemainingPercent !== undefined && weeklyRemaining === undefined) {
    throw devinUsageError.invalidResponse('weeklyQuotaRemainingPercent is not a number')
  }
  const dailyReset = hideDailyQuota ? undefined : parseEpoch(planStatus.dailyQuotaResetAtUnix, 'seconds')
  const weeklyReset = parseEpoch(planStatus.weeklyQuotaResetAtUnix, 'seconds')
  const balanceMicros = asNumber(planStatus.overageBalanceMicros)

  const lines: MetricLine[] = []
  if (!hideDailyQuota && dailyRemaining !== undefined) lines.push(quotaLine('Daily quota', dailyRemaining, dailyReset, DAY_MS))

  // Proto3 JSON omits zeros: a weekly reset without a percentage is an exhausted weekly window.
  const weekly = weeklyRemaining ?? (weeklyReset ? 0 : undefined)
  if (weekly !== undefined) {
    lines.push(quotaLine('Weekly quota', weekly, weeklyReset, WEEK_MS))
  } else if (hideDailyQuota && dailyRemaining !== undefined) {
    // No weekly figure at all: show the hidden daily quota in the Weekly row so it stays meaningful.
    lines.push(quotaLine('Weekly quota', dailyRemaining, weeklyReset, WEEK_MS))
  }

  // A real zero balance stays "$0.00", not "No data".
  if (balanceMicros !== undefined) {
    lines.push({ type: 'values', label: 'Extra usage balance', values: [{ number: Math.max(0, balanceMicros) / 1_000_000, kind: 'dollars' }] })
  }
  if (lines.length === 0) throw devinUsageError.quotaUnavailable()
  return { plan, lines }
}
