import { unwrapGoKeyring } from '../../credentialManager'
import { ProviderError } from '../../errors'
import { asObject, asString, parseJson } from '../../parse'
import type { ProviderContext } from '../../runtime'

// A GitHub token Copilot tooling already left on the PC (upstream CopilotAuthStore, with Windows
// locations). Checked in order, cheapest first:
//   1. Copilot editor plugins: %LOCALAPPDATA%\github-copilot\apps.json / hosts.json
//   2. GitHub CLI config: %APPDATA%\GitHub CLI\hosts.yml (oauth_token, when gh stores it in the file)
//   3. `gh auth token --hostname github.com` (gh's own read of Windows Credential Manager)
//   4. Windows Credential Manager directly: gh's generic credential `gh:github.com:<user>`

export const copilotAuthText = {
  notLoggedIn: 'Sign in to GitHub Copilot in your editor, or run gh auth login, and try again.',
  tokenInvalid: 'GitHub token invalid or expired. Re-authenticate (gh auth login) and try again.'
} as const

export const copilotAuthError = {
  notLoggedIn: () => new ProviderError('notLoggedIn', copilotAuthText.notLoggedIn),
  tokenInvalid: () => new ProviderError('authExpired', copilotAuthText.tokenInvalid)
}

export type CopilotTokenSource = 'editor' | 'ghConfig' | 'ghCli' | 'credentialManager'

export interface CopilotToken {
  value: string
  source: CopilotTokenSource
}

/** The github.com `oauth_token` in a Copilot editor apps.json / hosts.json. */
export function oauthTokenFromEditorJson(text: string): string | undefined {
  const object = asObject(parseJson(text))
  if (!object) return undefined
  for (const [key, value] of Object.entries(object)) {
    if (key !== 'github.com' && !key.startsWith('github.com:')) continue
    const token = asString(asObject(value)?.oauth_token)
    if (token) return token
  }
  return undefined
}

/** A key from the github.com block of gh's hosts.yml (a minimal reader; no YAML dependency). */
export function ghHostsValue(text: string, key: string, host = 'github.com'): string | undefined {
  let inHost = false
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    if (!/^\s/.test(line)) {
      inHost = line.trim().startsWith(`${host}:`)
      continue
    }
    if (!inHost) continue
    const trimmed = line.trim()
    if (!trimmed.startsWith(`${key}:`)) continue
    const value = trimmed.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
    return value || undefined
  }
  return undefined
}

function editorPaths(ctx: ProviderContext): string[] {
  const dirs = ctx.paths.isWindows
    ? [ctx.paths.join(ctx.paths.localAppData, 'github-copilot'), ctx.paths.join(ctx.paths.home, '.config', 'github-copilot')]
    : [ctx.paths.join(ctx.paths.home, '.config', 'github-copilot')]
  return dirs.flatMap((dir) => [ctx.paths.join(dir, 'apps.json'), ctx.paths.join(dir, 'hosts.json')])
}

export function ghHostsPath(ctx: ProviderContext): string {
  const configured = asString(ctx.env.GH_CONFIG_DIR)
  if (configured) return ctx.paths.join(ctx.paths.expand(configured), 'hosts.yml')
  return ctx.paths.isWindows
    ? ctx.paths.join(ctx.paths.appData, 'GitHub CLI', 'hosts.yml')
    : ctx.paths.join(ctx.paths.home, '.config', 'gh', 'hosts.yml')
}

async function readOptional(ctx: ProviderContext, path: string): Promise<string | undefined> {
  try {
    return await ctx.fs.readText(path)
  } catch {
    ctx.log.warn('auth:copilot', `couldn't read ${path}; skipping it`)
    return undefined
  }
}

/** Token sources that only read files (cheap, no processes). */
export async function loadFileToken(ctx: ProviderContext): Promise<CopilotToken | undefined> {
  for (const path of editorPaths(ctx)) {
    const text = await readOptional(ctx, path)
    const token = text ? oauthTokenFromEditorJson(text) : undefined
    if (token) return { value: token, source: 'editor' }
  }
  const hosts = await readOptional(ctx, ghHostsPath(ctx))
  const token = hosts ? ghHostsValue(hosts, 'oauth_token') : undefined
  return token ? { value: token, source: 'ghConfig' } : undefined
}

/** Every source, including the gh CLI and Windows Credential Manager. */
export async function loadCopilotToken(ctx: ProviderContext): Promise<CopilotToken | undefined> {
  const fromFile = await loadFileToken(ctx)
  if (fromFile) return fromFile

  const gh = await ctx.exec.run('gh', ['auth', 'token', '--hostname', 'github.com'], { timeoutMs: 10_000 })
  const ghToken = gh.code === 0 ? gh.stdout.trim() : ''
  if (ghToken && !ghToken.includes('\n')) return { value: ghToken, source: 'ghCli' }

  const stored = await ctx.secrets.list('gh:github.com:')
  if (stored.length === 0) return undefined
  const hosts = await readOptional(ctx, ghHostsPath(ctx))
  const user = hosts ? ghHostsValue(hosts, 'user') : undefined
  const preferred = (user && stored.find((secret) => secret.target === `gh:github.com:${user}`)) || stored[0]
  const token = preferred ? unwrapGoKeyring(preferred.secret) : undefined
  return token ? { value: token, source: 'credentialManager' } : undefined
}
