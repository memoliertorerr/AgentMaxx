import { API_KEY_PROVIDERS, apiKeyProvider, apiKeyStatus, keyFromEnvironment, normalizeApiKey, type ApiKeyStatus } from '../core/apiKeys'
import { ProviderError } from '../core/errors'
import type { FileSystem } from '../core/fs'
import type { ApiKeyEntry, ChangeResult } from '../core/ipc'
import { asObject, parseJson } from '../core/parse'
import type { Env } from '../core/paths'
import type { ApiKeyStore, Logger } from '../core/runtime'

// API keys saved in Settings → API Keys. Each key is encrypted with Electron `safeStorage` (DPAPI
// on Windows) and stored as base64 ciphertext in <userData>/api-keys.json. There is no plaintext
// fallback: when encryption isn't available, saving is refused. The cipher is injected, so this
// file has no Electron import and is tested under plain Node.

export interface KeyCipher {
  isAvailable(): boolean
  encrypt(plain: string): Buffer
  decrypt(encrypted: Buffer): string
}

export interface ApiKeyVaultOptions {
  fs: FileSystem
  filePath: string
  cipher: KeyCipher
  /** The environment, read each time so status reflects the running process. */
  env: () => Env
  log: Logger
}

const FILE_VERSION = 1

export class ApiKeyVault implements ApiKeyStore {
  /** Serializes read-modify-write cycles so two saves can't drop each other's key. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly options: ApiKeyVaultOptions) {}

  async has(providerId: string): Promise<boolean> {
    return (await this.readKeys())[providerId] !== undefined
  }

  async get(providerId: string): Promise<string | undefined> {
    const encoded = (await this.readKeys())[providerId]
    if (encoded === undefined) return undefined
    try {
      return this.options.cipher.decrypt(Buffer.from(encoded, 'base64'))
    } catch (error) {
      this.options.log.warn('api-keys', `couldn't decrypt the saved ${providerId} key: ${error instanceof Error ? error.message : String(error)}`)
      const name = apiKeyProvider(providerId)?.displayName ?? providerId
      throw new ProviderError('credentialAccess', `Couldn't decrypt the saved ${name} API key. Save it again in Settings → API Keys.`)
    }
  }

  async status(providerId: string): Promise<ApiKeyStatus> {
    const provider = apiKeyProvider(providerId)
    if (!provider) return 'notSet'
    return apiKeyStatus(await this.has(providerId), keyFromEnvironment(this.options.env(), provider.envNames) !== undefined)
  }

  /** Status for every key-based provider, in catalog order. Never decrypts. */
  async statuses(): Promise<ApiKeyEntry[]> {
    return Promise.all(API_KEY_PROVIDERS.map(async (provider) => ({ providerId: provider.id, status: await this.status(provider.id) })))
  }

  async save(providerId: string, raw: unknown): Promise<ChangeResult> {
    const provider = apiKeyProvider(providerId)
    if (!provider) return { ok: false, reason: 'Unknown provider' }
    const key = normalizeApiKey(raw)
    if (!key) return { ok: false, reason: 'Paste the whole key, without spaces.' }
    if (!this.options.cipher.isAvailable()) {
      this.options.log.warn('api-keys', 'safeStorage encryption is unavailable; refusing to save a key')
      return { ok: false, reason: `This PC can't encrypt the key, so it wasn't saved. Set ${provider.envNames[0]} instead.` }
    }
    const encrypted = this.options.cipher.encrypt(key).toString('base64')
    return this.update(providerId, (keys) => ({ ...keys, [providerId]: encrypted }), 'saved')
  }

  async clear(providerId: string): Promise<ChangeResult> {
    if (!apiKeyProvider(providerId)) return { ok: false, reason: 'Unknown provider' }
    return this.update(
      providerId,
      (keys) => Object.fromEntries(Object.entries(keys).filter(([id]) => id !== providerId)),
      'cleared'
    )
  }

  /** The key in use (saved, else the environment's), only for an explicit reveal. */
  async reveal(providerId: string): Promise<string | undefined> {
    const provider = apiKeyProvider(providerId)
    if (!provider) return undefined
    return (await this.get(providerId)) ?? keyFromEnvironment(this.options.env(), provider.envNames)
  }

  private update(providerId: string, change: (keys: Record<string, string>) => Record<string, string>, verb: string): Promise<ChangeResult> {
    const run = async (): Promise<ChangeResult> => {
      try {
        const keys = change(await this.readKeys())
        await this.options.fs.writeTextAtomic(this.options.filePath, JSON.stringify({ version: FILE_VERSION, keys }, null, 2))
        this.options.log.info('api-keys', `${verb} the ${providerId} key`)
        return { ok: true }
      } catch (error) {
        this.options.log.error('api-keys', `couldn't update ${this.options.filePath}: ${error instanceof Error ? error.message : String(error)}`)
        return { ok: false, reason: "Couldn't save the change. Check the log for details." }
      }
    }
    const result = this.queue.then(run, run)
    this.queue = result
    return result
  }

  /** Saved ciphertexts by provider id. A missing or corrupt file holds no keys. */
  private async readKeys(): Promise<Record<string, string>> {
    const text = await this.options.fs.readText(this.options.filePath)
    if (text === undefined) return {}
    const keys = asObject(asObject(parseJson(text))?.keys)
    if (!keys) {
      this.options.log.warn('api-keys', `${this.options.filePath} is not a valid key file; treating it as empty`)
      return {}
    }
    const result: Record<string, string> = {}
    for (const [id, value] of Object.entries(keys)) {
      if (typeof value === 'string' && value) result[id] = value
    }
    return result
  }
}
