import { describe, expect, it } from 'vitest'
import { MemoryFileSystem, silentLogger } from '../../tests/helpers/fakes'
import type { Env } from '../core/paths'
import { ApiKeyVault, type KeyCipher } from './apiKeys'

const FILE = 'C:\\Users\\ada\\AppData\\Roaming\\AgentMaxx\\api-keys.json'
const KEY = 'sk-or-v1-0123456789abcdef'

/** Reversible stand-in for DPAPI: the plaintext never appears in its output. */
function fakeCipher(available = true): KeyCipher & { encrypted: string[] } {
  const encrypted: string[] = []
  return {
    encrypted,
    isAvailable: () => available,
    encrypt(plain) {
      encrypted.push(plain)
      return Buffer.from(`enc:${[...plain].reverse().join('')}`, 'utf8')
    },
    decrypt(data) {
      const text = data.toString('utf8')
      if (!text.startsWith('enc:')) throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.')
      return [...text.slice(4)].reverse().join('')
    }
  }
}

function vault(options: { cipher?: KeyCipher; env?: Env; files?: Record<string, string> } = {}) {
  const fs = new MemoryFileSystem(options.files)
  const cipher = options.cipher ?? fakeCipher()
  return { fs, vault: new ApiKeyVault({ fs, filePath: FILE, cipher, env: () => options.env ?? {}, log: silentLogger }) }
}

describe('ApiKeyVault', () => {
  it('encrypts through the cipher and never writes the plaintext key', async () => {
    const cipher = fakeCipher()
    const { fs, vault: keys } = vault({ cipher })
    expect(await keys.save('openrouter', `  ${KEY}\n`)).toEqual({ ok: true })
    expect(cipher.encrypted).toEqual([KEY])
    const written = fs.files.get(FILE) ?? ''
    expect(written).not.toContain(KEY)
    expect(Buffer.from(JSON.parse(written).keys.openrouter, 'base64').toString('utf8')).not.toContain(KEY)
    expect(JSON.parse(written)).toEqual({ version: 1, keys: { openrouter: expect.any(String) } })
    expect(await keys.get('openrouter')).toBe(KEY)
    expect(await keys.has('openrouter')).toBe(true)
  })

  it('refuses to save when encryption is unavailable, with no plaintext fallback', async () => {
    const { fs, vault: keys } = vault({ cipher: fakeCipher(false) })
    const result = await keys.save('zai', KEY)
    expect(result).toEqual({ ok: false, reason: "This PC can't encrypt the key, so it wasn't saved. Set ZAI_API_KEY instead." })
    expect(fs.writes).toEqual([])
  })

  it('rejects unknown providers and malformed keys without writing', async () => {
    const { fs, vault: keys } = vault()
    expect(await keys.save('claude', KEY)).toEqual({ ok: false, reason: 'Unknown provider' })
    expect(await keys.save('openrouter', 'two words')).toMatchObject({ ok: false })
    expect(await keys.save('openrouter', 7)).toMatchObject({ ok: false })
    expect(fs.writes).toEqual([])
  })

  it('tracks status across environment and saved keys', async () => {
    const { vault: keys } = vault({ env: { OPENROUTER_API_KEY: 'sk-env' } })
    expect(await keys.statuses()).toEqual([
      { providerId: 'openrouter', status: 'fromEnvironment', environmentVariable: 'OPENROUTER_API_KEY' },
      { providerId: 'zai', status: 'notSet' }
    ])
    await keys.save('openrouter', KEY)
    await keys.save('zai', 'zk-123')
    expect(await keys.status('openrouter')).toBe('overrideActive')
    expect(await keys.status('zai')).toBe('saved')
    expect(await keys.clear('openrouter')).toEqual({ ok: true })
    expect(await keys.status('openrouter')).toBe('fromEnvironment')
    expect(await keys.get('openrouter')).toBeUndefined()
    expect(await keys.get('zai')).toBe('zk-123')
  })

  it('reveals the key in use: saved first, then the environment', async () => {
    const { vault: keys } = vault({ env: { GLM_API_KEY: 'glm-env' } })
    expect(await keys.reveal('zai')).toBe('glm-env')
    await keys.save('zai', 'zk-saved')
    expect(await keys.reveal('zai')).toBe('zk-saved')
    expect(await keys.reveal('nope')).toBeUndefined()
  })

  it('keeps both keys when saves overlap', async () => {
    const { vault: keys } = vault()
    await Promise.all([keys.save('openrouter', KEY), keys.save('zai', 'zk-123')])
    expect(await keys.get('openrouter')).toBe(KEY)
    expect(await keys.get('zai')).toBe('zk-123')
  })

  it('treats a corrupt file as empty and reports keys it cannot decrypt', async () => {
    expect(await vault({ files: { [FILE]: '{not json' } }).vault.has('openrouter')).toBe(false)
    const garbled = vault({ files: { [FILE]: JSON.stringify({ version: 1, keys: { zai: Buffer.from('garbage').toString('base64') } }) } })
    await expect(garbled.vault.get('zai')).rejects.toMatchObject({
      category: 'credentialAccess',
      message: "Couldn't decrypt the saved Z.ai API key. Save it again in Settings → API Keys."
    })
    // Status never decrypts, so it still reports the saved key.
    expect(await garbled.vault.status('zai')).toBe('saved')
  })

  it('reports a failed write', async () => {
    const { fs, vault: keys } = vault()
    fs.writeTextAtomic = () => Promise.reject(new Error('EACCES'))
    expect(await keys.save('openrouter', KEY)).toEqual({ ok: false, reason: "Couldn't save the change. Check the log for details." })
  })
})
