import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

// AgentMaxx was called UsageMaxx up to 0.1. On the first launch after the rename, settings, the
// last readings, and saved API keys come over from the old data folder (%APPDATA%\UsageMaxx).
// The old folder is left as it was.

export const LEGACY_FOLDER = 'UsageMaxx'

/**
 * Copy order matters: settings.json goes last, because its presence marks the move as done, so a
 * copy that fails halfway is retried on the next launch. "Local State" holds Chromium's key for
 * safeStorage; saved API keys can't be decrypted without it.
 */
export const LEGACY_FILES = ['Local State', 'api-keys.json', 'snapshots.json', 'settings.json'] as const

export interface LegacyMigration {
  copied: string[]
  error?: string
}

/** The files to bring over: none if the old folder has no settings or AgentMaxx has its own. */
export function legacyFilesToCopy(legacyDir: string, targetDir: string): string[] {
  const has = (dir: string, name: string): boolean => existsSync(path.join(dir, name))
  if (!has(legacyDir, 'settings.json') || has(targetDir, 'settings.json')) return []
  // Keys already saved in AgentMaxx only decrypt with its own "Local State", so both stay.
  const keepOwnKeys = has(targetDir, 'api-keys.json')
  return LEGACY_FILES.filter(
    (name) => has(legacyDir, name) && !(keepOwnKeys && (name === 'api-keys.json' || name === 'Local State'))
  )
}

/** Runs synchronously before the app is ready, i.e. before Chromium reads "Local State". */
export function migrateLegacyUserData(legacyDir: string, targetDir: string): LegacyMigration {
  const copied: string[] = []
  try {
    const files = legacyFilesToCopy(legacyDir, targetDir)
    if (files.length === 0) return { copied }
    mkdirSync(targetDir, { recursive: true })
    for (const name of files) {
      copyFileSync(path.join(legacyDir, name), path.join(targetDir, name))
      copied.push(name)
    }
    return { copied }
  } catch (error) {
    return { copied, error: error instanceof Error ? error.message : String(error) }
  }
}
