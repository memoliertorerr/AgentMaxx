import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nodeFileSystem } from './fs'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'agentmaxx-fs-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('nodeFileSystem', () => {
  it('returns undefined for a missing file', async () => {
    expect(await nodeFileSystem.readText(path.join(dir, 'missing.json'))).toBeUndefined()
    expect(await nodeFileSystem.exists(path.join(dir, 'missing.json'))).toBe(false)
  })

  it('replaces a file atomically and keeps its permissions', async () => {
    const file = path.join(dir, 'credentials.json')
    await writeFile(file, '{"old":true}', { mode: 0o600 })
    await nodeFileSystem.writeTextAtomic(file, '{"new":true}')
    expect(await readFile(file, 'utf8')).toBe('{"new":true}')
    if (process.platform !== 'win32') {
      expect((await stat(file)).mode & 0o777).toBe(0o600)
    }
  })

  it('creates missing parent folders', async () => {
    const file = path.join(dir, 'nested', 'state.json')
    await nodeFileSystem.writeTextAtomic(file, 'x')
    expect(await nodeFileSystem.readText(file)).toBe('x')
  })
})
