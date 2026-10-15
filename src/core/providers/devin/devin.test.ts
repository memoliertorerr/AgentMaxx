import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FakeSqlite, fakeContext, json } from '../../../../tests/helpers/fakes'
import { ProviderError } from '../../errors'
import type { HttpRequest } from '../../http'
import { cleanApiServerUrl, devinCredentialPaths, loadDevinCliAuth, readTomlString } from './auth'
import { DevinProvider } from './index'
import { mapUserStatus, mapUserStatusBody } from './mapper'

const fixtureText = (name: string) => readFileSync(path.join(__dirname, '../../../../tests/fixtures/devin', name), 'utf8')
const APPDATA_TOML = 'C:\\Users\\ada\\AppData\\Roaming\\devin\\credentials.toml'
const XDG_TOML = 'C:\\Users\\ada\\.local\\share\\devin\\credentials.toml'
const STATE_DB = 'C:\\Users\\ada\\AppData\\Roaming\\Devin\\User\\globalStorage\\state.vscdb'
const DEFAULT_URL = 'https://server.codeium.com/exa.seat_management_pb.SeatManagementService/GetUserStatus'
const isStatus = (r: HttpRequest) => r.url.endsWith('/GetUserStatus')
const keyOf = (r: HttpRequest | undefined) => (JSON.parse(r?.body ?? '{}') as { metadata?: { apiKey?: string } }).metadata?.apiKey

describe('Devin credentials', () => {
  it('reads the TOML keys it needs', () => {
    const toml = [
      '# Devin CLI',
      'windsurf_api_key = "sk-ws-01 \\"quoted\\""',
      "api_server_url = 'https://eu.server.codeium.com/' # regional",
      'bare = value # comment',
      'empty ='
    ].join('\r\n')
    expect(readTomlString(toml, 'windsurf_api_key')).toBe('sk-ws-01 \\"quoted\\"')
    expect(readTomlString(toml, 'api_server_url')).toBe('https://eu.server.codeium.com/')
    expect(readTomlString(toml, 'bare')).toBe('value')
    expect(readTomlString(toml, 'empty')).toBeUndefined()
    expect(readTomlString(toml, 'missing')).toBeUndefined()
  })

  it('only trusts an https API server', () => {
    expect(cleanApiServerUrl(' https://eu.server.codeium.com// ')).toBe('https://eu.server.codeium.com')
    expect(cleanApiServerUrl('http://evil.example')).toBeUndefined()
    expect(cleanApiServerUrl(undefined)).toBeUndefined()
  })

  it('checks %APPDATA% first, then the XDG path, then %LOCALAPPDATA%', async () => {
    const ctx = fakeContext()
    expect(devinCredentialPaths(ctx)).toEqual([APPDATA_TOML, XDG_TOML, 'C:\\Users\\ada\\AppData\\Local\\devin\\credentials.toml'])
    const both = fakeContext({ files: { [APPDATA_TOML]: 'windsurf_api_key = "appdata"', [XDG_TOML]: 'windsurf_api_key = "xdg"' } })
    expect(await loadDevinCliAuth(both)).toEqual({ apiKey: 'appdata', source: 'cli' })
    const xdgOnly = fakeContext({ files: { [XDG_TOML]: 'windsurf_api_key = "xdg"\napi_server_url = "https://x.example"' } })
    expect(await loadDevinCliAuth(xdgOnly)).toEqual({ apiKey: 'xdg', apiServerUrl: 'https://x.example', source: 'cli' })
  })
})

