import { DatabaseSync } from 'node:sqlite'

// Read-only access to small key/value tables in other apps' SQLite files (Cursor's state.vscdb).
// Uses the SQLite built into Node (and Electron 44's Node 24), so there's no native module to
// rebuild. The database is opened read-only and closed right away; nothing is ever written.

export interface SqliteReader {
  /**
   * Values for `keys` from `table` (columns `key`, `value`). Undefined when the file doesn't
   * exist; throws when it exists but can't be opened or queried.
   */
  readKeyValues(dbPath: string, table: string, keys: readonly string[]): Promise<Record<string, string> | undefined>
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/

function asText(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8')
  return undefined
}

export function createSqliteReader(exists: (path: string) => Promise<boolean>): SqliteReader {
  return {
    async readKeyValues(dbPath, table, keys) {
      if (!IDENTIFIER.test(table)) throw new Error(`invalid table name: ${table}`)
      if (!(await exists(dbPath))) return undefined
      const db = new DatabaseSync(dbPath, { readOnly: true })
      try {
        const placeholders = keys.map(() => '?').join(', ')
        const rows = db.prepare(`SELECT key, value FROM ${table} WHERE key IN (${placeholders})`).all(...keys)
        const result: Record<string, string> = {}
        for (const row of rows) {
          const key = asText(row.key)
          const value = asText(row.value)
          if (key !== undefined && value !== undefined) result[key] = value
        }
        return result
      } finally {
        db.close()
      }
    }
  }
}
