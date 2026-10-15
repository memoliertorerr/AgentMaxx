import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeContext, json } from '../../../../tests/helpers/fakes'
import { USAGE_URL } from './client'
import { OpenCodeProvider } from './index'
import { loadGoKey, openCodeAuthPath } from './auth'
import { mapGoUsage, referenceDate } from './mapper'

const fixtureText = (name: string) => readFileSync(path.join(__dirname, '../../../../tests/fixtures/opencode', name), 'utf8')
const AUTH = 'C:\\Users\\ada\\.local\\share\\opencode\\auth.json'
const now = new Date('2026-10-15T12:00:00Z')
const HOUR_MS = 3_600_000
const goAuth = (key: string) => JSON.stringify({ 'opencode-go': { type: 'api', key }, anthropic: { type: 'oauth', access: 'x' } })

describe('OpenCode data directory', () => {
  it('uses %USERPROFILE%\\.local\\share\\opencode, OPENCODE_DATA_DIR, then XDG_DATA_HOME', () => {
    expect(openCodeAuthPath(fakeContext())).toBe(AUTH)
    expect(openCodeAuthPath(fakeContext({ env: { USERPROFILE: 'C:\\Users\\ada', OPENCODE_DATA_DIR: 'D:\\oc', XDG_DATA_HOME: 'E:\\xdg' } }))).toBe('D:\\oc\\auth.json')
    expect(openCodeAuthPath(fakeContext({ env: { USERPROFILE: 'C:\\Users\\ada', XDG_DATA_HOME: '~\\data' } }))).toBe('C:\\Users\\ada\\data\\opencode\\auth.json')
  })

  it('reads only the opencode-go key and treats a broken file as unreadable, not logged out', async () => {
    expect(await loadGoKey(fakeContext({ files: { [AUTH]: goAuth(' go-key ') } }))).toBe('go-key')
    expect(await loadGoKey(fakeContext({ files: { [AUTH]: '{"opencode":{"key":"zen"}}' } }))).toBeUndefined()
    expect(await loadGoKey(fakeContext())).toBeUndefined()
    await expect(loadGoKey(fakeContext({ files: { [AUTH]: '{oops' } }))).rejects.toMatchObject({ category: 'credentialAccess' })
    const locked = fakeContext({ files: { [AUTH]: goAuth('k') } })
    locked.fs.unreadable.add(AUTH)
    await expect(loadGoKey(locked)).rejects.toMatchObject({ category: 'credentialAccess' })
    expect(await new OpenCodeProvider().hasLocalCredentials(locked)).toBe(true)
  })
})

describe('OpenCode Go usage mapping', () => {
  it('maps rolling, weekly, and monthly windows to percent meters', () => {
    expect(mapGoUsage(fixtureText('usage.json'), now)).toEqual([
      { type: 'progress', label: 'Session', used: 23, limit: 100, format: { kind: 'percent' }, periodDurationMs: 5 * HOUR_MS, resetsAt: '2026-10-15T14:30:00.000Z' },
      { type: 'progress', label: 'Weekly', used: 41, limit: 100, format: { kind: 'percent' }, periodDurationMs: 168 * HOUR_MS, resetsAt: '2026-10-19T00:00:00.000Z' },
      { type: 'progress', label: 'Monthly', used: 12, limit: 100, format: { kind: 'percent' }, periodDurationMs: 720 * HOUR_MS, resetsAt: '2026-11-01T00:00:00.000Z' }
    ])
  })

  it('drops the untouched session placeholder reset but keeps a real one at 0%', () => {
    const body = (rollingReset: string) =>
      JSON.stringify({ usage: { rolling: { percent: 0, resetsAt: rollingReset }, weekly: { percent: 0, resetsAt: '2026-10-22T12:00:00Z' }, monthly: { percent: 0, resetsAt: '2026-11-15T12:00:00Z' } } })
    const [placeholder, weekly] = mapGoUsage(body('2026-10-15T17:00:01Z'), now)
    expect(placeholder).not.toHaveProperty('resetsAt')
    // A weekly reset a full period out is a calendar instant, never a placeholder.
    expect(weekly).toHaveProperty('resetsAt', '2026-10-22T12:00:00.000Z')
    const [running] = mapGoUsage(body('2026-10-15T16:30:00Z'), now)
    expect(running).toHaveProperty('resetsAt', '2026-10-15T16:30:00.000Z')
  })

  it('judges the placeholder by the server clock when the Date header is present', () => {
    expect(referenceDate('Thu, 15 Oct 2026 12:00:00 GMT', new Date(0))).toEqual(now)
    expect(referenceDate('garbage', now)).toEqual(now)
    expect(referenceDate(undefined, now)).toEqual(now)
  })

  it('rejects a window without percent or reset', () => {
    expect(() => mapGoUsage('{"usage":{"rolling":{"percent":1}}}', now)).toThrow(expect.objectContaining({ category: 'decoding' }))
    expect(() => mapGoUsage('[]', now)).toThrow(expect.objectContaining({ category: 'decoding' }))
  })
})

describe('OpenCodeProvider', () => {
  it('sends the Go key as a Bearer token and labels the plan Go', async () => {
    const ctx = fakeContext({ now, files: { [AUTH]: goAuth('go-key') } })
    ctx.http.on((r) => r.url === USAGE_URL, () => ({ status: 200, headers: { date: 'Thu, 15 Oct 2026 12:00:00 GMT' }, text: fixtureText('usage.json') }))
    const snapshot = await new OpenCodeProvider().refresh(ctx)
    expect(snapshot.plan).toBe('Go')
    expect(snapshot.lines.map((line) => line.label)).toEqual(['Session', 'Weekly', 'Monthly'])
    expect(ctx.http.requests[0]?.headers?.Authorization).toBe('Bearer go-key')
  })

  it('tells a rejected key (401) from a key without Go (403 EntitlementError)', async () => {
    const rejected = fakeContext({ files: { [AUTH]: goAuth('k') } })
    rejected.http.on(() => true, () => json({ type: 'error', error: { type: 'AuthError', message: 'bad key' } }, 401))
    await expect(new OpenCodeProvider().refresh(rejected)).rejects.toMatchObject({ category: 'authInvalid', message: 'OpenCode Go key was rejected. Log into OpenCode Go again.' })

    const noGo = fakeContext({ files: { [AUTH]: goAuth('k') } })
    noGo.http.on(() => true, () => json({ type: 'error', error: { type: 'EntitlementError', message: 'no sub' } }, 403))
    await expect(new OpenCodeProvider().refresh(noGo)).rejects.toMatchObject({ category: 'notAvailable', message: 'No OpenCode Go subscription on this key.' })

    const forbidden = fakeContext({ files: { [AUTH]: goAuth('k') } })
    forbidden.http.on(() => true, () => ({ status: 403, headers: {}, text: '<html>Cloudflare</html>' }))
    await expect(new OpenCodeProvider().refresh(forbidden)).rejects.toMatchObject({ category: 'http4xx' })
  })

  it('asks for an OpenCode Go login when there is no key', async () => {
    await expect(new OpenCodeProvider().refresh(fakeContext())).rejects.toMatchObject({ category: 'notLoggedIn' })
    expect(await new OpenCodeProvider().hasLocalCredentials(fakeContext())).toBe(false)
  })
})
