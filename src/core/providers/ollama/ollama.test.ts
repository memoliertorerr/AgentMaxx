import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeContext, json } from '../../../../tests/helpers/fakes'
import type { HttpRequest } from '../../http'
import { loadSigningKey } from './auth'
import { OllamaProvider, PLAN_WARNING } from './index'
import { balanceLines, ollamaPlan } from './mapper'
import { ed25519PrivateKey, parseOpenSshEd25519, rawPublicKey } from './openssh'

const fixtureText = (name: string) => readFileSync(path.join(__dirname, '../../../../tests/fixtures/ollama', name), 'utf8')
const KEY_PATH = 'C:\\Users\\ada\\.ollama\\id_ed25519'
const now = new Date('2023-11-14T22:13:20Z') // 1_700_000_000

// SSH wire format: a big-endian uint32 length, then the payload.
const u32 = (value: number) => {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value)
  return buffer
}
const str = (payload: Buffer | string) => {
  const bytes = typeof payload === 'string' ? Buffer.from(payload) : payload
  return Buffer.concat([u32(bytes.length), bytes])
}

/** Writes a key the way `ssh-keygen -t ed25519` (and Ollama) does, optionally with a foreign public half. */
function makeOpenSshKey(options: { declaredPublicKey?: Buffer; cipher?: string } = {}) {
  const { privateKey } = generateKeyPairSync('ed25519')
  const jwk = privateKey.export({ format: 'jwk' })
  const seed = Buffer.from(jwk.d ?? '', 'base64url')
  const publicRaw = Buffer.from(jwk.x ?? '', 'base64url')
  const publicBlob = Buffer.concat([str('ssh-ed25519'), str(options.declaredPublicKey ?? publicRaw)])
  let privateSection = Buffer.concat([u32(0x1234), u32(0x1234), str('ssh-ed25519'), str(publicRaw), str(Buffer.concat([seed, publicRaw])), str('ada@pc')])
  let pad = 1
  while (privateSection.length % 8 !== 0) privateSection = Buffer.concat([privateSection, Buffer.from([pad++])])
  const blob = Buffer.concat([Buffer.from('openssh-key-v1\0', 'latin1'), str(options.cipher ?? 'none'), str('none'), str(''), u32(1), str(publicBlob), str(privateSection)])
  const body = blob.toString('base64').replace(/(.{70})/g, '$1\n')
  return { pem: `-----BEGIN OPENSSH PRIVATE KEY-----\n${body}\n-----END OPENSSH PRIVATE KEY-----\n`, publicRaw, publicBlob }
}

const testKey = makeOpenSshKey()

describe('OpenSSH ed25519 parsing', () => {
  it('parses an unencrypted key into the SSH public blob and a working private key', () => {
    const key = parseOpenSshEd25519(testKey.pem)
    expect(key?.publicKeyBase64).toBe(testKey.publicBlob.toString('base64'))
    expect(Buffer.from(key?.publicKeyBase64 ?? '', 'base64')).toHaveLength(51)
    expect(rawPublicKey(key!.privateKey).equals(testKey.publicRaw)).toBe(true)
  })

  it('accepts Windows line endings', () => {
    expect(parseOpenSshEd25519(testKey.pem.replace(/\n/g, '\r\n'))).toBeDefined()
  })

  it('rejects a key whose declared public half does not match its private half', () => {
    const foreign = rawPublicKey(generateKeyPairSync('ed25519').privateKey)
    expect(parseOpenSshEd25519(makeOpenSshKey({ declaredPublicKey: foreign }).pem)).toBeUndefined()
  })

  it('rejects encrypted, malformed, and truncated keys', () => {
    const body = testKey.pem.split('\n').filter((line) => line && !line.startsWith('-----')).join('')
    for (const pem of [
      '',
      'not a key at all',
      '-----BEGIN OPENSSH PRIVATE KEY-----\nZm9v\n-----END OPENSSH PRIVATE KEY-----',
      `-----BEGIN OPENSSH PRIVATE KEY-----\n${body.slice(0, body.length / 2)}\n-----END OPENSSH PRIVATE KEY-----`,
      makeOpenSshKey({ cipher: 'aes256-ctr' }).pem
    ]) {
      expect(parseOpenSshEd25519(pem), pem.slice(0, 40)).toBeUndefined()
    }
  })

  it('builds the same key Node derives from the seed', () => {
    const { privateKey } = generateKeyPairSync('ed25519')
    const seed = Buffer.from(privateKey.export({ format: 'jwk' }).d ?? '', 'base64url')
    expect(rawPublicKey(ed25519PrivateKey(seed)).equals(rawPublicKey(privateKey))).toBe(true)
  })
})

