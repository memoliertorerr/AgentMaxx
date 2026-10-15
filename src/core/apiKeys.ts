// Providers that take a user-supplied API key (upstream `APIKeyManaging` + `UserAPIKeyStore`):
// which ones, which environment variables they fall back to, and the status the API Keys screen
// shows. Renderer-safe: no Node imports.

/**
 * Where the key in use comes from (upstream `APIKeyStatus`). `overrideActive`: a saved key is in
 * use while the environment also has one — clearing the saved key falls back to it.
 */
export type ApiKeyStatus = 'notSet' | 'fromEnvironment' | 'saved' | 'overrideActive'

export interface ApiKeyProvider {
  id: string
  displayName: string
  /** Checked in order when no key is saved; the first non-empty value wins. */
  envNames: readonly string[]
  /** Where the user creates a key. */
  keysUrl: string
}

export const API_KEY_PROVIDERS: readonly ApiKeyProvider[] = [
  { id: 'openrouter', displayName: 'OpenRouter', envNames: ['OPENROUTER_API_KEY', 'OPENROUTER_KEY'], keysUrl: 'https://openrouter.ai/keys' },
  { id: 'zai', displayName: 'Z.ai', envNames: ['ZAI_API_KEY', 'GLM_API_KEY'], keysUrl: 'https://z.ai/manage-apikey/apikey-list' }
]

export function apiKeyProvider(id: unknown): ApiKeyProvider | undefined {
  return typeof id === 'string' ? API_KEY_PROVIDERS.find((provider) => provider.id === id) : undefined
}

/** The first non-empty environment value among `names`, trimmed. */
export function keyFromEnvironment(env: Readonly<Record<string, string | undefined>>, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim()
    if (value) return value
  }
  return undefined
}

export function apiKeyStatus(hasSaved: boolean, hasEnvironment: boolean): ApiKeyStatus {
  if (hasSaved) return hasEnvironment ? 'overrideActive' : 'saved'
  return hasEnvironment ? 'fromEnvironment' : 'notSet'
}

export const MAX_API_KEY_LENGTH = 512

/**
 * A pasted key, trimmed. Undefined when empty, implausibly long, or containing whitespace or
 * control characters inside it (a paste that caught more than the key).
 */
export function normalizeApiKey(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const key = raw.trim()
  if (!key || key.length > MAX_API_KEY_LENGTH) return undefined
  if (/[\s\u0000-\u001f\u007f-\u009f]/.test(key)) return undefined
  return key
}
