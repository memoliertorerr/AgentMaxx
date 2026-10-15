import type { FileSystem } from './fs'
import type { Logger } from './runtime'
import type { MetricLine, ProviderSnapshot } from './types'

// The last good snapshot per provider, on disk, so the popup shows real numbers the instant
// the app starts. Errors are never cached — the engine only hands over successful snapshots.

const CACHE_VERSION = 1

interface CacheFile {
  version: number
  providers: Record<string, ProviderSnapshot>
}

const LINE_TYPES = new Set<MetricLine['type']>(['progress', 'values', 'badge', 'text'])

function isSnapshot(value: unknown): value is ProviderSnapshot {
  if (value === null || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.providerId === 'string' &&
    typeof record.displayName === 'string' &&
    typeof record.refreshedAt === 'string' &&
    !Number.isNaN(Date.parse(record.refreshedAt)) &&
    Array.isArray(record.lines) &&
    record.lines.every(
      (line: unknown) =>
        line !== null &&
        typeof line === 'object' &&
        LINE_TYPES.has((line as { type: MetricLine['type'] }).type) &&
        typeof (line as { label?: unknown }).label === 'string'
    )
  )
}

export class SnapshotCache {
  constructor(
    private readonly fs: FileSystem,
    private readonly filePath: string,
    private readonly log: Logger
  ) {}

  async load(): Promise<Record<string, ProviderSnapshot>> {
    let text: string | undefined
    try {
      text = await this.fs.readText(this.filePath)
    } catch (error) {
      this.log.warn('cache', `couldn't read the snapshot cache: ${String(error)}`)
      return {}
    }
    if (text === undefined) return {}
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      this.log.warn('cache', 'snapshot cache is not valid JSON; starting empty')
      return {}
    }
    const file = parsed as Partial<CacheFile> | null
    if (!file || file.version !== CACHE_VERSION || typeof file.providers !== 'object' || file.providers === null) {
      this.log.info('cache', 'snapshot cache has an unknown shape; starting empty')
      return {}
    }
    const result: Record<string, ProviderSnapshot> = {}
    for (const [id, snapshot] of Object.entries(file.providers)) {
      if (isSnapshot(snapshot) && snapshot.providerId === id) result[id] = snapshot
      else this.log.warn('cache', `dropped a malformed cache entry for ${id}`)
    }
    return result
  }

  async save(snapshots: Readonly<Record<string, ProviderSnapshot>>): Promise<void> {
    const file: CacheFile = { version: CACHE_VERSION, providers: { ...snapshots } }
    await this.fs.writeTextAtomic(this.filePath, JSON.stringify(file))
  }
}
