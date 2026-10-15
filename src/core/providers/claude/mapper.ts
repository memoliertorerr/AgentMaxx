import { asArray, asBool, asNumber, asObject, asString, centsToDollars, parseIsoDate, type JsonObject } from '../../parse'
import type { MetricLine } from '../../types'
import { titleCase } from '../shared'
import type { ClaudeOAuth } from './auth'

// /api/oauth/usage → metric lines (upstream ClaudeUsageMapper).

export const SESSION_MS = 5 * 3_600_000
export const WEEK_MS = 7 * 24 * 3_600_000

export const EXTRA_USAGE_LABEL = 'Extra usage spent'

export interface ClaudeMappedUsage {
  plan?: string
  lines: MetricLine[]
  warning?: string
}

/** ISO strings, or epoch seconds / milliseconds told apart by magnitude. */
function resetDate(value: unknown): string | undefined {
  const iso = parseIsoDate(value)
  if (iso) return iso.toISOString()
  const number = asNumber(value)
  if (number === undefined) return undefined
  const ms = Math.abs(number) < 1e10 ? number * 1000 : number
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function usageWindow(value: unknown, label: string, periodMs: number): MetricLine | undefined {
  const window = asObject(value)
  const used = asNumber(window?.utilization)
  if (!window || used === undefined) return undefined
  const resetsAt = resetDate(window.resets_at)
  return { type: 'progress', label, used, limit: 100, format: { kind: 'percent' }, periodDurationMs: periodMs, ...(resetsAt ? { resetsAt } : {}) }
}

/** A model-scoped weekly limit from the `limits` array, matched by model display name. */
function scopedWeeklyLimit(limits: unknown, modelName: string, label: string): MetricLine | undefined {
  for (const entry of asArray(limits) ?? []) {
    const object = asObject(entry)
    if (!object || object.kind !== 'weekly_scoped') continue
    const model = asObject(asObject(object.scope)?.model)
    if (model?.display_name !== modelName) continue
    const used = asNumber(object.percent)
    if (used === undefined) continue
    const resetsAt = resetDate(object.resets_at)
    return { type: 'progress', label, used, limit: 100, format: { kind: 'percent' }, periodDurationMs: WEEK_MS, ...(resetsAt ? { resetsAt } : {}) }
  }
  return undefined
}

function extraUsage(value: unknown): MetricLine | undefined {
  const object = asObject(value)
  if (!object || asBool(object.is_enabled) !== true) return undefined
  const usedCents = asNumber(object.used_credits)
  if (usedCents === undefined) return undefined
  const used = centsToDollars(usedCents)
  const limitCents = asNumber(object.monthly_limit)
  if (limitCents !== undefined && limitCents > 0) {
    return { type: 'progress', label: EXTRA_USAGE_LABEL, used, limit: centsToDollars(limitCents), format: { kind: 'dollars' } }
  }
  if (used > 0) return { type: 'values', label: EXTRA_USAGE_LABEL, values: [{ number: used, kind: 'dollars' }] }
  return undefined
}

export function mapClaudeUsage(body: JsonObject, oauth: ClaudeOAuth): ClaudeMappedUsage {
  const lines = [
    usageWindow(body.five_hour, 'Session', SESSION_MS),
    usageWindow(body.seven_day, 'Weekly', WEEK_MS),
    usageWindow(body.seven_day_sonnet, 'Sonnet', WEEK_MS),
    scopedWeeklyLimit(body.limits, 'Fable', 'Fable'),
    extraUsage(body.extra_usage)
  ].filter((line): line is MetricLine => line !== undefined)
  const plan = formatClaudePlan(oauth.subscriptionType, oauth.rateLimitTier)
  return { lines, ...(plan ? { plan } : {}) }
}

/** "max" + "default_claude_max_5x" → "Max 5x". */
export function formatClaudePlan(subscriptionType: string | undefined, rateLimitTier: string | undefined): string | undefined {
  const raw = asString(subscriptionType)
  if (!raw) return undefined
  const base = titleCase(raw, { separator: /\s+/, lowercaseTail: true })
  const multiplier = rateLimitTier?.match(/\d+x/)?.[0]
  return multiplier ? `${base} ${multiplier}` : base
}

/**
 * The plan from the live profile (`organization_type` "claude_max" → "Max"), falling back to the
 * stored login per field. Undefined when the profile has no organization.
 */
export function formatLivePlan(profile: JsonObject, oauth: ClaudeOAuth): string | undefined {
  const organization = asObject(profile.organization)
  if (!organization) return undefined
  const type = asString(organization.organization_type)?.replace(/^claude_/, '')
  return formatClaudePlan(type ?? oauth.subscriptionType, asString(organization.rate_limit_tier) ?? oauth.rateLimitTier)
}

function minutes(seconds: number): string {
  return seconds > 0 ? `${Math.ceil(seconds / 60)}m` : 'now'
}

/** The header warning while Anthropic rate-limits the usage endpoint. */
export function rateLimitedWarning(retryAfterSeconds: number | undefined): string {
  const base = 'Updates blocked by Anthropic. Be patient — manual refreshes will make it worse.'
  return retryAfterSeconds === undefined ? base : `${base} Retrying in ~${minutes(retryAfterSeconds)}.`
}
