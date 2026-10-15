import { asNumber, asObject, parseJson, type JsonObject } from '../../parse'
import type { MetricLine } from '../../types'

// OpenRouter `/credits` and `/key` payloads → metric lines (upstream OpenRouterUsageMapper). Each
// endpoint maps on its own so the card shows whatever came back.

/** OpenRouter wraps every payload in `{ "data": { … } }`. */
export function dataObject(text: string): JsonObject | undefined {
  return asObject(asObject(parseJson(text))?.data)
}

/** Credits meter + Balance. Empty when the payload has no usable total. */
export function creditsLines(data: JsonObject): MetricLine[] {
  const totalUsage = asNumber(data.total_usage)
  if (totalUsage === undefined) return []
  const used = Math.max(0, totalUsage)
  // Lifetime credits added to the account; the balance is what's left of them.
  const totalCredits = Math.max(0, asNumber(data.total_credits) ?? 0)

  const lines: MetricLine[] = []
  // A meter needs a positive ceiling; accounts that never topped up still get Balance.
  if (totalCredits > 0) lines.push({ type: 'progress', label: 'Credits', used, limit: totalCredits, format: { kind: 'dollars' } })
  // A real zero balance shows as "$0.00 left", never "No data".
  lines.push({ type: 'values', label: 'Balance', values: [{ number: Math.max(0, totalCredits - used), kind: 'dollars' }] })
  return lines
}

function spendLine(value: unknown, label: string): MetricLine | undefined {
  const amount = asNumber(value)
  // Period spend comes straight from the API, so 0 is a measured zero.
  return amount === undefined ? undefined : { type: 'values', label, values: [{ number: Math.max(0, amount), kind: 'dollars' }] }
}

/** Period spend, the per-key cap when the key has one, and the tier as the plan name. */
export function keyMetrics(data: JsonObject): { plan?: string; lines: MetricLine[] } {
  const lines: MetricLine[] = []
  for (const [field, label] of [
    ['usage_daily', 'Today'],
    ['usage_weekly', 'This Week'],
    ['usage_monthly', 'This Month']
  ] as const) {
    const line = spendLine(data[field], label)
    if (line) lines.push(line)
  }

  // `limit_remaining` is what's left in the key's current limit window, so used = limit - remaining
  // (`usage` is lifetime spend on the key and doesn't reset with the window).
  const limit = asNumber(data.limit)
  if (limit !== undefined && limit > 0) {
    const remaining = Math.max(0, asNumber(data.limit_remaining) ?? 0)
    lines.push({ type: 'progress', label: 'Key Limit', used: Math.max(0, limit - remaining), limit, format: { kind: 'dollars' } })
  }

  const plan = typeof data.is_free_tier === 'boolean' ? (data.is_free_tier ? 'Free tier' : 'Pay as you go') : undefined
  return { lines, ...(plan ? { plan } : {}) }
}
