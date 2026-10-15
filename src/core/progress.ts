import { compactDuration, formatNumber, resetLabel, type DateFormatOptions, type ResetMode } from './format'
import type { MetricKind, ProgressLine, SessionStartSignal } from './types'

// Meter math for bounded rows, ported from upstream `Pace` and `WidgetData` (meterState,
// paceTick, boundedHeadline, boundedSubtitle). Renderer-safe: no Node imports.

export type DisplayMode = 'used' | 'left'
export type MeterSeverity = 'normal' | 'warning' | 'critical'

export type MeterState =
  | { kind: 'spent' }
  | { kind: 'runningOut'; eta?: string; projectedFraction: number }
  | { kind: 'closeToLimit'; spare: string; projectedFraction: number }
  | { kind: 'healthy'; projectedFraction: number }
  | { kind: 'level'; severity: MeterSeverity }

export function severityOf(state: MeterState): MeterSeverity {
  switch (state.kind) {
    case 'spent':
    case 'runningOut':
      return 'critical'
    case 'closeToLimit':
      return 'warning'
    case 'healthy':
      return 'normal'
    case 'level':
      return state.severity
  }
}

/** Hover detail: where pace lands at reset (upstream `MeterState.tooltip`). */
export function meterTooltip(state: MeterState): string | undefined {
  switch (state.kind) {
    case 'level':
      return undefined
    case 'spent':
      return 'Limit reached'
    case 'healthy':
      return `~${Math.round((1 - state.projectedFraction) * 100)}% left at reset`
    case 'closeToLimit':
      return `~${Math.round(state.projectedFraction * 100)}% used at reset`
    case 'runningOut':
      if (state.projectedFraction <= 1) return '~100% used at reset'
      return `~${Math.max(1, Math.round((state.projectedFraction - 1) * 100))}% over limit at reset`
  }
}

function kindOf(line: ProgressLine): MetricKind {
  return line.format.kind
}

/** Rounds to the precision the headline prints: whole percent, one-decimal count, cents. */
export function roundAtDisplayPrecision(value: number, kind: MetricKind): number {
  switch (kind) {
    case 'percent':
      return Math.round(value)
    case 'count':
      return Math.round(value * 10) / 10
    case 'dollars':
      return Math.round(value * 100) / 100
  }
}

/** The number the headline shows: used, or what's left (never below zero). */
export function displayedValue(line: ProgressLine, mode: DisplayMode): number {
  return mode === 'left' ? Math.max(0, line.limit - line.used) : line.used
}

/** Bar fill 0...1 from the same rounded value the headline prints. */
export function barFraction(line: ProgressLine, mode: DisplayMode): number {
  if (!(line.limit > 0)) return 0
  const shown = roundAtDisplayPrecision(displayedValue(line, mode), kindOf(line))
  return Math.min(Math.max(shown / line.limit, 0), 1)
}

/** Share used, 0...1, independent of display mode (for the tray bars). */
export function usedFraction(line: ProgressLine): number {
  if (!(line.limit > 0)) return 0
  return Math.min(Math.max(line.used / line.limit, 0), 1)
}

interface PaceResult {
  status: 'ahead' | 'onTrack' | 'behind'
  projectedUsage: number
}

const MINIMUM_ELAPSED_FRACTION = 0.01

function minimumElapsedSeconds(periodSeconds: number): number {
  return Math.max(60, periodSeconds * MINIMUM_ELAPSED_FRACTION)
}

/**
 * Projects usage at the current burn rate to the end of the window (upstream `Pace.evaluate`).
 * Undefined when there's no signal: nothing used, window not running, or too early to project.
 */
export function evaluatePace(used: number, limit: number, resetsAt: Date, periodSeconds: number, now: Date): PaceResult | undefined {
  if (!(limit > 0) || !(periodSeconds > 0) || !(used > 0)) return undefined
  const elapsed = (now.getTime() - (resetsAt.getTime() - periodSeconds * 1000)) / 1000
  if (elapsed < minimumElapsedSeconds(periodSeconds) || now >= resetsAt) return undefined
  const projectedUsage = (used / elapsed) * periodSeconds
  if (used >= limit) return { status: 'behind', projectedUsage }
  if (projectedUsage <= limit * 0.9) return { status: 'ahead', projectedUsage }
  if (projectedUsage <= limit) return { status: 'onTrack', projectedUsage }
  return { status: 'behind', projectedUsage }
}

/** Seconds until the quota runs out, only when behind and the run-out lands before the reset. */
export function secondsToRunOut(used: number, limit: number, resetsAt: Date, periodSeconds: number, now: Date): number | undefined {
  const result = evaluatePace(used, limit, resetsAt, periodSeconds, now)
  if (!result || result.status !== 'behind') return undefined
  const rate = result.projectedUsage / periodSeconds
  if (!(rate > 0)) return undefined
  const eta = (limit - used) / rate
  const remaining = (resetsAt.getTime() - now.getTime()) / 1000
  return eta > 0 && eta < remaining ? eta : undefined
}

function parseDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** A session meter whose rolling window hasn't begun ("Not started"). */
export function isFreshSessionWindow(line: ProgressLine, signal: SessionStartSignal | undefined, now: Date): boolean {
  if (!signal || line.used > 0) return false
  const resetsAt = parseDate(line.resetsAt)
  if (signal === 'zeroUsage') return resetsAt !== undefined && now < resetsAt
  return resetsAt === undefined
}

function absoluteLevel(used: number, limit: number): MeterState {
  const percentUsed = Math.round(Math.min(Math.max(used / limit, 0), 1) * 100)
  if (percentUsed >= 90) return { kind: 'level', severity: 'critical' }
  if (percentUsed >= 80) return { kind: 'level', severity: 'warning' }
  return { kind: 'level', severity: 'normal' }
}

