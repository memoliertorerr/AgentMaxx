import { ProviderError } from '../../errors'
import { asNumber, asObject, asString, jwtPayload, parseIsoDate, type JsonObject } from '../../parse'
import type { ProviderContext } from '../../runtime'
import { mergeInto, readJsonFile, writeMergedJson, type JsonFile } from '../shared'

// The Grok CLI's login: %USERPROFILE%\.grok\auth.json, one entry per account keyed like
// "https://auth.x.ai::<client id>" (upstream GrokAuthStore).

export const GROK_DEFAULT_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828'
const REFRESH_BUFFER_MS = 5 * 60_000

export const grokAuthError = {
  notLoggedIn: () => new ProviderError('notLoggedIn', 'Grok not logged in. Run `grok login`.'),
  invalidAuth: () => new ProviderError('authInvalid', 'Grok auth invalid. Run `grok login` again.'),
  expired: () => new ProviderError('authExpired', 'Grok auth expired. Run `grok login` again.'),
  /** Read-only Logins: the login isn't renewed. */
  loginExpired: () => new ProviderError('authExpired', 'Login expired. Run `grok login` to sign in again, then refresh.')
}

export interface GrokEntry {
  key?: string
  refreshToken?: string
  /** Older name for the refresh token. */
  refresh?: string
  idToken?: string
  expiresAt?: string
  /** Older name for the expiry. */
  expires?: string
  oidcClientId?: string
}

/** One usable login from auth.json. Mutated in place when its token is refreshed. */
export interface GrokCandidate {
  entryKey: string
  entry: GrokEntry
  token: string
  file: JsonFile
  /** The refresh token as read from disk, to tell whether the CLI rotated the login meanwhile. */
  readonly diskRefreshToken: string | undefined
}

export function grokAuthPath(ctx: ProviderContext): string {
  return ctx.paths.join(ctx.paths.home, '.grok', 'auth.json')
}

function parseEntry(value: unknown): GrokEntry | undefined {
  const object = asObject(value)
  if (!object) return undefined
  const entry: GrokEntry = {}
  const fields: Array<[keyof GrokEntry, string]> = [
    ['key', 'key'],
    ['refreshToken', 'refresh_token'],
    ['refresh', 'refresh'],
    ['idToken', 'id_token'],
    ['expiresAt', 'expires_at'],
    ['expires', 'expires'],
    ['oidcClientId', 'oidc_client_id']
  ]
  for (const [field, name] of fields) {
    const text = asString(object[name])
    if (text) entry[field] = text
  }
  return entry
}

/** Every entry with an access token, in file order. */
export async function loadGrokCandidates(ctx: ProviderContext): Promise<GrokCandidate[]> {
  const file = await readJsonFile(ctx, grokAuthPath(ctx), "Grok's auth file")
  if (!file) throw grokAuthError.notLoggedIn()
  const candidates: GrokCandidate[] = []
  for (const [entryKey, value] of Object.entries(file.json)) {
    const entry = parseEntry(value)
    if (entry?.key) candidates.push({ entryKey, entry, token: entry.key, file, diskRefreshToken: grokRefreshToken(entry) })
  }
  if (candidates.length === 0) throw grokAuthError.invalidAuth()
  return candidates
}

export function tokenExpiresAt(token: string): Date | undefined {
  const exp = asNumber(jwtPayload(token)?.exp)
  return exp === undefined ? undefined : new Date(exp * 1000)
}

function entryExpiresAt(entry: GrokEntry): Date | undefined {
  return parseIsoDate(entry.expiresAt) ?? parseIsoDate(entry.expires)
}

/** Within five minutes of expiry, by either the entry's timestamp or the JWT's `exp`. */
export function needsRefresh(candidate: GrokCandidate, now: Date): boolean {
  const soon = (date: Date | undefined) => date !== undefined && date.getTime() - now.getTime() <= REFRESH_BUFFER_MS
  return soon(entryExpiresAt(candidate.entry)) || soon(tokenExpiresAt(candidate.token))
}

export function isExpired(candidate: GrokCandidate, now: Date): boolean {
  const expiry = tokenExpiresAt(candidate.token) ?? entryExpiresAt(candidate.entry)
  return expiry !== undefined && now.getTime() >= expiry.getTime()
}

export function grokRefreshToken(entry: GrokEntry): string | undefined {
  return entry.refreshToken ?? entry.refresh
}

/** The entry's OIDC client: its own field, else the part after "::" in its key, else the CLI's default. */
export function grokClientId(candidate: GrokCandidate): string {
  if (candidate.entry.oidcClientId) return candidate.entry.oidcClientId
  const last = candidate.entryKey.split('::').pop()?.trim()
  return last ? last : GROK_DEFAULT_CLIENT_ID
}

export interface GrokRotation {
  key: string
  refreshToken?: string
  idToken?: string
  expiresAt: string
}

/**
 * Writes a refreshed token into the entry, leaving every other field and account untouched. If the
 * file is gone, unreadable, or the CLI rotated this login meanwhile, nothing is written.
 */
export async function saveGrokRotation(ctx: ProviderContext, candidate: GrokCandidate, rotation: GrokRotation): Promise<boolean> {
  const current = await readJsonFile(ctx, candidate.file.path, "Grok's auth file")
  const currentEntry = parseEntry(current?.json[candidate.entryKey])
  if (!current || !currentEntry || grokRefreshToken(currentEntry) !== candidate.diskRefreshToken) {
    ctx.log.info('auth:grok', 'auth.json changed while refreshing the token; keeping the login on disk')
    return false
  }
  const patch: JsonObject = { key: rotation.key, expires_at: rotation.expiresAt }
  if (rotation.refreshToken) patch.refresh_token = rotation.refreshToken
  if (rotation.idToken) patch.id_token = rotation.idToken
  await writeMergedJson(ctx, current, (document) => mergeInto(document, candidate.entryKey, patch))
  ctx.log.info('auth:grok', 'persisted rotated credentials')
  return true
}
