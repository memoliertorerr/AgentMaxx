import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSqliteReader } from './sqlite'

let dir: string
const reader = createSqliteReader(async (file) => existsSync(file))

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'agentmaxx-sqlite-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('createSqliteReader', () => {
  it('reads text and blob values for the requested keys only', async () => {
    const file = path.join(dir, 'state.vscdb')
    const db = new DatabaseSync(file)
    db.exec('CREATE TABLE ItemTable (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB)')
    const insert = db.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)')
    insert.run('cursorAuth/accessToken', 'access')
    insert.run('cursorAuth/refreshToken', Buffer.from('refresh', 'utf8'))
    insert.run('other', 'ignored')
    db.close()

    expect(await reader.readKeyValues(file, 'ItemTable', ['cursorAuth/accessToken', 'cursorAuth/refreshToken', 'missing'])).toEqual({
      'cursorAuth/accessToken': 'access',
      'cursorAuth/refreshToken': 'refresh'
    })
  })

  it('returns undefined for a missing file and never creates one', async () => {
    const file = path.join(dir, 'missing.vscdb')
    expect(await reader.readKeyValues(file, 'ItemTable', ['k'])).toBeUndefined()
    expect(existsSync(file)).toBe(false)
  })

  it('rejects unsafe table names', async () => {
    await expect(reader.readKeyValues(path.join(dir, 'x'), 'ItemTable; DROP', ['k'])).rejects.toThrow(/invalid table/)
  })
})
