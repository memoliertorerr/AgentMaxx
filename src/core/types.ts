// The app's metric vocabulary, mirroring upstream OpenUsage's `MetricLine` / `MetricValue` /
// `ProviderSnapshot` (Sources/OpenUsage/Models). Providers normalize their API responses into
// these shapes; the UI and tray render them without knowing provider details.
//
// Swift enums with associated values become discriminated unions keyed by `type` (lines) or
// `kind` (formats). Dates cross the IPC boundary and the disk cache, so they are ISO strings.

export type MetricKind = 'percent' | 'dollars' | 'count'

export type ProgressFormat =
  | { kind: 'percent' }
  | { kind: 'dollars' }
  | { kind: 'count'; suffix: string }

/** One measured number on a `values` row. Formatting happens at the display edge. */
export interface MetricValue {
  /** USD for `dollars`, 0...100 for `percent`, an absolute count otherwise. */
  number: number
  kind: MetricKind
  /** Unit noun shown after the number ("credits", "available"); omitted renders it bare. */
  label?: string
  /** True when the number is imputed locally rather than measured or billed. */
  estimated?: boolean
}

/** A bounded meter: session and weekly quotas, capped credits. */
export interface ProgressLine {
  type: 'progress'
  label: string
  used: number
  limit: number
  format: ProgressFormat
  /** ISO timestamp of the next reset, when the window resets at a known time. */
  resetsAt?: string
  /** Length of the window, used for pace projection. */
  periodDurationMs?: number
  colorHex?: string
}

/** An unbounded row carrying one or more raw numbers (balances, spend, counts). */
export interface ValuesLine {
  type: 'values'
  label: string
  values: MetricValue[]
  colorHex?: string
  /** Future expiry instants surfaced on hover (e.g. reset credits), ISO strings. */
  expiriesAt?: string[]
}

/** A short status pill, e.g. "Disabled" or a pay-as-you-go cap. */
export interface BadgeLine {
  type: 'badge'
  label: string
  text: string
  colorHex?: string
  subtitle?: string
}

/** A string notice kept for completeness; not rendered as a widget. */
export interface TextLine {
  type: 'text'
  label: string
  value: string
  colorHex?: string
  subtitle?: string
}

export type MetricLine = ProgressLine | ValuesLine | BadgeLine | TextLine

/** Latest normalized output of one successful provider refresh. */
export interface ProviderSnapshot {
  providerId: string
  displayName: string
  plan?: string
  lines: MetricLine[]
  /** ISO timestamp. */
  refreshedAt: string
  /**
   * A soft notice on a successful refresh (e.g. "Re-login for live usage"). Shown as the
   * header's amber triangle without hiding the data.
   */
  warning?: string
}

export interface ProviderLink {
  label: string
  url: string
}

export interface ProviderInfo {
  id: string
  displayName: string
  /** The provider's brand color, used for its monogram icon. */
  brandColor: string
  /** Up to two quick links (Status, Dashboard, API Keys, Usage). http(s) only. */
  links: ProviderLink[]
  /**
   * False for providers that must never switch themselves on from local detection (Ollama:
   * its key exists whether or not Ollama Cloud is set up).
   */
  autoEnable: boolean
}

/**
 * How a session meter tells that its rolling window hasn't started yet (upstream
 * `SessionStartSignal`): `zeroUsage` — nothing used and a reset still ahead; `missingResetDate`
 * — the API reports no reset time.
 */
export type SessionStartSignal = 'zeroUsage' | 'missingResetDate'

/** What the UI needs to know about a provider, independent of how it fetches data. */
export interface ProviderEntry {
  readonly info: ProviderInfo
  readonly metrics: readonly MetricDescriptor[]
}

/** A metric a provider can produce, keyed by the line label it emits. */
export interface MetricDescriptor {
  /** Equals the `label` of the line that feeds it. */
  id: string
  /** The name shown in the UI when it differs from the line label ("Extra Usage" for "Extra usage spent"). */
  title?: string
  /** Trailing word for a lone dollar value on an unbounded row: "$12.34 spent", "$5.00 left". */
  valueWord?: string
  /** Word after a bounded dollar meter's limit: "$100 purchased" (default "limit"). */
  limitNoun?: string
  defaultEnabled: boolean
  /** Hidden behind the card's caret by default. */
  defaultOnDemand: boolean
  /** Shown in the tray icon and tooltip by default. */
  defaultPinned: boolean
  sessionStartSignal?: SessionStartSignal
}
