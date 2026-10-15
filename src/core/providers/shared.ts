import { createHash } from 'node:crypto'
import { ProviderError } from '../errors'
import { FileAccessError } from '../fs'
import { asObject, parseJson, type JsonObject } from '../parse'
import type { ProviderContext } from '../runtime'
import type { MetricDescriptor } from '../types'

// Helpers shared by providers: reading credential files the way upstream does, writing rotated
// tokens back without disturbing anything else in the file, and small formatting chores.

export interface JsonFile {
  path: string
  /** The exact text read, kept so a write-back can merge into the original document. */
  text: string
  json: JsonObject
}

/** Decodes JSON, falling back to a hex-encoded JSON blob (upstream `decodeJSONWithHexFallback`). */
export function parseJsonWithHexFallback(text: string): JsonObject | undefined {
  const direct = asObject(parseJson(text))
  if (direct) return direct
  let hex = text.trim()
  if (hex.startsWith('0x') || hex.startsWith('0X')) hex = hex.slice(2)
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return undefined
  return asObject(parseJson(Buffer.from(hex, 'hex').toString('utf8')))
}

/**
 * Reads a JSON credential file. Missing or unparseable files return undefined (nothing usable
 * there); a file that exists but can't be read is a credential-access error the user should see.
 */
export async function readJsonFile(ctx: ProviderContext, path: string, what: string): Promise<JsonFile | undefined> {
  let text: string | undefined
  try {
    text = await ctx.fs.readText(path)
  } catch (error) {
    if (error instanceof FileAccessError) {
      throw new ProviderError('credentialAccess', `Couldn't read ${what}. Check its permissions.`, `${error.code ?? 'error'} reading ${path}`)
    }
    throw error
  }
  if (text === undefined) return undefined
  const json = parseJsonWithHexFallback(text)
  if (!json) {
    ctx.log.warn('credentials', `${what} at ${path} is not valid JSON; ignoring it`)
    return undefined
  }
  return { path, text, json }
}

/**
 * Applies `change` to the file's original JSON document and writes it back atomically. Every
 * field the change doesn't touch — including ones this app doesn't know about — is preserved.
 */
export async function writeMergedJson(ctx: ProviderContext, file: JsonFile, change: (document: JsonObject) => void): Promise<void> {
  const document = parseJsonWithHexFallback(file.text)
  if (!document) throw new Error(`${file.path} is no longer valid JSON`)
  change(document)
  await ctx.fs.writeTextAtomic(file.path, JSON.stringify(document, null, 2))
}

/** Merges `patch` into the object at `key`, creating it if needed. */
export function mergeInto(document: JsonObject, key: string, patch: Record<string, unknown>): void {
  document[key] = { ...(asObject(document[key]) ?? {}), ...patch }
}

/**
 * "self_serve_business" → "Self Serve Business". With `lowercaseTail` (Claude's plans) the rest
 * of each word is lowercased; without it (Codex's) it's kept, so "ChatGPT" stays "ChatGPT".
 */
export function titleCase(raw: string, options: { separator?: RegExp; lowercaseTail?: boolean } = {}): string {
  const separator = options.separator ?? /[\s_]+/
  return raw
    .trim()
    .split(separator)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + (options.lowercaseTail ? word.slice(1).toLowerCase() : word.slice(1)))
    .join(' ')
}

/** A short, non-reversible fingerprint for caching per credential. Never log the input. */
export function fingerprint(...parts: Array<string | undefined>): string {
  return createHash('sha256').update(parts.map((part) => part ?? '').join('\u0000')).digest('hex').slice(0, 32)
}

/** Shorthand for metric descriptors with upstream's default flags. */
export function metric(
  id: string,
  options: Partial<Omit<MetricDescriptor, 'id'>> = {}
): MetricDescriptor {
  return { id, defaultEnabled: true, defaultOnDemand: false, defaultPinned: false, ...options }
}

/** A Retry-After header in seconds (delta-seconds or an HTTP date). */
export function parseRetryAfterSeconds(value: string | undefined, now: Date): number | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  if (/^\d+$/.test(raw)) return Number(raw)
  const date = Date.parse(raw)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, Math.ceil((date - now.getTime()) / 1000))
}
