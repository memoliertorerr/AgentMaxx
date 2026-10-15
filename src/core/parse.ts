// Permissive readers for provider JSON (upstream `ProviderParse` and `OpenUsageISO8601`).
// Validation happens here, at the boundary; everything past a mapper trusts its types.

export type JsonObject = Record<string, unknown>

export function asObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : undefined
}

export function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

/** A non-empty trimmed string, or undefined. */
export function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/** Finite numbers and numeric strings; booleans and everything else are rejected. */
export function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/** Real booleans, numbers (nonzero → true), and "true"/"false"/"1"/"0" strings. */
export function asBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value !== 0 : undefined
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase()
    if (lowered === 'true' || lowered === '1') return true
    if (lowered === 'false' || lowered === '0') return false
  }
  return undefined
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 100)
}

/** Integer cents to dollars, snapping to whole cents first to avoid float drift. */
export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100
}

/** The decoded payload (middle segment) of a JWT, or undefined. */
export function jwtPayload(token: string): JsonObject | undefined {
  const segment = token.split('.')[1]
  if (!segment) return undefined
  try {
    const json = Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return asObject(JSON.parse(json))
  } catch {
    return undefined
  }
}

/** Parses text as JSON, returning undefined instead of throwing. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const SPACED_DATETIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/
const ISO_WITH_ZONE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const ISO_WITHOUT_ZONE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?$/

function normalizeFraction(fraction: string | undefined): string {
  if (!fraction) return ''
  return '.' + fraction.slice(1, 4).padEnd(3, '0')
}

/**
 * Parses the timestamp shapes providers return: ISO 8601 with or without fractional seconds,
 * space-separated date and time, a " UTC" suffix. A timestamp without a zone is UTC.
 */
export function parseIsoDate(value: unknown): Date | undefined {
  let text = asString(value)
  if (!text) return undefined
  text = text.replace(SPACED_DATETIME, '$1T$2')
  if (text.endsWith(' UTC')) text = text.slice(0, -4) + 'Z'

  let normalized: string | undefined
  const zoned = ISO_WITH_ZONE.exec(text)
  if (zoned) {
    normalized = `${zoned[1]}${normalizeFraction(zoned[2])}${zoned[3]}`
  } else {
    const unzoned = ISO_WITHOUT_ZONE.exec(text)
    if (unzoned) normalized = `${unzoned[1]}${normalizeFraction(unzoned[2])}Z`
  }
  if (!normalized) return undefined
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** Epoch seconds or milliseconds (as the provider documents) to a Date. */
export function parseEpoch(value: unknown, unit: 'seconds' | 'milliseconds'): Date | undefined {
  const number = asNumber(value)
  if (number === undefined || number <= 0) return undefined
  const date = new Date(unit === 'seconds' ? number * 1000 : number)
  return Number.isNaN(date.getTime()) ? undefined : date
}