describe('Ollama signing key', () => {
  it('reads %USERPROFILE%\\.ollama\\id_ed25519, and throws for a broken file instead of reading as logged out', async () => {
    expect(await loadSigningKey(fakeContext())).toBeUndefined()
    expect(await loadSigningKey(fakeContext({ files: { [KEY_PATH]: testKey.pem } }))).toBeDefined()
    await expect(loadSigningKey(fakeContext({ files: { [KEY_PATH]: 'garbage' } }))).rejects.toMatchObject({ category: 'authInvalid' })
    const locked = fakeContext({ files: { [KEY_PATH]: testKey.pem } })
    locked.fs.unreadable.add(KEY_PATH)
    await expect(loadSigningKey(locked)).rejects.toMatchObject({ category: 'credentialAccess' })
  })
})

describe('Ollama balance mapping', () => {
  it('maps current plans to a Monthly dollar meter and purchased credits', () => {
    expect(balanceLines(fixtureText('balance-current.json'))).toEqual([
      { type: 'progress', label: 'Monthly', used: 27.5, limit: 100, format: { kind: 'dollars' }, resetsAt: '2026-10-15T09:30:00.000Z', periodDurationMs: 30 * 24 * 3_600_000 },
      { type: 'values', label: 'Purchased Credits', values: [{ number: 25, kind: 'dollars' }] }
    ])
  })

  it('maps legacy plans to Session and Weekly, keeping a real $0 balance', () => {
    expect(balanceLines(fixtureText('balance-legacy.json'))).toEqual([
      { type: 'progress', label: 'Session', used: 25, limit: 100, format: { kind: 'percent' }, resetsAt: '2026-10-01T07:00:00.000Z', periodDurationMs: 5 * 3_600_000 },
      { type: 'progress', label: 'Weekly', used: 60, limit: 100, format: { kind: 'percent' }, resetsAt: '2026-10-05T00:00:00.000Z', periodDurationMs: 7 * 24 * 3_600_000 },
      { type: 'values', label: 'Purchased Credits', values: [{ number: 0, kind: 'dollars' }] }
    ])
  })

  it('omits an absent meter, and fails loudly without a readable allowance', () => {
    expect(balanceLines('{"included":{"session":{"remaining_percent":90}}}')).toEqual([{ type: 'progress', label: 'Session', used: 10, limit: 100, format: { kind: 'percent' } }])
    expect(() => balanceLines('{"included":{"allowance_usd":"lots"}}')).toThrow(expect.objectContaining({ category: 'decoding' }))
    expect(() => balanceLines('{"purchased":{"balance_usd":5}}')).toThrow(expect.objectContaining({ category: 'decoding' }))
  })

  it('reads the plan in either casing and tells absent from unreadable', () => {
    expect(ollamaPlan('{"Plan":"pro"}')).toEqual({ kind: 'named', name: 'Pro' })
    expect(ollamaPlan('{"plan":"MAX"}')).toEqual({ kind: 'named', name: 'Max' })
    expect(ollamaPlan('{"Plan":""}')).toEqual({ kind: 'absent' })
    expect(ollamaPlan('{"Plan":3}')).toEqual({ kind: 'unreadable' })
    expect(ollamaPlan('<html>')).toEqual({ kind: 'unreadable' })
  })
})

