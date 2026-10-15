import { describe, expect, it } from 'vitest'
import { MemoryFileSystem, silentLogger } from '../../tests/helpers/fakes'
import { SnapshotCache } from './cache'
import type { ProviderSnapshot } from './types'

const file = 'C:\\data\\snapshots.json'

const claude: ProviderSnapshot = {
  providerId: 'claude',
  displayName: 'Claude',
  plan: 'Max 5x',
  refreshedAt: '2026-10-15T11:55:00.000Z',
  lines: [{ type: 'progress', label: 'Session', used: 42, limit: 100, format: { kind: 'percent' } }]
}

describe('SnapshotCache', () => {
  it('round-trips snapshots', async () => {
    const fs = new MemoryFileSystem()
    const cache = new SnapshotCache(fs, file, silentLogger)
    await cache.save({ claude })
    expect(await cache.load()).toEqual({ claude })
  })

  it('starts empty when the file is missing or corrupt', async () => {
    expect(await new SnapshotCache(new MemoryFileSystem(), file, silentLogger).load()).toEqual({})
    expect(await new SnapshotCache(new MemoryFileSystem({ [file]: '[' }), file, silentLogger).load()).toEqual({})
    expect(await new SnapshotCache(new MemoryFileSystem({ [file]: '{"version":99}' }), file, silentLogger).load()).toEqual({})
  })

  it('drops malformed entries and keeps good ones', async () => {
    const fs = new MemoryFileSystem({
      [file]: JSON.stringify({
        version: 1,
        providers: {
          claude,
          codex: { providerId: 'codex', displayName: 'Codex', refreshedAt: 'yesterday', lines: [] },
          cursor: { ...claude, providerId: 'not-cursor' }
        }
      })
    })
    expect(await new SnapshotCache(fs, file, silentLogger).load()).toEqual({ claude })
  })
})
