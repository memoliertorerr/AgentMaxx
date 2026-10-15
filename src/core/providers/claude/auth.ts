import { ProviderError } from '../../errors'
import { asNumber, asObject, asString } from '../../parse'
import { envDirectory } from '../../paths'
import type { ProviderContext } from '../../runtime'
import { mergeInto, readJsonFile, writeMergedJson, type JsonFile } from '../shared'

// Claude Code's login on Windows: %USERPROFILE%\.claude\.credentials.json (or
// $CLAUDE_CONFIG_DIR\.credentials.json), with CLAUDE_CODE_OAUTH_TOKEN as an inference-only
// fallback. Ported from upstream ClaudeAuthStore; the macOS Keychain and Claude Desktop sources
// don't apply on Windows.

export interface ClaudeOAuth {
  accessToken?: string
  refreshToken?: string
  /** Epoch milliseconds. */
  expiresAt?: number
  subscriptionType?: string
  rateLimitTier?: string
  scopes?: string[]
}

export type ClaudeSource = 'file' | 'environment'

export interface ClaudeCredential {
  oauth: ClaudeOAuth
  source: ClaudeSource
  /** The credentials file this came from, for writing a rotated token back. */
  file?: JsonFile
  /** An environment token: can run the model, can't read subscription usage. */
  inferenceOnly: boolean
}

export const claudeAuthText = {
  notLoggedIn: 'Not logged in. Run `claude` to authenticate.',
  sessionExpired: 'Session expired. Run `claude` to log in again.',
  tokenExpired: 'Token expired. Run `claude` to log in again.',
  missingProfileScope: 'Re-login for live usage. Run `claude` and sign in again to restore session and weekly limits.',
  environmentOnly:
    'CLAUDE_CODE_OAUTH_TOKEN can’t read live usage. Run `claude` and sign in to see your session and weekly limits.'
} as const

/** Errors where the next credential source should be tried instead of failing the refresh. */
export function allowsFallback(error: unknown): boolean {
  return error instanceof ProviderError && error.category === 'authExpired'
}

export interface ClaudeOAuthConfig {
  usageUrl: string
  profileUrl: string
  refreshUrl: string
  clientId: string
}

const PROD_BASE_API = 'https://api.anthropic.com'
const PROD_REFRESH_URL = 'https://platform.claude.com/v1/oauth/token'
const PROD_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'

function envText(ctx: ProviderContext, name: string): string | undefined {
  return asString(ctx.env[name])
}

/** Endpoints, honoring Claude Code's CLAUDE_CODE_CUSTOM_OAUTH_URL / CLAUDE_CODE_OAUTH_CLIENT_ID. */
export function claudeOAuthConfig(ctx: ProviderContext): ClaudeOAuthConfig {
  let base = PROD_BASE_API
  let refreshUrl = PROD_REFRESH_URL
  const custom = envText(ctx, 'CLAUDE_CODE_CUSTOM_OAUTH_URL')
  if (custom) {
    base = custom.replace(/\/+$/, '')
    refreshUrl = `${base}/v1/oauth/token`
    try {
      new URL(base)
    } catch {
      throw new ProviderError(
        'authInvalid',
        `Invalid Claude OAuth URL: ${custom}. Check CLAUDE_CODE_CUSTOM_OAUTH_URL.`,
        'CLAUDE_CODE_CUSTOM_OAUTH_URL is not a URL'
      )
    }
  }
  return {
    usageUrl: `${base}/api/oauth/usage`,
    profileUrl: `${base}/api/oauth/profile`,
    refreshUrl,
    clientId: envText(ctx, 'CLAUDE_CODE_OAUTH_CLIENT_ID') ?? PROD_CLIENT_ID
  }
}

export function claudeCredentialsPath(ctx: ProviderContext): string {
  const home = envDirectory(ctx.paths, ctx.env, 'CLAUDE_CONFIG_DIR', '.claude')
  return ctx.paths.join(home, '.credentials.json')
}

