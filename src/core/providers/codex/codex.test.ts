import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FakeHttp, fakeContext, json } from '../../../../tests/helpers/fakes'
import type { HttpRequest } from '../../http'
import { codexHomes, loadCodexCredentials, needsRefresh } from './auth'
import { CodexProvider } from './index'
import { formatCodexPlan, mapCodexUsage } from './mapper'

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, '../../../../tests/fixtures/codex', name), 'utf8')) as Record<string, unknown>

const AUTH = 'C:\\Users\\ada\\.codex\\auth.json'
const now = new Date('2026-10-15T12:00:00Z')

function jwt(payload: Record<string, unknown>): string {
  return `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`
}

function authFile(tokens: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ OPENAI_API_KEY: null, tokens, last_refresh: '2026-10-15T10:00:00Z', ...extra })
}

const isUsage = (r: HttpRequest) => r.url === 'https://chatgpt.com/backend-api/wham/usage'
const isRefresh = (r: HttpRequest) => r.url === 'https://auth.openai.com/oauth/token'

describe('mapCodexUsage', () => {
  it('maps windows, Spark, reset credits, credits, and plan', () => {
    const mapped = mapCodexUsage(fixture('usage.json'), {}, now)
    expect(mapped.plan).toBe('Pro 100')
    expect(mapped.lines).toEqual([
      { type: 'progress', label: 'Session', used: 10, limit: 100, format: { kind: 'percent' }, periodDurationMs: 18_000_000, resetsAt: '2026-10-15T13:00:00.000Z' },
      { type: 'progress', label: 'Weekly', used: 20, limit: 100, format: { kind: 'percent' }, periodDurationMs: 604_800_000, resetsAt: '2025-10-20T12:00:00.000Z' },
      { type: 'progress', label: 'Spark', used: 25, limit: 100, format: { kind: 'percent' }, periodDurationMs: 18_000_000, resetsAt: '2026-10-15T12:01:00.000Z' },
      { type: 'progress', label: 'Spark Weekly', used: 40, limit: 100, format: { kind: 'percent' }, periodDurationMs: 604_800_000, resetsAt: '2026-10-15T12:02:00.000Z' },
      { type: 'values', label: 'Rate Limit Resets', values: [{ number: 2, kind: 'count', label: 'available' }] },
      { type: 'values', label: 'Credits', values: [{ number: 32.84, kind: 'dollars' }, { number: 821, kind: 'count', label: 'credits' }] }
    ])
  })

  it('classifies a sole weekly window in the primary slot as Weekly', () => {
    const mapped = mapCodexUsage(
      { rate_limit: { primary_window: { used_percent: 5, limit_window_seconds: 604800, reset_after_seconds: 60 }, secondary_window: null } },
      {},
      now
    )
    expect(mapped.lines.map((line) => line.label)).toEqual(['Weekly'])
  })

  it('falls back to slot order for unfamiliar durations', () => {
    const mapped = mapCodexUsage(
      { rate_limit: { primary_window: { used_percent: 11, limit_window_seconds: 86400 }, secondary_window: { used_percent: 22, limit_window_seconds: 2592000 } } },
      {},
      now
    )
    expect(mapped.lines).toMatchObject([
      { label: 'Session', used: 11, periodDurationMs: 86_400_000 },
      { label: 'Weekly', used: 22, periodDurationMs: 2_592_000_000 }
    ])
  })

  it('fills missing percents from response headers', () => {
    const mapped = mapCodexUsage({}, { 'x-codex-primary-used-percent': '33', 'x-codex-credits-balance': '10' }, now)
    expect(mapped.lines).toMatchObject([
      { label: 'Session', used: 33 },
      { label: 'Credits', values: [{ number: 0.4 }, { number: 10 }] }
    ])
  })

  it('reads an exhausted balance as a real zero', () => {
    const mapped = mapCodexUsage({ credits: { has_credits: false } }, {}, now)
    expect(mapped.lines).toEqual([{ type: 'values', label: 'Credits', values: [{ number: 0, kind: 'dollars' }, { number: 0, kind: 'count', label: 'credits' }] }])
  })

  it('names plans like upstream', () => {
    expect(formatCodexPlan('pro')).toBe('Pro 200')
    expect(formatCodexPlan('promax')).toBe('Pro 500')
    expect(formatCodexPlan('self_serve_business_prolite')).toBe('Business Premium')
    expect(formatCodexPlan('team')).toBe('Team')
    expect(formatCodexPlan('')).toBeUndefined()
  })
})

