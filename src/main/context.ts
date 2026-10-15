import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { nodeFileSystem } from '../core/fs'
import { createFetchHttpClient } from '../core/http'
import { resolvePaths } from '../core/paths'
import { createSqliteReader } from '../core/sqlite'
import type { ApiKeyStore, CommandRunner, Logger, ProviderContext, SecretStore } from '../core/runtime'

// The real provider context: Node's filesystem and fetch, the process environment, and the OS
// credential store. Built fresh per refresh so each one carries its own abort signal.

const DEFAULT_COMMAND_TIMEOUT_MS = 10_000

export const commandRunner: CommandRunner = {
  run(command, args, options) {
    return new Promise((resolve) => {
      execFile(
        command,
        args,
        { timeout: options?.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout, stderr) => {
          const code = error ? (typeof error.code === 'number' ? error.code : null) : 0
          resolve({ code, stdout: String(stdout), stderr: String(stderr) })
        }
      )
    })
  }
}

export interface ContextDependencies {
  log: Logger
  secrets: SecretStore
  apiKeys: ApiKeyStore
}

export function createContextFactory(deps: ContextDependencies) {
  const http = createFetchHttpClient()
  const sqlite = createSqliteReader((path) => nodeFileSystem.exists(path))
  return ({ signal, manual }: { signal: AbortSignal; manual: boolean }): ProviderContext => {
    const env = { ...process.env }
    return {
      env,
      paths: resolvePaths({ env, homedir: homedir(), platform: process.platform }),
      http,
      fs: nodeFileSystem,
      sqlite,
      log: deps.log,
      now: () => new Date(),
      signal,
      secrets: deps.secrets,
      exec: commandRunner,
      apiKeys: deps.apiKeys,
      manual
    }
  }
}
