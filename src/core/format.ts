import type { MetricKind, MetricValue } from './types'

// The single place a number or date becomes display text (upstream `MetricFormatter` and
// `Formatters`). Renderer-safe: no Node imports.
//
// Three styles, three surfaces:
// - tray: shortest. Whole dollars under $1,000, compact above; counts compact.
// - row:  popover rows. Compact like tray, but dollars keep cents ("$40.76", "$2.1K").
// - full: tooltips. Every digit, grouped ("$2,059.07", "56,904,995").
export type FormatStyle = 'tray' | 'row' | 'full'

export type ResetMode = 'countdown' | 'absolute'
export type TimeFormat = 'auto' | '12h' | '24h'

const NUMBER_LOCALE = 'en-US'

const compact = new Intl.NumberFormat(NUMBER_LOCALE, { notation: 'compact', maximumFractionDigits: 1 })
const upToOneDecimal = new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: 1 })
const wholeNumber = new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: 0 })
const currency = new Intl.NumberFormat(NUMBER_LOCALE, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 100)
}

function signed(value: number, body: (magnitude: number) => string): string {
  return value < 0 ? `-${body(-value)}` : body(value)
}

export function formatNumber(value: number, kind: MetricKind, style: FormatStyle): string {
  switch (kind) {
    case 'percent':
      // Clamped so a bad sample can never print "-5%" or "105%".
      return `${Math.round(clampPercent(value))}%`
    case 'dollars':
      if (Math.abs(value) >= 1000 && style !== 'full') return signed(value, (v) => `$${compact.format(v)}`)
      if (style === 'tray') return signed(value, (v) => `$${wholeNumber.format(v)}`)
      return currency.format(value)
    case 'count':
      if (Math.abs(value) >= 1000 && style !== 'full') return compact.format(value)
      return upToOneDecimal.format(value)
  }
}

/** A value with its unit label: "772 credits". Dollars and percents render bare. */
export function formatValue(value: MetricValue, style: FormatStyle): string {
  const text = formatNumber(value.number, value.kind, style)
  return value.label ? `${text} ${value.label}` : text
}

/**
 * "Xd Yh" / "Xh Ym" / "Xm". At the day scale both units always show ("4d 0h"), so a span just
 * over four days never reads as a flat "4d".
 */
export function compactDuration(seconds: number): string | undefined {
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  const totalMinutes = Math.max(1, Math.ceil(seconds / 60))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

/** The phrase for a deadline that's past due or within five minutes. */
export const IMMINENT = 'soon'

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export interface DateFormatOptions {
  /** BCP 47 locale for dates and times; defaults to the system locale. */
  locale?: string
  timeFormat?: TimeFormat
}

function shortTime(date: Date, options: DateFormatOptions): string {
  const hour12 = options.timeFormat === '12h' ? true : options.timeFormat === '24h' ? false : undefined
  return new Intl.DateTimeFormat(options.locale, {
    hour: 'numeric',
    minute: '2-digit',
    ...(hour12 !== undefined ? { hour12 } : {})
  }).format(date)
}

export function monthDay(date: Date, options: DateFormatOptions = {}): string {
  return new Intl.DateTimeFormat(options.locale, { month: 'short', day: 'numeric' }).format(date)
}

/**
 * The verb-less "when" phrase: countdown → "2d 6h"; absolute → "today at 5:30 PM",
 * "tomorrow at 9:00 AM", "Feb 15 at 3:45 PM". Both collapse to "soon" when imminent.
 */
export function whenLabel(date: Date, mode: ResetMode, now: Date, options: DateFormatOptions = {}): string | undefined {
  const seconds = (date.getTime() - now.getTime()) / 1000
  if (!Number.isFinite(seconds)) return undefined
  if (mode === 'countdown') {
    if (seconds <= 5 * 60) return IMMINENT
    return compactDuration(seconds)
  }
  if (seconds <= 0) return IMMINENT
  const dayDiff = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000)
  const time = shortTime(date, options)
  if (dayDiff <= 0) return `today at ${time}`
  if (dayDiff === 1) return `tomorrow at ${time}`
  return `${monthDay(date, options)} at ${time}`
}

/** "<prefix> in 3h 25m" / "<prefix> today at 6:38 PM" / "<prefix> soon". */
export function deadlineLabel(
  prefix: string,
  date: Date,
  mode: ResetMode,
  now: Date,
  options: DateFormatOptions = {}
): string | undefined {
  const when = whenLabel(date, mode, now, options)
  if (!when) return undefined
  if (when === IMMINENT || mode === 'absolute') return `${prefix} ${when}`
  return `${prefix} in ${when}`
}

export function resetLabel(resetsAt: Date, mode: ResetMode, now: Date, options: DateFormatOptions = {}): string | undefined {
  return deadlineLabel('Resets', resetsAt, mode, now, options)
}

/** "just now", "3m ago", "2h ago", "3d ago". */
export function formatAge(since: Date, now: Date): string {
  const seconds = (now.getTime() - since.getTime()) / 1000
  if (!Number.isFinite(seconds) || seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
