import { invalidResponse } from '../../errors'
import { asNumber, asObject, clampPercent, parseIsoDate, parseJson } from '../../parse'
import type { MetricLine } from '../../types'

// `/api/balance` → Session + Weekly (legacy plans) or Monthly (current plans), then Purchased
// Credits; `/api/me` → the plan (upstream OllamaUsageMapper). Ollama reports what remains; the rows
// show what's used.

const SESSION_MS = 5 * 3_600_000
const WEEK_MS = 7 * 24 * 3_600_000

/** Why there's no plan badge matters: an account without a plan is ordinary, an unreadable answer isn't. */
export type OllamaPlan = { kind: 'named'; name: string } | { kind: 'absent' } | { kind: 'unreadable' }

function legacyLine(raw: unknown, label: string, periodMs: number): MetricLine | undefined {
  const entry = asObject(raw)
  const remaining = asNumber(entry?.remaining_percent)
  if (!entry || remaining === undefined) return undefined
  const resetsAt = parseIsoDate(entry.resets_at)
  // A period only pairs with a real reset; alone it would render a static "Resets in 5h".
  return {
    type: 'progress',
    label,
    used: clampPercent(100 - remaining),
    limit: 100,
    format: { kind: 'percent' },
    ...(resetsAt ? { resetsAt: resetsAt.toISOString(), periodDurationMs: periodMs } : {})
  }
}

function monthlyLine(included: Record<string, unknown>): MetricLine | undefined {
  const allowance = asNumber(included.allowance_usd)
  const balance = asNumber(included.balance_usd)
  if (allowance === undefined || !(allowance > 0) || balance === undefined) return undefined
  const period = asObject(included.period)
  const from = parseIsoDate(period?.from)
  const until = parseIsoDate(period?.until)
  const periodMs = from && until && until > from ? until.getTime() - from.getTime() : undefined
  return {
    type: 'progress',
    label: 'Monthly',
    used: Math.min(allowance, Math.max(0, allowance - balance)),
    limit: allowance,
    format: { kind: 'dollars' },
    ...(until ? { resetsAt: until.toISOString() } : {}),
    ...(periodMs !== undefined ? { periodDurationMs: periodMs } : {})
  }
}

export function balanceLines(text: string): MetricLine[] {
  const root = asObject(parseJson(text))
  const included = asObject(root?.included)
  // The plan allowance is what this provider exists to show; without it the answer isn't understood.
  if (!root || !included) throw invalidResponse('balance without an included object')
  const lines = [legacyLine(included.session, 'Session', SESSION_MS), legacyLine(included.weekly, 'Weekly', WEEK_MS), monthlyLine(included)].filter(
    (line): line is MetricLine => line !== undefined
  )
  if (lines.length === 0) throw invalidResponse('balance with no readable allowance')
  const purchased = asNumber(asObject(root.purchased)?.balance_usd)
  // A real zero balance is shown, not "No data".
  if (purchased !== undefined) lines.push({ type: 'values', label: 'Purchased Credits', values: [{ number: Math.max(0, purchased), kind: 'dollars' }] })
  return lines
}

function capitalized(text: string): string {
  return text.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

/** ollama.com sends `Plan`; the local Ollama server lowercases it when proxying. */
export function ollamaPlan(text: string): OllamaPlan {
  const root = asObject(parseJson(text))
  if (!root) return { kind: 'unreadable' }
  const raw = root.Plan !== undefined ? root.Plan : root.plan
  if (typeof raw !== 'string') return { kind: 'unreadable' }
  const name = raw.trim()
  return name ? { kind: 'named', name: capitalized(name) } : { kind: 'absent' }
}