function parseOAuth(value: unknown): ClaudeOAuth | undefined {
  const object = asObject(value)
  if (!object) return undefined
  const scopes = Array.isArray(object.scopes) ? object.scopes.filter((s): s is string => typeof s === 'string') : undefined
  const oauth: ClaudeOAuth = {}
  const accessToken = asString(object.accessToken)
  const refreshToken = asString(object.refreshToken)
  const expiresAt = asNumber(object.expiresAt)
  const subscriptionType = asString(object.subscriptionType)
  const rateLimitTier = asString(object.rateLimitTier)
  if (accessToken) oauth.accessToken = accessToken
  if (refreshToken) oauth.refreshToken = refreshToken
  if (expiresAt !== undefined) oauth.expiresAt = expiresAt
  if (subscriptionType) oauth.subscriptionType = subscriptionType
  if (rateLimitTier) oauth.rateLimitTier = rateLimitTier
  if (scopes) oauth.scopes = scopes
  return oauth
}

export async function loadFileCredential(ctx: ProviderContext): Promise<ClaudeCredential | undefined> {
  const file = await readJsonFile(ctx, claudeCredentialsPath(ctx), "Claude Code's credentials file")
  if (!file) return undefined
  const oauth = parseOAuth(file.json.claudeAiOauth)
  if (!oauth?.accessToken) return undefined
  return { oauth, source: 'file', file, inferenceOnly: false }
}

export type LiveUsageAvailability = 'available' | 'inferenceOnly' | 'missingProfileScope'

export const USAGE_SCOPE = 'user:profile'

/** Whether a credential can read /api/oauth/usage (it needs the user:profile scope). */
export function liveUsageAvailability(credential: ClaudeCredential): LiveUsageAvailability {
  if (credential.inferenceOnly) return 'inferenceOnly'
  const scopes = credential.oauth.scopes
  // Older logins predate the scopes field; treat "unknown" as allowed — the API answers loudly if not.
  if (!scopes || scopes.length === 0) return 'available'
  return scopes.includes(USAGE_SCOPE) ? 'available' : 'missingProfileScope'
}

/**
 * Credentials in the order to try. An environment token never shadows a stored login that can
 * read live usage: it's kept as a trailing fallback, or used alone in a headless setup.
 */
export async function loadClaudeCredentials(ctx: ProviderContext): Promise<ClaudeCredential[]> {
  const stored: ClaudeCredential[] = []
  const file = await loadFileCredential(ctx)
  if (file) stored.push(file)

  const envToken = envText(ctx, 'CLAUDE_CODE_OAUTH_TOKEN')
  if (!envToken) return stored
  const liveCapable = stored.filter((credential) => liveUsageAvailability(credential) === 'available')
  const base = liveCapable[0] ?? stored[0]
  const environment: ClaudeCredential = {
    oauth: { ...(base?.oauth ?? {}), accessToken: envToken },
    source: 'environment',
    inferenceOnly: true
  }
  return liveCapable.length === 0 ? [environment] : [...liveCapable, environment]
}

/** Refresh when the access token is within five minutes of expiring. */
export function needsRefresh(oauth: ClaudeOAuth, now: Date): boolean {
  return oauth.expiresAt !== undefined && oauth.expiresAt - now.getTime() <= 5 * 60_000
}

/**
 * Writes a rotated token back to the credentials file — only the token fields, merged into the
 * file as it is now. If Claude Code replaced the login since we read it, the newer login wins and
 * nothing is written (the fresh token still serves this refresh).
 */
export async function saveRotatedTokens(ctx: ProviderContext, credential: ClaudeCredential, rotated: ClaudeOAuth): Promise<boolean> {
  if (credential.source !== 'file' || !credential.file) return false
  const current = await readJsonFile(ctx, credential.file.path, "Claude Code's credentials file")
  const currentOAuth = parseOAuth(current?.json.claudeAiOauth)
  if (!current || currentOAuth?.refreshToken !== credential.oauth.refreshToken) {
    ctx.log.info('auth:claude', 'login changed while refreshing the token; keeping the login on disk')
    return false
  }
  const patch: Record<string, unknown> = {}
  if (rotated.accessToken) patch.accessToken = rotated.accessToken
  if (rotated.refreshToken) patch.refreshToken = rotated.refreshToken
  if (rotated.expiresAt !== undefined) patch.expiresAt = rotated.expiresAt
  await writeMergedJson(ctx, current, (document) => mergeInto(document, 'claudeAiOauth', patch))
  ctx.log.info('auth:claude', 'persisted rotated credentials (source=file)')
  return true
}
