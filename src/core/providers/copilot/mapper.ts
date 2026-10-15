import { ProviderError } from '../../errors'
import { asArray, asBool, asNumber, asObject, asString, clampPercent, parseIsoDate, type JsonObject } from '../../parse'
import type { MetricLine } from '../../types'
import { titleCase } from '../shared'

// copilot_internal/user → metric lines, and the org billing summary for org-managed seats
// (upstream CopilotUsageMapper + CopilotOrgBillingMapper).

const MONTH_MS = 30 * 24 * 3_600_000

export interface CopilotMappedUsage {
  plan?: string
  lines: MetricLine[]
  /** An org-managed (token-based billing) seat with no per-seat quota: look up org billing. */
  isOrgManagedSeat: boolean
}

export const quotaUnavailable = () => new ProviderError('notAvailable', 'Copilot usage data is unavailable for this account.')

function resetDate(value: unknown): string | undefined {
  const raw = asString(value)
  if (!raw) return undefined
  const date = parseIsoDate(raw) ?? (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : undefined)
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined
}

function percentLine(label: string, used: number, resetsAt: string | undefined): MetricLine {
  return { type: 'progress', label, used: clampPercent(used), limit: 100, format: { kind: 'percent' }, periodDurationMs: MONTH_MS, ...(resetsAt ? { resetsAt } : {}) }
}

/** A quota snapshot as percent used; undefined for unlimited (-1) or zero-entitlement buckets. */
function snapshotLine(label: string, raw: unknown, resetsAt: string | undefined): MetricLine | undefined {
  const snapshot = asObject(raw)
  if (!snapshot) return undefined
  const entitlement = asNumber(snapshot.entitlement)
  const remaining = asNumber(snapshot.remaining)
  if (asBool(snapshot.unlimited) === true || entitlement === -1 || remaining === -1) return undefined
  if (entitlement === 0) return undefined
  const percentRemaining = asNumber(snapshot.percent_remaining)
  if (percentRemaining !== undefined) return percentLine(label, 100 - percentRemaining, resetsAt)
  if (entitlement !== undefined && entitlement > 0 && remaining !== undefined) {
    return percentLine(label, 100 - (remaining / entitlement) * 100, resetsAt)
  }
  return undefined
}

function legacyLine(label: string, remainingRaw: unknown, totalRaw: unknown, resetsAt: string | undefined): MetricLine | undefined {
  const total = asNumber(totalRaw)
  const remaining = asNumber(remainingRaw)
  if (total === undefined || total <= 0 || remaining === undefined) return undefined
  return percentLine(label, (Math.max(0, total - remaining) / total) * 100, resetsAt)
}

export function planLabel(value: unknown): string | undefined {
  const raw = asString(value)
  return raw ? titleCase(raw, { separator: /[_\s-]+/, lowercaseTail: true }) : undefined
}

export function mapCopilotUsage(body: JsonObject): CopilotMappedUsage {
  const plan = planLabel(body.copilot_plan)
  const resetsAt = resetDate(body.quota_reset_date) ?? resetDate(body.limited_user_reset_date)
  const snapshots = asObject(body.quota_snapshots)
  const premium = snapshots?.premium_interactions
  const lines: MetricLine[] = []

  const credits = snapshotLine('Credits', premium, resetsAt)
  if (credits) {
    lines.push(credits)
    // Extra Usage only means something relative to an included pool.
    const premiumObject = asObject(premium)
    if (premiumObject && asBool(premiumObject.overage_permitted) === true) {
      lines.push({ type: 'values', label: 'Extra Usage', values: [{ number: Math.max(0, asNumber(premiumObject.overage_count) ?? 0), kind: 'count' }] })
    }
  }
  for (const [key, label] of [
    ['chat', 'Chat'],
    ['completions', 'Completions']
  ] as const) {
    const line = snapshotLine(label, snapshots?.[key], resetsAt)
    if (line) lines.push(line)
  }

  // The older free-tier shape, only when nothing else applied.
  if (lines.length === 0) {
    const limited = asObject(body.limited_user_quotas)
    const monthly = asObject(body.monthly_quotas)
    for (const [key, label] of [
      ['chat', 'Chat'],
      ['completions', 'Completions']
    ] as const) {
      const line = legacyLine(label, limited?.[key], monthly?.[key], resetsAt)
      if (line) lines.push(line)
    }
  }

  if (lines.length === 0) {
    // Business/Enterprise seats assigned by an org have no per-seat quota: a real, empty state.
    if (asBool(body.token_based_billing) !== true) throw quotaUnavailable()
    const used = asNumber(asObject(premium)?.credits_used)
    const personal: MetricLine[] = used !== undefined && used > 0 ? [{ type: 'values', label: 'Credits', values: [{ number: used, kind: 'count' }] }] : []
    return { lines: personal, isOrgManagedSeat: true, ...(plan ? { plan } : {}) }
  }
  return { lines, isOrgManagedSeat: false, ...(plan ? { plan } : {}) }
}

/** Org logins from GET /user/orgs. */
export function orgLogins(body: unknown): string[] {
  return (asArray(body) ?? []).flatMap((entry) => {
    const login = asString(asObject(entry)?.login)
    return login ? [login] : []
  })
}

/** Org Credits / Org Spend from an org's billing usage summary; undefined without Copilot credit usage. */
export function orgBillingLines(body: JsonObject): MetricLine[] | undefined {
  const items = (asArray(body.usageItems) ?? []).map(asObject).filter((item): item is JsonObject => item !== undefined)
  const creditItems = items.filter((item) => {
    const product = asString(item.product)?.toLowerCase()
    const unit = asString(item.unitType)?.toLowerCase()
    return product === 'copilot' && (unit === 'ai-units' || unit === 'ai-credits')
  })
  if (creditItems.length === 0) return undefined
  const credits = creditItems.reduce((sum, item) => sum + Math.max(0, asNumber(item.grossQuantity) ?? 0), 0)
  const spend = creditItems.reduce((sum, item) => sum + Math.max(0, asNumber(item.netAmount) ?? 0), 0)
  return [
    { type: 'values', label: 'Org Credits', values: [{ number: credits, kind: 'count', label: 'credits' }] },
    { type: 'values', label: 'Org Spend', values: [{ number: spend, kind: 'dollars' }] }
  ]
}
