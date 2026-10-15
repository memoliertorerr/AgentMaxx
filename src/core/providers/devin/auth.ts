import { ProviderError } from '../../errors'
import { FileAccessError } from '../../fs'
import { asObject, asString, parseJson } from '../../parse'
import type { ProviderContext } from '../../runtime'

// Devin's credentials (upstream DevinAuthStore): the Devin CLI's credentials.toml, then the Devin
// app's state database. On Windows the CLI writes %APPDATA%\devin\credentials.toml (as Pane
// documents); the XDG path upstream uses and %LOCALAPPDATA%\devin are checked after it.

export const DEFAULT_API_SERVER_URL = 'https://server.codeium.com'
const APP_AUTH_KEY = 'windsurfAuthStatus'

export const devinAuthError = {
  notLoggedIn: () => new ProviderError('notLoggedIn', 'Run devin auth login or sign in to Devin and try again.')
}

export interface DevinAuth {
  apiKey: string
  /** An https API server from credentials.toml; the default server otherwise. */
  apiServerUrl?: string
  source: 'cli' | 'app'
}

export function devinCredentialPaths(ctx: ProviderContext): string[] {
  const { join, appData, home, localAppData } = ctx.paths
  return [
    join(appData, 'devin', 'credentials.toml'),
    join(home, '.local', 'share', 'devin', 'credentials.toml'),
    join(localAppData, 'devin', 'credentials.toml')
  ]
}

/** The Devin desktop app's VS Code-style state database. Unconfirmed on Windows; read only if present. */
export function devinStateDbPath(ctx: ProviderContext): string {
  return ctx.paths.join(ctx.paths.appData, 'Devin', 'User', 'globalStorage', 'state.vscdb')
}

function readQuoted(value: string): string | undefined {
  const quote = value[0]
  let output = ''
  let previous: string | undefined
  for (const character of value.slice(1)) {
    if (character === quote && previous !== '\\') {
      const trimmed = output.trim()
      return trimmed ? trimmed : undefined
    }
    output += character
    previous = character
  }
  return undefined
}

/**
 * A top-level `key = value` string from TOML text. Handles quoted values and trailing comments on
 * bare values; anything fancier (tables, arrays, multi-line strings) isn't needed for this file.
 */
export function readTomlString(text: string, key: string): string | undefined {
  for (const line of text.split(/\r?\n|\r/)) {
    const separator = line.indexOf('=')
    if (separator < 0 || line.slice(0, separator).trim() !== key) continue
    let value = line.slice(separator + 1).trim()
    if (!value) return undefined
    if (value.startsWith('"') || value.startsWith("'")) return readQuoted(value)
    const comment = value.indexOf('#')
    if (comment >= 0) value = value.slice(0, comment).trim()
    return value ? value : undefined
  }
  return undefined
}

/** Only an https server is used, without trailing slashes; anything else falls back to the default. */
export function cleanApiServerUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed?.startsWith('https://')) return undefined
  const withoutSlashes = trimmed.replace(/\/+$/, '')
  return withoutSlashes ? withoutSlashes : undefined
}

export function effectiveApiServerUrl(auth: DevinAuth): string {
  return auth.apiServerUrl ?? DEFAULT_API_SERVER_URL
}

export async function loadDevinCliAuth(ctx: ProviderContext): Promise<DevinAuth | undefined> {
  for (const path of devinCredentialPaths(ctx)) {
    let text: string | undefined
    try {
      text = await ctx.fs.readText(path)
    } catch (error) {
      if (!(error instanceof FileAccessError)) throw error
      ctx.log.warn('auth:devin', `couldn't read ${path}: ${error.code ?? 'error'}`)
      continue
    }
    if (text === undefined) continue
    const apiKey = readTomlString(text, 'windsurf_api_key')
    if (!apiKey) continue
    const apiServerUrl = cleanApiServerUrl(readTomlString(text, 'api_server_url'))
    return { apiKey, source: 'cli', ...(apiServerUrl ? { apiServerUrl } : {}) }
  }
  return undefined
}

export async function loadDevinAppAuth(ctx: ProviderContext): Promise<DevinAuth | undefined> {
  try {
    const values = await ctx.sqlite.readKeyValues(devinStateDbPath(ctx), 'ItemTable', [APP_AUTH_KEY])
    const raw = values?.[APP_AUTH_KEY]
    const apiKey = raw === undefined ? undefined : asString(asObject(parseJson(raw))?.apiKey)
    return apiKey ? { apiKey, source: 'app' } : undefined
  } catch (error) {
    ctx.log.warn('auth:devin', `Devin app state read failed: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}
