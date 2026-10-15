import type { FileSystem } from './fs'
import type { HttpClient } from './http'
import type { Env, ResolvedPaths } from './paths'
import type { SqliteReader } from './sqlite'
import type { ProviderEntry, ProviderInfo, ProviderSnapshot } from './types'

// The provider contract (upstream `ProviderRuntime`). Every side effect a provider needs comes in
// through `ProviderContext`, so providers are tested with fakes and never touch the real machine.

export interface Logger {
  debug(scope: string, message: string): void
  info(scope: string, message: string): void
  warn(scope: string, message: string): void
  error(scope: string, message: string): void
}

/** A generic credential from the OS store (Windows Credential Manager). */
export interface StoredSecret {
  target: string
  userName?: string
  secret: string
}

export interface SecretStore {
  /** Every generic credential whose target starts with `targetPrefix`. Empty off Windows. */
  list(targetPrefix: string): Promise<StoredSecret[]>
}

export interface CommandResult {
  /** Exit code, or null when the process couldn't start or was killed. */
  code: number | null
  stdout: string
  stderr: string
}

export interface CommandRunner {
  run(command: string, args: string[], options?: { timeoutMs?: number }): Promise<CommandResult>
}

/** Keys the user saved in Settings → API Keys (decrypted on demand). */
export interface ApiKeyStore {
  get(providerId: string): Promise<string | undefined>
}

export interface ProviderContext {
  env: Env
  paths: ResolvedPaths
  http: HttpClient
  fs: FileSystem
  /** Read-only key/value lookups in other apps' SQLite files. */
  sqlite: SqliteReader
  log: Logger
  now: () => Date
  signal: AbortSignal
  secrets: SecretStore
  exec: CommandRunner
  apiKeys: ApiKeyStore
  /** True when the user asked for this refresh (Refresh Now) rather than the timer. */
  manual: boolean
}

export interface ProviderRuntime extends ProviderEntry {
  /** Latest usage. Throws `ProviderError` on failure; the engine keeps the last good snapshot. */
  refresh(ctx: ProviderContext): Promise<ProviderSnapshot>
  /**
   * Whether this provider's credentials exist on this machine — local only (files, credential
   * store), never the network. Drives first-run detection.
   */
  hasLocalCredentials(ctx: ProviderContext): Promise<boolean>
}

/** Builds a successful snapshot stamped with the context's clock. */
export function makeSnapshot(
  info: ProviderInfo,
  ctx: Pick<ProviderContext, 'now'>,
  fields: Pick<ProviderSnapshot, 'lines'> & Partial<Pick<ProviderSnapshot, 'plan' | 'warning'>>
): ProviderSnapshot {
  return {
    providerId: info.id,
    displayName: info.displayName,
    lines: fields.lines,
    refreshedAt: ctx.now().toISOString(),
    ...(fields.plan ? { plan: fields.plan } : {}),
    ...(fields.warning ? { warning: fields.warning } : {})
  }
}
