import { ProviderError } from '../../errors'
import { FileAccessError } from '../../fs'
import { asObject, asString, parseJson } from '../../parse'
import type { ProviderContext } from '../../runtime'

// The OpenCode Go key from OpenCode's data directory (upstream OpenCodeAuthStore + OpenCodePaths):
// $OPENCODE_DATA_DIR, else $XDG_DATA_HOME\opencode, else %USERPROFILE%\.local\share\opencode —
// OpenCode uses the XDG layout on Windows too. The key is OpenCode 1's auth.json `opencode-go` entry.

export const openCodeError = {
  notLoggedIn: () => new ProviderError('notLoggedIn', 'OpenCode Go not detected. Log in with OpenCode Go first.'),
  credentialsUnreadable: (detail: string) =>
    new ProviderError('credentialAccess', "Couldn't read OpenCode's auth.json. Check its file permissions or log into OpenCode Go again.", detail),
  unauthorized: () => new ProviderError('authInvalid', 'OpenCode Go key was rejected. Log into OpenCode Go again.'),
  noGoSubscription: () => new ProviderError('notAvailable', 'No OpenCode Go subscription on this key.')
}

export function openCodeDataDirectory(ctx: ProviderContext): string {
  const override = asString(ctx.env.OPENCODE_DATA_DIR)
  if (override) return ctx.paths.expand(override)
  const xdg = asString(ctx.env.XDG_DATA_HOME)
  if (xdg) return ctx.paths.join(ctx.paths.expand(xdg), 'opencode')
  return ctx.paths.join(ctx.paths.home, '.local', 'share', 'opencode')
}

export function openCodeAuthPath(ctx: ProviderContext): string {
  return ctx.paths.join(openCodeDataDirectory(ctx), 'auth.json')
}

/**
 * The `opencode-go` API key, or undefined when the user hasn't logged into OpenCode Go. A file that
 * exists but can't be read or parsed throws, so broken storage never reads as a logout.
 */
export async function loadGoKey(ctx: ProviderContext): Promise<string | undefined> {
  const path = openCodeAuthPath(ctx)
  let text: string | undefined
  try {
    text = await ctx.fs.readText(path)
  } catch (error) {
    if (error instanceof FileAccessError) throw openCodeError.credentialsUnreadable(`${error.code ?? 'error'} reading ${path}`)
    throw error
  }
  if (text === undefined) return undefined
  const auth = asObject(parseJson(text))
  if (!auth) throw openCodeError.credentialsUnreadable('auth.json is not a JSON object')
  const entry = asObject(auth['opencode-go'])
  return typeof entry?.key === 'string' ? asString(entry.key) : undefined
}
