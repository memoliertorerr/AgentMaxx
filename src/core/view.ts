import { compactDuration, formatAge, formatValue, resetLabel, type DateFormatOptions } from './format'
import {
  FRESH_SESSION_TOOLTIP,
  barFraction,
  hasResetLabel,
  isFreshSessionWindow,
  meterState,
  meterTooltip,
  paceTick,
  progressHeadline,
  progressTrailing,
  severityOf,
  type MeterSeverity
} from './progress'
import type { Settings } from './settings'
import type { MetricView, ProviderView } from './state'
import type { ProgressLine, ValuesLine } from './types'

// View models for the dashboard: everything a row needs, computed outside React so it's
// unit-tested and the components stay thin. Renderer-safe.

export type PaceNote =
  | { kind: 'spare'; text: string }
  | { kind: 'runOut'; text: string | undefined }
  | { kind: 'pacing'; text: string }

export interface ProgressRowModel {
  headline: string
  /** The trailing label: a reset, "Not started", or limit context. */
  trailing?: string
  /** True when clicking the trailing label should flip countdown ⟷ exact time. */
  trailingIsReset: boolean
  /** Hover text for the trailing label: the other reset format, or the fresh-session note. */
  trailingTooltip?: string
  fraction: number
  severity: MeterSeverity
  note?: PaceNote
  /** Even-pace tick position (0...1) on the bar. */
  tick?: number
  /** Hover text for the bar: where pace lands at reset. */
  barTooltip?: string
}

export function dateOptions(settings: Settings): DateFormatOptions {
  return { timeFormat: settings.timeFormat }
}

export function progressRow(line: ProgressLine, metric: Pick<MetricView, 'sessionStartSignal'>, settings: Settings, now: Date): ProgressRowModel {
  const options = {
    now,
    resetMode: settings.resetMode,
    dateFormat: dateOptions(settings),
    ...(metric.sessionStartSignal ? { sessionStartSignal: metric.sessionStartSignal } : {})
  }
  const state = meterState(line, options)
  const trailing = progressTrailing(line, options)
  const trailingIsReset = hasResetLabel(line, metric.sessionStartSignal, now)

  let trailingTooltip: string | undefined
  if (isFreshSessionWindow(line, metric.sessionStartSignal, now)) {
    trailingTooltip = FRESH_SESSION_TOOLTIP
  } else if (trailingIsReset && line.resetsAt) {
    const other = settings.resetMode === 'countdown' ? 'absolute' : 'countdown'
    trailingTooltip = resetLabel(new Date(line.resetsAt), other, now, dateOptions(settings))
  }

  let note: PaceNote | undefined
  let tick: number | undefined
  switch (state.kind) {
    case 'closeToLimit':
      note = { kind: 'spare', text: state.spare }
      break
    case 'runningOut':
      note = { kind: 'runOut', text: state.eta }
      break
    case 'spent':
      note = { kind: 'runOut', text: 'Limit reached' }
      break
    case 'healthy':
      if (settings.alwaysShowPacing) note = { kind: 'pacing', text: meterTooltip(state) ?? '' }
      break
    case 'level':
      break
  }
  if (state.kind === 'closeToLimit' || state.kind === 'runningOut' || (state.kind === 'healthy' && settings.alwaysShowPacing)) {
    tick = paceTickFor(line, state, now, settings)
  }

  const barTooltip = meterTooltip(state)
  return {
    headline: progressHeadline(line, settings.displayMode),
    ...(trailing ? { trailing } : {}),
    trailingIsReset,
    ...(trailingTooltip ? { trailingTooltip } : {}),
    fraction: barFraction(line, settings.displayMode),
    severity: severityOf(state),
    ...(note ? { note } : {}),
    ...(tick !== undefined ? { tick } : {}),
    ...(barTooltip ? { barTooltip } : {})
  }
}

function paceTickFor(line: ProgressLine, state: ReturnType<typeof meterState>, now: Date, settings: Settings): number | undefined {
  // paceTick only draws for warning/critical states; the healthy + always-show case reuses its math.
  const shown = state.kind === 'healthy' ? ({ kind: 'closeToLimit', spare: '', projectedFraction: state.projectedFraction } as const) : state
  return paceTick(line, shown, now, settings.displayMode)
}

/** "$31.84 · 796 credits"; a lone dollar value takes the metric's word ("$4.08 spent"). */
export function valuesText(line: ValuesLine, valueWord?: string): string {
  const only = line.values.length === 1 ? line.values[0] : undefined
  if (only && only.kind === 'dollars' && valueWord) return `${formatValue(only, 'row')} ${valueWord}`
  return line.values.map((value) => formatValue(value, 'row')).join(' · ')
}

/** Every value at full precision, for the row's hover. */
export function valuesTooltip(line: ValuesLine): string | undefined {
  const full = line.values.map((value) => formatValue(value, 'full')).join(' · ')
  const estimated = line.values.some((value) => value.estimated) ? ' (estimated)' : ''
  return full === valuesText(line) && !estimated ? undefined : full + estimated
}

export interface CardSections {
  primary: MetricView[]
  onDemand: MetricView[]
}

/**
 * Enabled metrics split into always-visible and on-demand. A provider keeps at least one
 * always-visible row: when every enabled metric is on-demand, they're all promoted.
 */
export function cardSections(provider: ProviderView): CardSections {
  const enabled = provider.metrics.filter((metric) => metric.enabled)
  const primary = enabled.filter((metric) => !metric.onDemand)
  const onDemand = enabled.filter((metric) => metric.onDemand)
  return primary.length === 0 ? { primary: onDemand, onDemand: [] } : { primary, onDemand }
}

/** Whether the card needs a caret: on-demand rows or quick links to tuck away. */
export function hasExpander(provider: ProviderView): boolean {
  return cardSections(provider).onDemand.length > 0 || provider.info.links.length > 0
}

/** "Next update in 4m", or "Updating…" while a pass runs. */
export function nextUpdateText(nextRefreshAt: string | undefined, refreshing: boolean, now: Date): string {
  if (refreshing) return 'Updating…'
  if (!nextRefreshAt) return 'Refresh now'
  const seconds = (Date.parse(nextRefreshAt) - now.getTime()) / 1000
  if (!(seconds > 60)) return 'Next update in <1m'
  return `Next update in ${compactDuration(seconds) ?? '<1m'}`
}

/** Hover text for the "Outdated" tag. */
export function lastUpdatedText(refreshedAt: string | undefined, now: Date): string | undefined {
  return refreshedAt ? `Last updated ${formatAge(new Date(refreshedAt), now)}` : undefined
}