describe('Devin GetUserStatus mapping', () => {
  it('flips remaining to used for Daily and Weekly and converts the micros balance', () => {
    expect(mapUserStatusBody(fixtureText('user-status.json'))).toEqual({
      plan: 'Pro',
      lines: [
        { type: 'progress', label: 'Daily quota', used: 36, limit: 100, format: { kind: 'percent' }, periodDurationMs: 86_400_000, resetsAt: '2026-10-16T00:00:00.000Z' },
        { type: 'progress', label: 'Weekly quota', used: 17.5, limit: 100, format: { kind: 'percent' }, periodDurationMs: 604_800_000, resetsAt: '2026-10-19T00:00:00.000Z' },
        { type: 'values', label: 'Extra usage balance', values: [{ number: 12.5, kind: 'dollars' }] }
      ]
    })
  })

  it('reads a weekly reset without a percentage as an exhausted week', () => {
    const { lines } = mapUserStatus({ planStatus: { weeklyQuotaResetAtUnix: 1792368000 } })
    expect(lines).toEqual([{ type: 'progress', label: 'Weekly quota', used: 100, limit: 100, format: { kind: 'percent' }, periodDurationMs: 604_800_000, resetsAt: '2026-10-19T00:00:00.000Z' }])
  })

  it('falls back to the hidden daily quota for Weekly when there is no weekly figure', () => {
    const { plan, lines } = mapUserStatus({ planStatus: { planInfo: { hideDailyQuota: true }, dailyQuotaRemainingPercent: 70, dailyQuotaResetAtUnix: 1792108800 } })
    expect(plan).toBe('Unknown')
    expect(lines).toEqual([{ type: 'progress', label: 'Weekly quota', used: 30, limit: 100, format: { kind: 'percent' }, periodDurationMs: 604_800_000 }])
  })

  it('keeps a zero balance and rejects drift or an empty status', () => {
    expect(mapUserStatus({ planStatus: { overageBalanceMicros: 0 } }).lines).toEqual([{ type: 'values', label: 'Extra usage balance', values: [{ number: 0, kind: 'dollars' }] }])
    expect(() => mapUserStatus({ planStatus: { weeklyQuotaRemainingPercent: 'n/a', weeklyQuotaResetAtUnix: 1792368000 } })).toThrow(expect.objectContaining({ category: 'decoding' }))
    expect(() => mapUserStatus({})).toThrow(expect.objectContaining({ category: 'notAvailable' }))
    expect(() => mapUserStatusBody('{}')).toThrow(expect.objectContaining({ category: 'decoding' }))
  })
})

describe('DevinProvider', () => {
  it('posts the CLI key to the default server over Connect', async () => {
    const ctx = fakeContext({ files: { [APPDATA_TOML]: 'windsurf_api_key = "cli-key"' } })
    ctx.http.on(isStatus, () => ({ status: 200, headers: {}, text: fixtureText('user-status.json') }))
    const snapshot = await new DevinProvider().refresh(ctx)
    expect(snapshot.plan).toBe('Pro')
    expect(ctx.http.requests[0]).toMatchObject({ url: DEFAULT_URL, method: 'POST', headers: { 'Connect-Protocol-Version': '1' } })
    expect(JSON.parse(ctx.http.requests[0]?.body ?? '{}')).toEqual({
      metadata: { apiKey: 'cli-key', ideName: 'devin', ideVersion: '1.108.2', extensionName: 'devin', extensionVersion: '1.108.2', locale: 'en' }
    })
  })

  it('switches to the app login when the CLI key is rejected', async () => {
    const sqlite = new FakeSqlite({ [STATE_DB]: { ItemTable: { windsurfAuthStatus: JSON.stringify({ apiKey: 'app-key' }) } } })
    const ctx = fakeContext({ sqlite, files: { [APPDATA_TOML]: 'windsurf_api_key = "cli-key"' } })
    ctx.http.on((r) => keyOf(r) === 'cli-key', () => json({}, 401)).on(isStatus, () => ({ status: 200, headers: {}, text: fixtureText('user-status.json') }))
    await new DevinProvider().refresh(ctx)
    expect(ctx.http.requests.map(keyOf)).toEqual(['cli-key', 'app-key'])
  })

  it('does not retry the same key from the app', async () => {
    const sqlite = new FakeSqlite({ [STATE_DB]: { ItemTable: { windsurfAuthStatus: JSON.stringify({ apiKey: 'same' }) } } })
    const ctx = fakeContext({ sqlite, files: { [APPDATA_TOML]: 'windsurf_api_key = "same"' } })
    ctx.http.on(isStatus, () => json({}, 403))
    await expect(new DevinProvider().refresh(ctx)).rejects.toMatchObject({ category: 'notLoggedIn' })
    expect(ctx.http.requests).toHaveLength(1)
  })

  it('reports not logged in, unavailable quota, and connection failures', async () => {
    await expect(new DevinProvider().refresh(fakeContext())).rejects.toMatchObject({ category: 'notLoggedIn', message: 'Run devin auth login or sign in to Devin and try again.' })
    expect(await new DevinProvider().hasLocalCredentials(fakeContext())).toBe(false)

    const failing = fakeContext({ files: { [APPDATA_TOML]: 'windsurf_api_key = "k"' } })
    failing.http.on(isStatus, () => json({}, 500))
    await expect(new DevinProvider().refresh(failing)).rejects.toMatchObject({ category: 'notAvailable', message: 'Devin quota data unavailable. Try again later.' })

    const offline = fakeContext({ files: { [APPDATA_TOML]: 'windsurf_api_key = "k"' } })
    offline.http.on(isStatus, () => {
      throw new ProviderError('network', 'Usage request failed. Check your connection.', 'ECONNREFUSED')
    })
    await expect(new DevinProvider().refresh(offline)).rejects.toMatchObject({ category: 'network' })
  })
})
