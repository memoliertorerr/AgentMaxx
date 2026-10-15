import type { StoredSecret } from './runtime'

// Parsing for the Windows Credential Manager reader (src/main/windowsCredentials.ts runs the
// PowerShell). Kept here, pure, so it's tested on any OS.

/**
 * Decodes a credential blob. Go tools (gh via go-keyring) store UTF-8 bytes; many Windows apps
 * store UTF-16LE. UTF-16LE text of ASCII has a zero in every odd byte, which is how it's told apart.
 */
export function decodeCredentialBlob(bytes: Buffer): string {
  if (bytes.length >= 2 && bytes.length % 2 === 0) {
    let zeros = 0
    for (let i = 1; i < bytes.length; i += 2) if (bytes[i] === 0) zeros++
    if (zeros >= (bytes.length / 2) * 0.9) return bytes.toString('utf16le')
  }
  return bytes.toString('utf8')
}

/** Unwraps go-keyring's `go-keyring-base64:` prefix (how gh stores tokens), trimming whitespace. */
export function unwrapGoKeyring(raw: string): string | undefined {
  let text = raw.trim()
  const prefix = 'go-keyring-base64:'
  if (text.startsWith(prefix)) text = Buffer.from(text.slice(prefix.length).trim(), 'base64').toString('utf8').trim()
  return text || undefined
}

/**
 * Parses the reader's output: one JSON object per line with `target`, `user`, and `blob`
 * (base64). Malformed lines are skipped.
 */
export function parseCredentialLines(stdout: string): StoredSecret[] {
  const secrets: StoredSecret[] = []
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{')) continue
    try {
      const entry = JSON.parse(trimmed) as { target?: unknown; user?: unknown; blob?: unknown }
      if (typeof entry.target !== 'string' || typeof entry.blob !== 'string') continue
      const secret = decodeCredentialBlob(Buffer.from(entry.blob, 'base64'))
      secrets.push({
        target: entry.target,
        secret,
        ...(typeof entry.user === 'string' && entry.user ? { userName: entry.user } : {})
      })
    } catch {
      // A garbled line can't be a usable credential; skip it.
    }
  }
  return secrets
}
