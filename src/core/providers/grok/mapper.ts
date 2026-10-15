import { ProviderError, httpCategory } from '../../errors'
import { isAuthFailure, isSuccess, type HttpResponse } from '../../http'
import { asNumber, asObject, asString, clampPercent, parseIsoDate, parseJson } from '../../parse'
import type { MetricLine } from '../../types'
import { grokAuthError } from './auth'

// `/v1/billing?format=credits` → the Weekly meter and the pay-as-you-go badge, and `/v1/settings` →
// the plan name (upstream GrokUsageMapper + GrokCreditsConfigDecoder). The body is proto3 JSON, so
// zero-valued fields are dropped: a missing percent or cap means 0, not a schema change.

export const grokUsageError = {
  connectionFailed: (detail?: string) => new ProviderError('network', 'Grok billing request failed. Check your connection.', detail),
  invalidResponse: (detail?: string) => new ProviderError('decoding', 'Grok billing response changed.', detail),
  requestFailed: (status: number) => new ProviderError(httpCategory(status), `Grok billing request failed (HTTP ${status}). Try again later.`)
}

export const WEEKLY_PERIOD_TYPE = 'USAGE_PERIOD_TYPE_WEEKLY'
export const TEAM_BILLING_WARNING = 'Team accounts have no personal quota, so Weekly and Extra Usage stay empty.'

export interface GrokCreditsConfig {
  periodType: string
  /** 0...100, finite (clamped by the mapper). */
  usedPercent: number
  periodStart: Date
  periodEnd: Date
  /** Pay-as-you-go cap in credits; 0 when disabled. */
  onDemandCap: number
}

export function decodeCreditsConfig(text: string): GrokCreditsConfig {
  const config = asObject(asObject(parseJson(text))?.config)
  const period = asObject(config?.currentPeriod)
  const periodType = asString(period?.type)
  const periodStart = parseIsoDate(period?.start)
  const periodEnd = parseIsoDate(period?.end)
  if (!config || !periodType || !periodStart || !periodEnd || periodEnd <= periodStart) {
    throw grokUsageError.invalidResponse('credits config without a usable current period')
  }

  // Absent means 0; present but non-numeric is drift and must not read as 0%.
  let usedPercent = 0
  if (config.creditUsagePercent !== undefined) {
    const number = asNumber(config.creditUsagePercent)
    if (number === undefined) throw grokUsageError.invalidResponse('creditUsagePercent is not a number')
    usedPercent = number
  }

  let onDemandCap = 0
  if (config.onDemandCap !== undefined) {
    const cap = asObject(config.onDemandCap)
    const value = cap ? asNumber(cap.val ?? 0) : undefined
    if (value === undefined) throw grokUsageError.invalidResponse('onDemandCap is not a number')
    onDemandCap = value
  }
  return { periodType, usedPercent, periodStart, periodEnd, onDemandCap }
}

/** Weekly (only for a weekly period: a monthly percent under that label would mislead) plus the cap badge. */
export function mapCreditsConfig(response: HttpResponse): MetricLine[] {
  if (isAuthFailure(response)) throw grokAuthError.expired()
  if (!isSuccess(response)) throw grokUsageError.requestFailed(response.status)
  const config = decodeCreditsConfig(response.text)
  const lines: MetricLine[] = []
  if (config.periodType === WEEKLY_PERIOD_TYPE) {
    lines.push({
      type: 'progress',
      label: 'Weekly limit',
      used: clampPercent(config.usedPercent),
      limit: 100,
      format: { kind: 'percent' },
      resetsAt: config.periodEnd.toISOString(),
      periodDurationMs: Math.round(config.periodEnd.getTime() - config.periodStart.getTime())
    })
  }
  const enabled = config.onDemandCap > 0
  lines.push({ type: 'badge', label: 'Pay as you go', text: enabled ? `${String(config.onDemandCap)} cap` : 'Disabled', colorHex: enabled ? '#22c55e' : '#a3a3a3' })
  return lines
}

/** HTTP 412 "No personal team.": a team login, which has no personal quota on this endpoint. */
export function isTeamBillingUnavailable(response: HttpResponse): boolean {
  if (response.status !== 412) return false
  const error = asObject(parseJson(response.text))?.error
  return typeof error === 'string' && error.toLowerCase().includes('no personal team')
}

export function grokPlanName(response: HttpResponse): string | undefined {
  if (!isSuccess(response)) return undefined
  return asString(asObject(parseJson(response.text))?.subscription_tier_display)
}
