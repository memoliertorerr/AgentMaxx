import { randomBytes } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import path from 'node:path'

// File access for providers and stores, injected so tests run against an in-memory fake.

export interface FileSystem {
  /** File contents, or `undefined` when the file doesn't exist. Throws FileAccessError otherwise. */
  readText(filePath: string): Promise<string | undefined>
  /** Replaces the file atomically (temp file + rename), keeping the original file's permissions. */
  writeTextAtomic(filePath: string, text: string): Promise<void>
  exists(filePath: string): Promise<boolean>
}

/** The file exists but couldn't be read or written (permissions, locks, I/O). */
export class FileAccessError extends Error {
  readonly filePath: string
  readonly code: string | undefined

  constructor(filePath: string, cause: unknown) {
    const code = (cause as NodeJS.ErrnoException | undefined)?.code
    super(`${code ?? 'error'} accessing ${filePath}`)
    this.name = 'FileAccessError'
    this.filePath = filePath
    this.code = code
  }
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

export const nodeFileSystem: FileSystem = {
  async readText(filePath) {
    try {
      return await fsp.readFile(filePath, 'utf8')
    } catch (error) {
      if (isMissing(error)) return undefined
      throw new FileAccessError(filePath, error)
    }
  },

  async writeTextAtomic(filePath, text) {
    let mode = 0o600
    try {
      mode = (await fsp.stat(filePath)).mode & 0o777
    } catch (error) {
      if (!isMissing(error)) throw new FileAccessError(filePath, error)
    }
    const temp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${randomBytes(6).toString('hex')}.tmp`)
    try {
      await fsp.mkdir(path.dirname(filePath), { recursive: true })
      await fsp.writeFile(temp, text, { encoding: 'utf8', mode })
      await fsp.rename(temp, filePath)
    } catch (error) {
      await fsp.rm(temp, { force: true }).catch(() => undefined)
      throw new FileAccessError(filePath, error)
    }
  },

  async exists(filePath) {
    try {
      await fsp.access(filePath)
      return true
    } catch {
      return false
    }
  }
}
