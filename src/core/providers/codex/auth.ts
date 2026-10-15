import { ProviderError } from '../../errors'
import { asNumber, asObject, asString, jwtPayload, parseIsoDate } from '../../parse'
import type { ProviderContext } from '../../runtime'
import { mergeInto, readJsonFile, writeMergedJson, type JsonFile } from '../shared'

// The Codex CLI's login: auth.json in $CODEX_HOME, else ~/.config/codex or ~/.codex
// (%USERPROFILE%\.codex on Windows). Ported from upstream CodexAuthStore; the macOS Keychain
// fallback, Codex Swap, and pi logins are not ported.

export interface CodexTokens {
  accessToken?: string
  refreshToken?: string
  idToken?: string
  accountId?: string
}

export interface CodexCredential {
  tokens: CodexTokens
  apiKey?: string
  lastRefresh?: string
  file: JsonFile
}

export const codexAuthText = {
  notLoggedIn: 'Not logged in. Run `codex` to authenticate.',
  sessionExpired: 'Session expired. Run `codex` to log in again.',
  tokenConflict: 'Token conflict. Run `codex` to log in again.',
  tokenRevoked: 'Token revoked. Run `codex` to log in again.',
  tokenExpired: 'Token expired. Run `codex` to log in again.',
  usageApiKey: 'Usage not available for API key. Sign in to Codex with your ChatGPT account.'
} as const

export const codexAuthError = {
  notLoggedIn: () => new ProviderError('notLoggedIn', codexAuthText.notLoggedIn),
  sessionExpired: () => new ProviderError('authExpired', codexAuthText.sessionExpired),
  tokenConflict: () => new ProviderError('authExpired', codexAuthText.tokenConflict),
  tokenRevoked: () => new ProviderError('authExpired', codexAuthText.tokenRevoked),
  tokenExpired: () => new ProviderError('authExpired', codexAuthText.tokenExpired),
  usageApiKey: () => new ProviderError('notAvailable', codexAuthText.usageApiKey)
}

/** Token problems where another login source should be tried instead of failing the refresh. */
export function allowsFallback(error: unknown): boolean {
  return error instanceof ProviderError && error.category === 'authExpired'
}

/** Codex homes in upstream's order: $CODEX_HOME alone when set, else ~/.config/codex then ~/.codex. */
export function codexHomes(ctx: ProviderContext): string[] {
  const configured = asString(ctx.env.CODEX_HOME)
  if (configured) return [ctx.paths.expand(configured)]
  return [ctx.paths.join(ctx.paths.home, '.config', 'codex'), ctx.paths.join(ctx.paths.home, '.codex')]
}

function parseCredential(file: JsonFile): CodexCredential | undefined {
  const tokensObject = asObject(file.json.tokens)
  const tokens: CodexTokens = {}
  const accessToken = asString(tokensObject?.access_token)
  const refreshToken = asString(tokensObject?.refresh_token)
  const idToken = asString(tokensObject?.id_token)
  const accountId = asString(tokensObject?.account_id)
  if (accessToken) tokens.accessToken = accessToken
  if (refreshToken) tokens.refreshToken = refreshToken
  if (idToken) tokens.idToken = idToken
  if (accountId) tokens.accountId = accountId
  const apiKey = asString(file.json.OPENAI_API_KEY)
  if (!accessToken && !apiKey) return undefined
  const lastRefresh = asString(file.json.last_refresh)
  return { tokens, file, ...(apiKey ? { apiKey } : {}), ...(lastRefresh ? { lastRefresh } : {}) }
}

export async function loadCodexCredentialAt(ctx: ProviderContext, path: string): Promise<CodexCredential | undefined> {
  const file = await readJsonFile(ctx, path, "Codex's auth.json")
  return file ? parseCredential(file) : undefined
}

export async function loadCodexCredentials(ctx: ProviderContext): Promise<CodexCredential[]> {
  const seen = new Set<string>()
  const result: CodexCredential[] = []
  for (const home of codexHomes(ctx)) {
    const path = ctx.paths.join(home, 'auth.json')
    const key = ctx.paths.isWindows ? path.toLowerCase() : path
    if (seen.has(key)) continue
    seen.add(key)
    const credential = await loadCodexCredentialAt(ctx, path)
    if (credential) result.push(credential)
  }
  return result
}

const REFRESH_WINDOW_MS = 5 * 60_000
const FALLBACK_REFRESH_AGE_MS = 8 * 24 * 3_600_000

/**
 * Refresh when the access token's JWT `exp` is within five minutes (the CLI's own rule); only
 * without a readable `exp`, fall back to an 8-day-old `last_refresh`.
 */
export function needsRefresh(credential: Pick<CodexCredential, 'tokens' | 'lastRefresh'>, now: Date): boolean {
  const token = credential.tokens.accessToken
  const exp = token ? asNumber(jwtPayload(token)?.exp) : undefined
  if (exp !== undefined) return exp * 1000 - now.getTime() <= REFRESH_WINDOW_MS
  const last = parseIsoDate(credential.lastRefresh)
  return last !== undefined && now.getTime() - last.getTime() > FALLBACK_REFRESH_AGE_MS
}

function sameLogin(a: CodexTokens, b: CodexTokens): boolean {
  return a.accessToken === b.accessToken && a.refreshToken === b.refreshToken
}

/**
 * Writes rotated tokens back to auth.json, only while the file still holds the login we
 * refreshed — a login Codex rotated moments earlier is never overwritten (tokenConflict).
 */
export async function saveRotatedCodexTokens(
  ctx: ProviderContext,
  onDisk: CodexCredential,
  rotated: Pick<CodexTokens, 'accessToken' | 'refreshToken' | 'idToken'>,
  lastRefresh: string
): Promise<CodexCredential> {
  const current = await loadCodexCredentialAt(ctx, onDisk.file.path)
  if (!current || !sameLogin(current.tokens, onDisk.tokens)) {
    ctx.log.warn('auth:codex', 'login changed while refreshing the token; keeping the login on disk')
    throw codexAuthError.tokenConflict()
  }
  const patch: Record<string, unknown> = {}
  if (rotated.accessToken) patch.access_token = rotated.accessToken
  if (rotated.refreshToken) patch.refresh_token = rotated.refreshToken
  if (rotated.idToken) patch.id_token = rotated.idToken
  await writeMergedJson(ctx, current.file, (document) => {
    mergeInto(document, 'tokens', patch)
    document.last_refresh = lastRefresh
  })
  return (await loadCodexCredentialAt(ctx, onDisk.file.path)) ?? current
}