const isBalance = (r: HttpRequest) => r.url.startsWith('https://ollama.com/api/balance')
const isAccount = (r: HttpRequest) => r.url.startsWith('https://ollama.com/api/me')

describe('OllamaProvider', () => {
  it('signs "<METHOD>,<request-uri>" with the key, verifiable against its public half', async () => {
    const ctx = fakeContext({ now, files: { [KEY_PATH]: testKey.pem } })
    ctx.http.on(isBalance, () => ({ status: 200, headers: {}, text: fixtureText('balance-current.json') })).on(isAccount, () => json({ Plan: 'pro' }))
    const snapshot = await new OllamaProvider().refresh(ctx)
    expect(snapshot).toMatchObject({ plan: 'Pro' })
    expect(snapshot.warning).toBeUndefined()

    const balance = ctx.http.requests.find(isBalance)
    expect(balance).toMatchObject({ method: 'GET', url: 'https://ollama.com/api/balance?ts=1700000000' })
    expect(ctx.http.requests.find(isAccount)).toMatchObject({ method: 'POST', url: 'https://ollama.com/api/me?ts=1700000000' })

    const [publicPart, signature] = (balance?.headers?.Authorization ?? '').split(':')
    expect(publicPart).toBe(testKey.publicBlob.toString('base64'))
    const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), testKey.publicRaw])
    const publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' })
    expect(verify(null, Buffer.from('GET,/api/balance?ts=1700000000'), publicKey, Buffer.from(signature ?? '', 'base64'))).toBe(true)
    expect(verify(null, Buffer.from('GET,/api/balance?ts=1700000001'), publicKey, Buffer.from(signature ?? '', 'base64'))).toBe(false)
  })

  it('never enables itself, even with a usable key on disk', async () => {
    const provider = new OllamaProvider()
    expect(provider.info.autoEnable).toBe(false)
    expect(await provider.hasLocalCredentials()).toBe(false)
  })

  it('keeps the meters with a warning when the plan lookup fails or is unreadable', async () => {
    for (const account of [json({}, 500), { status: 200, headers: {}, text: 'nope' }]) {
      const ctx = fakeContext({ now, files: { [KEY_PATH]: testKey.pem } })
      ctx.http.on(isBalance, () => ({ status: 200, headers: {}, text: fixtureText('balance-legacy.json') })).on(isAccount, () => account)
      const snapshot = await new OllamaProvider().refresh(ctx)
      expect(snapshot.warning).toBe(PLAN_WARNING)
      expect(snapshot.plan).toBeUndefined()
      expect(snapshot.lines).toHaveLength(3)
    }
  })

  it('stays quiet for an account without a plan', async () => {
    const ctx = fakeContext({ now, files: { [KEY_PATH]: testKey.pem } })
    ctx.http.on(isBalance, () => ({ status: 200, headers: {}, text: fixtureText('balance-legacy.json') })).on(isAccount, () => json({ Plan: '' }))
    const snapshot = await new OllamaProvider().refresh(ctx)
    expect(snapshot.warning).toBeUndefined()
  })

  it('reports a missing key without calling the network, and an unknown key as not signed in', async () => {
    const missing = fakeContext()
    await expect(new OllamaProvider().refresh(missing)).rejects.toMatchObject({ category: 'notLoggedIn', message: expect.stringContaining('No Ollama key found') })
    expect(missing.http.requests).toEqual([])

    const unknown = fakeContext({ now, files: { [KEY_PATH]: testKey.pem } })
    unknown.http.on(isBalance, () => json({ error: 'unauthorized' }, 401)).on(isAccount, () => json({}, 401))
    await expect(new OllamaProvider().refresh(unknown)).rejects.toMatchObject({ message: 'Not signed in to Ollama Cloud. Run `ollama signin` to see usage.' })

    const down = fakeContext({ now, files: { [KEY_PATH]: testKey.pem } })
    down.http.on(isBalance, () => json({}, 503)).on(isAccount, () => json({ Plan: 'pro' }))
    await expect(new OllamaProvider().refresh(down)).rejects.toMatchObject({ category: 'http5xx' })
  })
})
