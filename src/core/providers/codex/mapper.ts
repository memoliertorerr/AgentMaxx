import { asArray, asBool, asNumber, asObject, asString, type JsonObject } from '../../parse'
import type { MetricLine, MetricValue } from '../../types'
import { titleCase } from '../shared'

// wham/usage → metric lines (upstream CodexUsageMapper).

export const SESSION_MS = 5 * 3_600_000
export const WEEK_MS = 7 * 24 * 3_600_000
/** Codex flex credits are worth 4¢ each. */
export const CREDIT_USD_RATE = 0.04

export interface CodexMappedUsage {
  plan?: string
  lines: MetricLine[]
}

type WindowKind = 'session' | 'weekly'

interface WindowCandidate {
  window: JsonObject
  usedPercent: number | undefined
  fallbackKind: WindowKind
}

function periodMs(window: JsonObject): number | undefined {
  const seconds = asNumber(window.limit_window_seconds)
  return seconds === undefined ? undefined : seconds * 1000
}

function exactKind(window: JsonObject): WindowKind | undefined {
  const ms = periodMs(window)
  if (ms === SESSION_MS) return 'session'
  if (ms === WEEK_MS) return 'weekly'
  return undefined
}

function resetDate(window: JsonObject, now: Date): string | undefined {
  const resetAt = asNumber(window.reset_at)
  if (resetAt !== undefined) return new Date(resetAt * 1000).toISOString()
  const after = asNumber(window.reset_after_seconds)
  if (after !== undefined) return new Date(now.getTime() + after * 1000).toISOString()
  return undefined
}

function candidate(value: unknown, headerPercent: number | undefined, fallbackKind: WindowKind): WindowCandidate | undefined {
  const window = asObject(value) ?? (headerPercent === undefined ? undefined : {})
  if (!window) return undefined
  return { window, usedPercent: asNumber(window.used_percent) ?? headerPercent, fallbackKind }
}

/**
 * Session and Weekly are classified by each window's duration, not its slot: Codex can move a
 * sole weekly limit into the primary slot. Without a recognized duration, primary → Session
 * and secondary → Weekly.
 */
function classifiedWindowLines(
  rateLimit: JsonObject | undefined,
  labels: { session: string; weekly: string },
  headerPercents: { primary?: number | undefined; secondary?: number | undefined },
  now: Date
): MetricLine[] {
  const candidates = [
    candidate(rateLimit?.primary_window, headerPercents.primary, 'session'),
    candidate(rateLimit?.secondary_window, headerPercents.secondary, 'weekly')
  ].filter((c): c is WindowCandidate => c !== undefined)

  const lines: MetricLine[] = []
  for (const kind of ['session', 'weekly'] as const) {
    const chosen =
      candidates.find((c) => exactKind(c.window) === kind) ??
      candidates.find((c) => exactKind(c.window) === undefined && c.fallbackKind === kind)
    if (!chosen || chosen.usedPercent === undefined) continue
    const resetsAt = resetDate(chosen.window, now)
    lines.push({
      type: 'progress',
      label: kind === 'session' ? labels.session : labels.weekly,
      used: chosen.usedPercent,
      limit: 100,
      format: { kind: 'percent' },
      periodDurationMs: periodMs(chosen.window) ?? (kind === 'session' ? SESSION_MS : WEEK_MS),
      ...(resetsAt ? { resetsAt } : {})
    })
  }
  return lines
}

/** GPT-5.3-Codex-Spark limits from `additional_rate_limits`, as "Spark" / "Spark Weekly". */
function sparkLines(body: JsonObject, now: Date): MetricLine[] {
  const entries = (asArray(body.additional_rate_limits) ?? []).map(asObject).filter((e): e is JsonObject => e !== undefined)
  const spark = entries.find((entry) =>
    [entry.limit_name, entry.metered_feature].some((value) => typeof value === 'string' && value.toLowerCase().includes('spark'))
  )
  const rateLimit = asObject(spark?.rate_limit)
  if (!rateLimit) return []
  return classifiedWindowLines(rateLimit, { session: 'Spark', weekly: 'Spark Weekly' }, {}, now)
}

/** Floored credit count and its dollar value: "$32.84 · 821 credits". Negative clamps to zero. */
export function creditValues(remaining: number): MetricValue[] {
  const credits = Math.max(0, Math.floor(remaining))
  return [
    { number: credits * CREDIT_USD_RATE, kind: 'dollars' },
    { number: credits, kind: 'count', label: 'credits' }
  ]
}

function creditsRemaining(body: JsonObject, headers: Record<string, string>): number | undefined {
  const credits = asObject(body.credits)
  if (credits) {
    const balance = asNumber(credits.balance)
    if (balance !== undefined) return balance
    if (asBool(credits.has_credits) === false) return 0
  }
  return asNumber(headers['x-codex-credits-balance'])
}

export function formatCodexPlan(value: unknown): string | undefined {
  const raw = asString(value)
  if (!raw) return undefined
  switch (raw.toLowerCase()) {
    case 'prolite':
      return 'Pro 100'
    case 'pro':
      return 'Pro 200'
    case 'promax':
      return 'Pro 500'
    case 'self_serve_business_prolite':
      return 'Business Premium'
    default:
      return titleCase(raw, { separator: /_+/ })
  }
}

export function mapCodexUsage(body: JsonObject, headers: Record<string, string>, now: Date): CodexMappedUsage {
  const lines: MetricLine[] = [
    ...classifiedWindowLines(
      asObject(body.rate_limit),
      { session: 'Session', weekly: 'Weekly' },
      { primary: asNumber(headers['x-codex-primary-used-percent']), secondary: asNumber(headers['x-codex-secondary-used-percent']) },
      now
    ),
    ...sparkLines(body, now)
  ]

  const resets = asNumber(asObject(body.rate_limit_reset_credits)?.available_count)
  if (resets !== undefined && resets >= 0) {
    lines.push({ type: 'values', label: 'Rate Limit Resets', values: [{ number: Math.floor(resets), kind: 'count', label: 'available' }] })
  }

  const remaining = creditsRemaining(body, headers)
  if (remaining !== undefined) lines.push({ type: 'values', label: 'Credits', values: creditValues(remaining) })

  const plan = formatCodexPlan(body.plan_type)
  return { lines, ...(plan ? { plan } : {}) }
}
