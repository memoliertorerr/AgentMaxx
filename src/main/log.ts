import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'
import type { Logger } from '../core/runtime'

// A small file logger: <logs>/usagemaxx.log, rotated to usagemaxx.log.1 past 2 MB at startup.
// Callers never pass secrets; messages carry categories, paths, and HTTP statuses only.

const MAX_BYTES = 2 * 1024 * 1024
type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

export interface FileLogger extends Logger {
  readonly filePath: string
}

export function createFileLogger(directory: string, options: { minLevel?: Level; echo?: boolean } = {}): FileLogger {
  const filePath = path.join(directory, 'usagemaxx.log')
  const minLevel = options.minLevel ?? 'info'
  try {
    mkdirSync(directory, { recursive: true })
    const size = statSync(filePath, { throwIfNoEntry: false })?.size ?? 0
    if (size > MAX_BYTES) {
      renameSync(filePath, `${filePath}.1`)
    }
  } catch (error) {
    console.error(`usagemaxx: couldn't prepare the log folder: ${String(error)}`)
  }

  const write = (level: Level, scope: string, message: string): void => {
    if (ORDER[level] < ORDER[minLevel]) return
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}\n`
    if (options.echo) process.stdout.write(line)
    try {
      appendFileSync(filePath, line)
    } catch {
      // Logging must never take the app down; the echo above still reaches a dev console.
    }
  }

  return {
    filePath,
    debug: (scope, message) => write('debug', scope, message),
    info: (scope, message) => write('info', scope, message),
    warn: (scope, message) => write('warn', scope, message),
    error: (scope, message) => write('error', scope, message)
  }
}