export interface MeterOptions {
  now: Date
  sessionStartSignal?: SessionStartSignal
  resetMode?: ResetMode
  dateFormat?: DateFormatOptions
}

/**
 * The meter's visual state. Precedence: spent → live pace verdict (needs a reset and a period) →
 * absolute level bands. Bands key off the share used, so color never flips with Used/Left.
 */
export function meterState(line: ProgressLine, options: MeterOptions): MeterState {
  const { used, limit } = line
  if (!(limit > 0)) return { kind: 'level', severity: 'normal' }
  if (roundAtDisplayPrecision(limit - used, kindOf(line)) <= 0) return { kind: 'spent' }
  if (isFreshSessionWindow(line, options.sessionStartSignal, options.now)) return absoluteLevel(used, limit)

  const resetsAt = parseDate(line.resetsAt)
  const periodSeconds = line.periodDurationMs !== undefined ? line.periodDurationMs / 1000 : undefined
  if (resetsAt && periodSeconds && periodSeconds > 0) {
    const result = evaluatePace(used, limit, resetsAt, periodSeconds, options.now)
    if (result) {
      const projected = result.projectedUsage / limit
      if (result.status === 'ahead') return { kind: 'healthy', projectedFraction: projected }
      // Whole-percent meters can read 1% very early in a window; linear extrapolation then
      // projects a bogus blow-out. Below 5% used, distrust the projection.
      if (used / limit < 0.05) return absoluteLevel(used, limit)
      if (result.status === 'onTrack') {
        const spare = Math.round((1 - projected) * 100)
        if (spare < 1) return { kind: 'runningOut', projectedFraction: projected }
        return { kind: 'closeToLimit', spare: `~${spare}% spare`, projectedFraction: projected }
      }
      const runOut = secondsToRunOut(used, limit, resetsAt, periodSeconds, options.now)
      const eta =
        runOut !== undefined
          ? resetLabelFor('Limit', new Date(options.now.getTime() + runOut * 1000), options)
          : undefined
      return { kind: 'runningOut', projectedFraction: projected, ...(eta ? { eta } : {}) }
    }
  }
  return absoluteLevel(used, limit)
}

function resetLabelFor(prefix: string, date: Date, options: MeterOptions): string | undefined {
  const label = resetLabel(date, options.resetMode ?? 'countdown', options.now, options.dateFormat)
  return label?.replace(/^Resets/, prefix)
}

/** Even-pace tick position (0...1) for warning and critical pace states; undefined otherwise. */
export function paceTick(line: ProgressLine, state: MeterState, now: Date, mode: DisplayMode): number | undefined {
  if (state.kind !== 'closeToLimit' && state.kind !== 'runningOut') return undefined
  const resetsAt = parseDate(line.resetsAt)
  const periodSeconds = line.periodDurationMs !== undefined ? line.periodDurationMs / 1000 : undefined
  if (!resetsAt || !periodSeconds || periodSeconds <= 0) return undefined
  const elapsed = (now.getTime() - (resetsAt.getTime() - periodSeconds * 1000)) / 1000
  if (elapsed < minimumElapsedSeconds(periodSeconds) || now >= resetsAt) return undefined
  const fraction = Math.min(Math.max(elapsed / periodSeconds, 0), 1)
  return mode === 'left' ? 1 - fraction : fraction
}

/** "52% left", "48% used", "$12.34 left". */
export function progressHeadline(line: ProgressLine, mode: DisplayMode): string {
  return `${formatNumber(displayedValue(line, mode), kindOf(line), 'row')} ${mode}`
}

export const NOT_STARTED = 'Not started'
export const FRESH_SESSION_TOOLTIP = 'Sessions start after you send your first message.'

/**
 * The trailing label: "Not started", the reset label, the cycle cadence, "$50 limit", or the
 * count's unit.
 */
export function progressTrailing(line: ProgressLine, options: MeterOptions): string | undefined {
  if (isFreshSessionWindow(line, options.sessionStartSignal, options.now)) return NOT_STARTED
  const resetsAt = parseDate(line.resetsAt)
  if (resetsAt) return resetLabel(resetsAt, options.resetMode ?? 'countdown', options.now, options.dateFormat)
  if (line.periodDurationMs !== undefined) {
    const duration = compactDuration(line.periodDurationMs / 1000)
    if (duration) return `Resets in ${duration}`
  }
  switch (line.format.kind) {
    case 'percent':
      return undefined
    case 'dollars': {
      const amount = Number.isInteger(line.limit)
        ? `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(line.limit)}`
        : formatNumber(line.limit, 'dollars', 'full')
      return `${amount} limit`
    }
    case 'count':
      return line.format.suffix
  }
}

/** True when the trailing label is a reset time the user can click to flip countdown/absolute. */
export function hasResetLabel(line: ProgressLine, signal: SessionStartSignal | undefined, now: Date): boolean {
  return parseDate(line.resetsAt) !== undefined && !isFreshSessionWindow(line, signal, now)
}

/** Tray reading for a pinned bounded metric: "42%" or a compact amount, honoring Used/Left. */
export function trayValue(line: ProgressLine, mode: DisplayMode): string {
  if (line.format.kind === 'percent' && line.limit > 0) {
    const percent = Math.round((displayedValue(line, mode) / line.limit) * 100)
    return `${Math.min(100, Math.max(0, percent))}%`
  }
  return formatNumber(displayedValue(line, mode), kindOf(line), 'tray')
}
