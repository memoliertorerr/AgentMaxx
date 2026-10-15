import { ProviderError } from '../../errors'
import { asNumber, asString, jwtPayload } from '../../parse'
import type { ProviderContext } from '../../runtime'

// The Cursor app's login lives in its VS Code-style state database:
// %APPDATA%\Cursor\User\globalStorage\state.vscdb, table ItemTable (upstream CursorAuthStore).
// Read-only here: a refreshed access token is kept in memory instead of being written into the
// database of an app that may be running.

export const ACCESS_TOKEN_KEY = 'cursorAuth/accessToken'
export const REFRESH_TOKEN_KEY = 'cursorAuth/refreshToken'

export interface CursorAuth {
  accessToken?: string
  refreshToken?: string
}

export const cursorAuthText = {
  notLoggedIn: 'Not logged in. Sign in via Cursor app or run `agent login`.',
  sessionExpired: 'Session expired. Sign in via Cursor app or run `agent login`.',
  tokenExpired: 'Token expired. Sign in via Cursor app or run `agent login`.',
  loginExpired: 'Login expired. Open Cursor to renew it, then refresh.'
} as const

export const cursorAuthError = {
  notLoggedIn: () => new ProviderError('notLoggedIn', cursorAuthText.notLoggedIn),
  sessionExpired: () => new ProviderError('authExpired', cursorAuthText.sessionExpired),
  tokenExpired: () => new ProviderError('authExpired', cursorAuthText.tokenExpired),
  /** Read-only Logins: the login isn't renewed. */
  loginExpired: () => new ProviderError('authExpired', cursorAuthText.loginExpired)
}

export function cursorStateDbPath(ctx: ProviderContext): string {
  return ctx.paths.join(ctx.paths.appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb')
}

export async function loadCursorAuth(ctx: ProviderContext): Promise<CursorAuth | undefined> {
  const path = cursorStateDbPath(ctx)
  let values: Record<string, string> | undefined
  try {
    values = await ctx.sqlite.readKeyValues(path, 'ItemTable', [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY])
  } catch (error) {
    throw new ProviderError(
      'credentialAccess',
      "Couldn't read Cursor's login database. Make sure Cursor isn't updating, then refresh.",
      `state.vscdb read failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (!values) return undefined
  const accessToken = asString(values[ACCESS_TOKEN_KEY])
  const refreshToken = asString(values[REFRESH_TOKEN_KEY])
  if (!accessToken && !refreshToken) return undefined
  return { ...(accessToken ? { accessToken } : {}), ...(refreshToken ? { refreshToken } : {}) }
}

const REFRESH_BUFFER_MS = 5 * 60_000

/** True when the token's JWT `exp` is within five minutes, or unreadable. */
export function needsRefresh(accessToken: string | undefined, now: Date): boolean {
  const exp = accessToken ? asNumber(jwtPayload(accessToken)?.exp) : undefined
  if (exp === undefined) return true
  return exp * 1000 - now.getTime() <= REFRESH_BUFFER_MS
}

/** True only when the JWT `exp` has passed (an unreadable expiry isn't "expired"). */
export function isExpired(accessToken: string, now: Date): boolean {
  const exp = asNumber(jwtPayload(accessToken)?.exp)
  return exp !== undefined && exp * 1000 <= now.getTime()
}

export interface CursorSession {
  userId: string
  /** The value for the WorkosCursorSessionToken cookie the cursor.com endpoints expect. */
  sessionToken: string
}

/** The web session derived from the access token's subject ("auth0|user_123" → "user_123"). */
export function cursorSession(accessToken: string): CursorSession | undefined {
  const subject = asString(jwtPayload(accessToken)?.sub)
  if (!subject) return undefined
  const parts = subject.split('|')
  const userId = parts.length > 1 ? (parts[1] ?? '') : (parts[0] ?? '')
  if (!userId) return undefined
  return { userId, sessionToken: `${userId}%3A%3A${accessToken}` }
}
