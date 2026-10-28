import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeContext, json } from '../../../../tests/helpers/fakes'
import { ProviderError } from '../../errors'
import type { HttpRequest } from '../../http'
import { GROK_DEFAULT_CLIENT_ID, grokClientId, loadGrokCandidates, needsRefresh } from './auth'
import { CREDITS_CONFIG_URL, REFRESH_URL, SETTINGS_URL, TOKEN_AUTH_HEADER, requestGrokRefresh } from './client'
import { GrokProvider } from './index'
import { TEAM_BILLING_WARNING, decodeCreditsConfig, isTeamBillingUnavailable, mapCreditsConfig } from './mapper'

const fixtureText = (name: string) => readFileSync(path.join(__dirname, '../../../../tests/fixtures/grok', name), 'utf8')
const AUTH = 'C:\\Users\\ada\\.grok\\auth.json'
const now = new Date('2026-07-02T00:00:00Z')

const isCredits = (r: HttpRequest) => r.url === CREDITS_CONFIG_URL
const isSettings = (r: HttpRequest) => r.url === SETTINGS_URL
const isRefresh = (r: HttpRequest) => r.url === REFRESH_URL
const text = (body: string, status = 200) => ({ status, headers: {}, text: body })

function jwt(exp: number): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${part({ alg: 'none' })}.${part({ exp })}.signature`
}

function authFile(entry: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ 'https://auth.x.ai::client': entry, ...extra }, null, 2)
}

describe('Grok credits config', () => {
  it('maps the captured payload to the Weekly meter and a Disabled pay-as-you-go badge', () => {
    expect(mapCreditsConfig(text(fixtureText('credits.json')))).toEqual([
      {
        type: 'progress',
        label: 'Weekly limit',
        used: 99,
        limit: 100,
        format: { kind: 'percent' },
        resetsAt: '2026-07-07T21:36:52.140Z',
        periodDurationMs: 7 * 24 * 3_600_000
      },
      { type: 'badge', label: 'Pay as you go', text: 'Disabled', colorHex: '#a3a3a3' }
    ])
  })

  it('reads omitted proto3 zeros as 0 and shows an enabled cap', () => {
    const body = { config: { currentPeriod: { type: 'USAGE_PERIOD_TYPE_WEEKLY', start: '2026-07-01T00:00:00Z', end: '2026-07-08T00:00:00Z' }, onDemandCap: { val: 2500 } } }
    const lines = mapCreditsConfig(text(JSON.stringify(body)))
    expect(lines[0]).toMatchObject({ label: 'Weekly limit', used: 0 })
    expect(lines[1]).toEqual({ type: 'badge', label: 'Pay as you go', text: '2500 cap', colorHex: '#22c55e' })
  })

  it('leaves Weekly out for a monthly period', () => {
    const body = { config: { creditUsagePercent: 40, currentPeriod: { type: 'USAGE_PERIOD_TYPE_MONTHLY', start: '2026-07-01T00:00:00Z', end: '2026-08-01T00:00:00Z' } } }
    expect(mapCreditsConfig(text(JSON.stringify(body))).map((line) => line.label)).toEqual(['Pay as you go'])
  })

  it('treats schema drift as an invalid response, never 0%', () => {
    const period = { type: 'USAGE_PERIOD_TYPE_WEEKLY', start: '2026-07-01T00:00:00Z', end: '2026-07-08T00:00:00Z' }
    for (const config of [
      { currentPeriod: period, creditUsagePercent: 'lots' },
      { currentPeriod: period, onDemandCap: 5 },
      { currentPeriod: { ...period, end: '2026-06-01T00:00:00Z' } },
      { currentPeriod: { type: '', start: period.start, end: period.end } },
      {}
    ]) {
      expect(() => decodeCreditsConfig(JSON.stringify({ config })), JSON.stringify(config)).toThrow(expect.objectContaining({ message: 'Grok billing response changed.' }))
    }
  })

  it('recognizes only the "No personal team" 412', () => {
    expect(isTeamBillingUnavailable(text('{"error":"No personal team."}', 412))).toBe(true)
    expect(isTeamBillingUnavailable(text('{"error":"precondition failed"}', 412))).toBe(false)
    expect(isTeamBillingUnavailable(text('No personal team.', 412))).toBe(false)
    expect(isTeamBillingUnavailable(text('{"error":"No personal team."}', 403))).toBe(false)
  })
})

describe('Grok auth', () => {
  it('reads every keyed login from %USERPROFILE%\\.grok\\auth.json', async () => {
    const ctx = fakeContext({ files: { [AUTH]: authFile({ key: 'token', refresh_token: 'refresh' }, { other: { refresh_token: 'no key' } }) } })
    const candidates = await loadGrokCandidates(ctx)
    expect(candidates.map((c) => [c.entryKey, c.token])).toEqual([['https://auth.x.ai::client', 'token']])
    expect(grokClientId(candidates[0]!)).toBe('client')
  })

  it('distinguishes no login from an unusable one', async () => {
    await expect(loadGrokCandidates(fakeContext())).rejects.toMatchObject({ category: 'notLoggedIn' })
    await expect(loadGrokCandidates(fakeContext({ files: { [AUTH]: '{"x":{"refresh":"r"}}' } }))).rejects.toMatchObject({ category: 'authInvalid' })
  })

  it('picks the client id from the entry, then its key, then the CLI default', async () => {
    const ctx = fakeContext({ files: { [AUTH]: JSON.stringify({ a: { key: 't', oidc_client_id: 'oidc' }, 'https://auth.x.ai::': { key: 't' } }) } })
    const [withField, withoutSuffix] = await loadGrokCandidates(ctx)
    expect(grokClientId(withField!)).toBe('oidc')
    expect(grokClientId(withoutSuffix!)).toBe(GROK_DEFAULT_CLIENT_ID)
  })

  it('refreshes within five minutes of expiry by timestamp or JWT', async () => {
    const soon = jwt(now.getTime() / 1000 + 120)
    const later = jwt(now.getTime() / 1000 + 3600)
    const ctx = fakeContext({
      files: {
        [AUTH]: JSON.stringify({ a: { key: soon }, b: { key: later }, c: { key: later, expires_at: '2026-07-02T00:04:00.000Z' }, d: { key: 'opaque', expires: '2026-07-03T00:00:00Z' } })
      }
    })
    expect((await loadGrokCandidates(ctx)).map((c) => needsRefresh(c, now))).toEqual([true, false, true, false])
  })

  it('form-encodes reserved characters in the refresh body like the CLI', async () => {
    const ctx = fakeContext()
    ctx.http.on(isRefresh, () => json({}))
    await requestGrokRefresh(ctx, 'refresh token&=+/?%', 'client id&=+/?%')
    expect(ctx.http.requests[0]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&client_id=client%20id%26%3D%2B%2F%3F%25&refresh_token=refresh%20token%26%3D%2B%2F%3F%25'
    })
  })
})

describe('GrokProvider', () => {
  it('refreshes an expired token, writes back only token fields, and fetches usage', async () => {
    const ctx = fakeContext({
      now,
      files: {
        [AUTH]: authFile(
          { key: 'expired-token', refresh_token: 'refresh-token', oidc_client_id: 'client-id', expires_at: '2026-07-01T00:00:00.000Z', custom_field: 'keep-me' },
          { 'https://auth.x.ai::other': { key: 'other-token' } }
        )
      }
    })
    ctx.http
      .on(isRefresh, () => json({ access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600 }))
      .on(isCredits, () => text(fixtureText('credits.json')))
      .on(isSettings, () => text(fixtureText('settings.json')))

    const snapshot = await new GrokProvider().refresh(ctx)
    expect(snapshot.plan).toBe('SuperGrok Heavy')
    expect(snapshot.lines.map((line) => line.label)).toEqual(['Weekly limit', 'Pay as you go'])

    expect(ctx.http.requests.find(isRefresh)?.body).toBe('grant_type=refresh_token&client_id=client-id&refresh_token=refresh-token')
    const credits = ctx.http.requests.find(isCredits)
    expect(credits?.headers).toMatchObject({ Authorization: 'Bearer new-token', 'X-XAI-Token-Auth': TOKEN_AUTH_HEADER, 'User-Agent': 'AgentMaxx' })
    expect(ctx.http.requests.find(isSettings)?.headers?.Authorization).toBe('Bearer new-token')

    const saved = JSON.parse(ctx.fs.files.get(AUTH) ?? '{}')
    expect(saved['https://auth.x.ai::client']).toEqual({
      key: 'new-token',
      refresh_token: 'new-refresh',
      oidc_client_id: 'client-id',
      expires_at: '2026-07-02T01:00:00.000Z',
      custom_field: 'keep-me'
    })
    expect(saved['https://auth.x.ai::other']).toEqual({ key: 'other-token' })
  })

  it('retries the credits call once after a 401, with a refreshed token', async () => {
    const ctx = fakeContext({ now, files: { [AUTH]: authFile({ key: 'old-token', refresh_token: 'refresh' }) } })
    ctx.http
      .on((r) => isCredits(r) && r.headers?.Authorization === 'Bearer old-token', () => json({}, 401))
      .on(isRefresh, () => json({ access_token: 'new-token' }))
      .on(isCredits, () => text(fixtureText('credits.json')))
      .on(isSettings, () => json({}, 500))
    const snapshot = await new GrokProvider().refresh(ctx)
    expect(snapshot.lines).toHaveLength(2)
    expect(snapshot.plan).toBeUndefined()
    expect(ctx.http.requests.filter(isCredits)).toHaveLength(2)
  })

  it('reports an expired login when the retry is still unauthorized', async () => {
    const ctx = fakeContext({ now, files: { [AUTH]: authFile({ key: 'old', refresh_token: 'refresh' }) } })
    ctx.http.on(isCredits, () => json({}, 401)).on(isRefresh, () => json({ access_token: 'new' }))
    await expect(new GrokProvider().refresh(ctx)).rejects.toMatchObject({ category: 'authExpired', message: 'Grok auth expired. Run `grok login` again.' })
  })

  it('keeps the card for a team login with a warning instead of meters', async () => {
    const ctx = fakeContext({ now, files: { [AUTH]: authFile({ key: 'token' }) } })
    ctx.http.on(isCredits, () => text('{"error":"No personal team."}', 412)).on(isSettings, () => text(fixtureText('settings.json')))
    const snapshot = await new GrokProvider().refresh(ctx)
    expect(snapshot).toMatchObject({ lines: [], plan: 'SuperGrok Heavy', warning: TEAM_BILLING_WARNING })
  })

  it('fails on any other 412 and on a dropped connection', async () => {
    const other = fakeContext({ now, files: { [AUTH]: authFile({ key: 'token' }) } })
    other.http.on(isCredits, () => text('{"error":"precondition failed"}', 412))
    await expect(new GrokProvider().refresh(other)).rejects.toMatchObject({ category: 'http4xx', message: 'Grok billing request failed (HTTP 412). Try again later.' })

    const offline = fakeContext({ now, files: { [AUTH]: authFile({ key: 'token' }) } })
    offline.http.on(isCredits, () => {
      throw new ProviderError('network', 'Usage request failed. Check your connection.', 'ECONNRESET')
    })
    await expect(new GrokProvider().refresh(offline)).rejects.toMatchObject({ category: 'network', message: 'Grok billing request failed. Check your connection.' })
  })

  it('never overwrites a login the CLI rotated during the refresh', async () => {
    const ctx = fakeContext({ now, files: { [AUTH]: authFile({ key: jwt(now.getTime() / 1000 + 60), refresh_token: 'refresh' }) } })
    ctx.http
      .on(isRefresh, () => {
        // The CLI logs in again while our refresh is in flight.
        ctx.fs.files.set(AUTH, authFile({ key: 'cli-token', refresh_token: 'cli-refresh' }))
        return json({ access_token: 'ours', refresh_token: 'ours-refresh', expires_in: 3600 })
      })
      .on(isCredits, () => text(fixtureText('credits.json')))
      .on(isSettings, () => json({}))
    await new GrokProvider().refresh(ctx)
    expect(ctx.fs.writes).toEqual([])
    expect(JSON.parse(ctx.fs.files.get(AUTH) ?? '{}')['https://auth.x.ai::client'].key).toBe('cli-token')
  })

  it('moves past an expired login it cannot refresh', async () => {
    const expired = jwt(now.getTime() / 1000 - 60)
    const ctx = fakeContext({ now, files: { [AUTH]: JSON.stringify({ first: { key: expired }, second: { key: 'good' } }) } })
    ctx.http.on(isCredits, () => text(fixtureText('credits.json'))).on(isSettings, () => json({}))
    await new GrokProvider().refresh(ctx)
    expect(ctx.http.requests.find(isCredits)?.headers?.Authorization).toBe('Bearer good')

    const onlyExpired = fakeContext({ now, files: { [AUTH]: JSON.stringify({ first: { key: expired } }) } })
    await expect(new GrokProvider().refresh(onlyExpired)).rejects.toMatchObject({ category: 'authExpired' })
  })
})