describe('Codex credentials', () => {
  it('looks in ~/.config/codex then ~/.codex, or only $CODEX_HOME', () => {
    expect(codexHomes(fakeContext())).toEqual(['C:\\Users\\ada\\.config\\codex', 'C:\\Users\\ada\\.codex'])
    expect(codexHomes(fakeContext({ env: { USERPROFILE: 'C:\\Users\\ada', CODEX_HOME: 'E:\\codex' } }))).toEqual(['E:\\codex'])
  })

  it('reads auth.json tokens', async () => {
    const ctx = fakeContext({ files: { [AUTH]: authFile({ access_token: 'a', refresh_token: 'r', account_id: 'acct' }) } })
    const [credential] = await loadCodexCredentials(ctx)
    expect(credential?.tokens).toEqual({ accessToken: 'a', refreshToken: 'r', accountId: 'acct' })
  })

  it('refreshes near the JWT expiry, else after eight days', () => {
    expect(needsRefresh({ tokens: { accessToken: jwt({ exp: now.getTime() / 1000 + 120 }) } }, now)).toBe(true)
    expect(needsRefresh({ tokens: { accessToken: jwt({ exp: now.getTime() / 1000 + 3600 }) } }, now)).toBe(false)
    expect(needsRefresh({ tokens: { accessToken: 'opaque' }, lastRefresh: '2026-10-01T00:00:00Z' }, now)).toBe(true)
    expect(needsRefresh({ tokens: { accessToken: 'opaque' } }, now)).toBe(false)
  })
})

describe('CodexProvider.refresh', () => {
  it('fetches usage with the account header', async () => {
    const http = new FakeHttp().on(isUsage, () => json(fixture('usage.json')))
    const ctx = fakeContext({ now, http, files: { [AUTH]: authFile({ access_token: 'a', account_id: 'acct-1' }) } })
    const snapshot = await new CodexProvider().refresh(ctx)
    expect(snapshot.plan).toBe('Pro 100')
    expect(ctx.http.requests[0]?.headers).toMatchObject({ Authorization: 'Bearer a', 'ChatGPT-Account-Id': 'acct-1' })
  })

  it('refreshes after a 401, retries, and writes the rotation back preserving other fields', async () => {
    let calls = 0
    const http = new FakeHttp()
      .on(isUsage, () => (++calls === 1 ? json({}, 401) : json(fixture('usage.json'))))
      .on(isRefresh, () => json({ access_token: 'new-a', refresh_token: 'new-r', id_token: 'new-id' }))
    const ctx = fakeContext({
      now,
      http,
      files: { [AUTH]: authFile({ access_token: 'old-a', refresh_token: 'old-r', account_id: 'acct' }, { custom_field: 7 }) }
    })
    await new CodexProvider().refresh(ctx)

    const form = new URLSearchParams(ctx.http.requests.find(isRefresh)?.body ?? '')
    expect(Object.fromEntries(form)).toEqual({ grant_type: 'refresh_token', client_id: 'app_EMoamEEZ73f0CkXaXp7hrann', refresh_token: 'old-r' })
    expect(ctx.http.requests.filter(isUsage).map((r) => r.headers?.Authorization)).toEqual(['Bearer old-a', 'Bearer new-a'])
    expect(JSON.parse(ctx.fs.files.get(AUTH) ?? '{}')).toEqual({
      OPENAI_API_KEY: null,
      tokens: { access_token: 'new-a', refresh_token: 'new-r', id_token: 'new-id', account_id: 'acct' },
      last_refresh: now.toISOString(),
      custom_field: 7
    })
  })

  it('never overwrites a login Codex rotated while the refresh was in flight', async () => {
    const ctx = fakeContext({ now, files: { [AUTH]: authFile({ access_token: 'a', refresh_token: 'r' }) } })
    ctx.http.on(isUsage, () => json({}, 401)).on(isRefresh, () => {
      ctx.fs.files.set(AUTH, authFile({ access_token: 'cli-a', refresh_token: 'cli-r' }))
      return json({ access_token: 'ours' })
    })
    await expect(new CodexProvider().refresh(ctx)).rejects.toMatchObject({ category: 'authExpired', message: 'Token conflict. Run `codex` to log in again.' })
    expect(JSON.parse(ctx.fs.files.get(AUTH) ?? '{}').tokens.access_token).toBe('cli-a')
  })

  it('maps refresh error codes', async () => {
    const ctx = fakeContext({ now, files: { [AUTH]: authFile({ access_token: 'a', refresh_token: 'r' }) } })
    ctx.http.on(isUsage, () => json({}, 401)).on(isRefresh, () => json({ error: { code: 'refresh_token_expired' } }, 401))
    await expect(new CodexProvider().refresh(ctx)).rejects.toMatchObject({ message: 'Session expired. Run `codex` to log in again.' })
  })

  it('explains that an API key can’t read subscription usage', async () => {
    const ctx = fakeContext({ files: { [AUTH]: JSON.stringify({ OPENAI_API_KEY: 'sk-test', tokens: null }) } })
    await expect(new CodexProvider().refresh(ctx)).rejects.toMatchObject({ category: 'notAvailable' })
  })

  it('says "not logged in" without auth.json', async () => {
    await expect(new CodexProvider().refresh(fakeContext())).rejects.toMatchObject({ category: 'notLoggedIn' })
  })
})
