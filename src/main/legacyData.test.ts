import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { legacyFilesToCopy, migrateLegacyUserData } from './legacyData'

let root: string
let legacy: string
let target: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'agentmaxx-legacy-'))
  legacy = path.join(root, 'UsageMaxx')
  target = path.join(root, 'AgentMaxx')
  await mkdir(legacy)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

async function put(dir: string, name: string, content = name): Promise<void> {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, name), content)
}

async function fullLegacyFolder(): Promise<void> {
  for (const name of ['settings.json', 'snapshots.json', 'api-keys.json', 'Local State']) await put(legacy, name, `old ${name}`)
  await mkdir(path.join(legacy, 'logs'))
  await put(path.join(legacy, 'logs'), 'usagemaxx.log')
}

describe('migrateLegacyUserData', () => {
  it('copies settings, readings, keys, and the key store into a new folder, settings last', async () => {
    await fullLegacyFolder()
    const result = migrateLegacyUserData(legacy, target)
    expect(result).toEqual({ copied: ['Local State', 'api-keys.json', 'snapshots.json', 'settings.json'] })
    expect(await readFile(path.join(target, 'api-keys.json'), 'utf8')).toBe('old api-keys.json')
    expect((await readdir(target)).sort()).toEqual(['Local State', 'api-keys.json', 'settings.json', 'snapshots.json'])
    // The old folder is left alone.
    expect((await readdir(legacy)).sort()).toEqual(['Local State', 'api-keys.json', 'logs', 'settings.json', 'snapshots.json'])
  })

  it('copies only the files the old folder has', async () => {
    await put(legacy, 'settings.json')
    expect(migrateLegacyUserData(legacy, target).copied).toEqual(['settings.json'])
  })

  it('does nothing without an old folder', async () => {
    await rm(legacy, { recursive: true })
    expect(migrateLegacyUserData(legacy, target)).toEqual({ copied: [] })
  })

  it('does nothing once AgentMaxx has its own settings', async () => {
    await fullLegacyFolder()
    await put(target, 'settings.json', 'new settings')
    expect(migrateLegacyUserData(legacy, target)).toEqual({ copied: [] })
    expect(await readFile(path.join(target, 'settings.json'), 'utf8')).toBe('new settings')
  })

  it('replaces a key store Chromium created before the move, when AgentMaxx has no keys yet', async () => {
    await fullLegacyFolder()
    await put(target, 'Local State', 'fresh key store')
    migrateLegacyUserData(legacy, target)
    expect(await readFile(path.join(target, 'Local State'), 'utf8')).toBe('old Local State')
  })

  it('keeps keys saved in AgentMaxx together with the key store that encrypted them', async () => {
    await fullLegacyFolder()
    await put(target, 'api-keys.json', 'new keys')
    await put(target, 'Local State', 'new key store')
    expect(legacyFilesToCopy(legacy, target)).toEqual(['snapshots.json', 'settings.json'])
    migrateLegacyUserData(legacy, target)
    expect(await readFile(path.join(target, 'api-keys.json'), 'utf8')).toBe('new keys')
    expect(await readFile(path.join(target, 'Local State'), 'utf8')).toBe('new key store')
  })

  it('reports a failed copy instead of throwing', async () => {
    await fullLegacyFolder()
    // The target path is a file, so the folder can't be created.
    await put(root, 'AgentMaxx-file')
    const result = migrateLegacyUserData(legacy, path.join(root, 'AgentMaxx-file'))
    expect(result.copied).toEqual([])
    expect(result.error).toBeTruthy()
  })
})
