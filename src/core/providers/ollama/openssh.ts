import { createPrivateKey, createPublicKey, sign, type KeyObject } from 'node:crypto'

// A minimal reader for the unencrypted OpenSSH private-key container, scoped to what Ollama writes:
// one `ssh-ed25519` key, no passphrase (upstream OpenSSHEd25519Key). Node can't import OpenSSH keys,
// so the 32-byte seed is wrapped in a PKCS#8 DER for `crypto`. The file is arbitrary bytes on disk:
// every read is bounds-checked, and anything unexpected returns undefined.
//
//   "openssh-key-v1\0" | string cipher | string kdf | string kdfoptions | uint32 count
//                      | string publickey | string privatekeys
//   private section:   uint32 check | uint32 check | string type | string pub | string priv | …
//   ed25519 priv:      32-byte seed || 32-byte public key

const MAGIC = Buffer.from('openssh-key-v1\0', 'latin1')
const KEY_TYPE = 'ssh-ed25519'
/** PKCS#8 PrivateKeyInfo for Ed25519 (RFC 8410), up to the 32-byte seed. */
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex')

/** Secret key material: lives in memory for one refresh, never logged, cached, or written. */
export interface OllamaSigningKey {
  /** Base64 of the SSH wire-format public key (the `AAAAC3Nz…` body of id_ed25519.pub). */
  publicKeyBase64: string
  privateKey: KeyObject
}

class ByteReader {
  private offset: number
  constructor(
    private readonly bytes: Buffer,
    offset = 0
  ) {
    this.offset = offset
  }

  uint32(): number | undefined {
    if (this.offset + 4 > this.bytes.length) return undefined
    const value = this.bytes.readUInt32BE(this.offset)
    this.offset += 4
    return value
  }

  string(): Buffer | undefined {
    const length = this.uint32()
    if (length === undefined || this.offset + length > this.bytes.length) return undefined
    const value = this.bytes.subarray(this.offset, this.offset + length)
    this.offset += length
    return value
  }
}

function base64Body(pem: string): Buffer | undefined {
  const body = pem
    .split(/\r?\n|\r/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('-----'))
    .join('')
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) return undefined
  return Buffer.from(body, 'base64')
}

const is = (value: Buffer | undefined, text: string) => value !== undefined && value.equals(Buffer.from(text, 'utf8'))

export function ed25519PrivateKey(seed: Buffer): KeyObject {
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]), format: 'der', type: 'pkcs8' })
}

/** The raw 32-byte public key of a private key. */
export function rawPublicKey(privateKey: KeyObject): Buffer {
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' })
  return Buffer.from(jwk.x ?? '', 'base64url')
}

export function parseOpenSshEd25519(pem: string): OllamaSigningKey | undefined {
  const blob = base64Body(pem)
  if (!blob || blob.length < MAGIC.length || !blob.subarray(0, MAGIC.length).equals(MAGIC)) return undefined

  const reader = new ByteReader(blob, MAGIC.length)
  // An encrypted key needs the user's passphrase; Ollama never writes one.
  if (!is(reader.string(), 'none') || !is(reader.string(), 'none')) return undefined
  if (reader.string() === undefined) return undefined // kdfoptions
  if (reader.uint32() !== 1) return undefined
  const publicKeyBlob = reader.string()
  const privateSection = reader.string()
  if (!publicKeyBlob || !privateSection) return undefined

  const priv = new ByteReader(privateSection)
  if (priv.uint32() === undefined || priv.uint32() === undefined) return undefined // checkints
  if (!is(priv.string(), KEY_TYPE)) return undefined
  if (priv.string() === undefined) return undefined // public key, repeated
  const secret = priv.string()
  if (!secret || secret.length !== 64) return undefined

  let privateKey: KeyObject
  try {
    privateKey = ed25519PrivateKey(Buffer.from(secret.subarray(0, 32)))
  } catch {
    return undefined
  }
  const derived = rawPublicKey(privateKey)
  // The header carries the outer public key while the signature comes from the seed. A damaged
  // file pairing them wrongly would be "not signed in" forever, so reject it as unusable instead.
  if (!derived.equals(secret.subarray(32))) return undefined
  const outer = new ByteReader(publicKeyBlob)
  if (!is(outer.string(), KEY_TYPE)) return undefined
  const outerKey = outer.string()
  if (!outerKey || !outerKey.equals(derived)) return undefined

  return { publicKeyBase64: publicKeyBlob.toString('base64'), privateKey }
}

/**
 * The Authorization header the Ollama CLI sends: "<base64 public key>:<base64 signature>" over
 * "<METHOD>,<request-uri>".
 */
export function ollamaAuthorization(key: OllamaSigningKey, method: string, requestUri: string): string {
  const signature = sign(null, Buffer.from(`${method},${requestUri}`, 'utf8'), key.privateKey)
  return `${key.publicKeyBase64}:${signature.toString('base64')}`
}
