import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FakeHttp, FakeSqlite, fakeContext, json, type FakeContext } from '../../../tests/helpers/fakes'
import type { HttpRequest, HttpResponse } from '../http'
import type { ProviderRuntime } from '../runtime'
import { ClaudeProvider } from './claude'
import { CodexProvider } from './codex'
import { CursorProvider } from './cursor'
import { GrokProvider } from './grok'

// Read-only Logins (UM10.1): with `allowTokenRefresh: false`, a provider never calls its refresh
// endpoint and never writes a credential file. An expired login, or a 401, shows the provider's
// re-login hint; a token that's only expiring is still tried once as is.

const now = new Date('2026-10-15T12:00:00Z')
const seconds = (offset: number) => now.getTime() / 1000 + offset
const fixture = (dir: string, name: string) => readFileSync(path.join(__dirname, '../../../tests/fixtures', dir, name), 'utf8')
const ok = (text: string): HttpResponse => ({ status: 200, headers: {}, text })

function jwt(payload: Record<string, unknown>): string {
  return `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`
}

interface Case {
  name: string
  provider: () => ProviderRuntime
  hint: string
  isRefresh: (request: HttpRequest) => boolean
  isUsage: (request: HttpRequest) => boolean
  /** A context whose stored login expires `expiresIn` seconds from now. */
  context: (expiresIn: number, http: FakeHttp) => FakeContext
  /** Answers every request a successful refresh makes. */
  api: () => FakeHttp
}

const CLAUDE_FILE = 'C:\\Users\\ada\\.claude\\.credentials.json'
const CODEX_FILE = 'C:\\Users\\ada\\.codex\\auth.json'
const CURSOR_DB = 'C:\\Users\\ada\\AppData\\Roaming\\Cursor\\User\\globalStorage\\state.vscdb'
const GROK_FILE = 'C:\\Users\\ada\\.grok\\auth.json'

const cases: Case[] = [
  {
    name: 'Claude',
    provider: () => new ClaudeProvider(),
    hint: 'Login expired. Run `claude` to sign in again, then refresh.',
    isRefresh: (r) => r.url === 'https://platform.claude.com/v1/oauth/token',
    isUsage: (r) => r.url === 'https://api.anthropic.com/api/oauth/usage',
    context: (expiresIn, http) =>
      fakeContext({
        now,
        http,
        allowTokenRefresh: false,
        files: { [CLAUDE_FILE]: JSON.stringify({ claudeAiOauth: { accessToken: 'a', refreshToken: 'r', expiresAt: now.getTime() + expiresIn * 1000 } }) }
      }),
    api: () =>
      new FakeHttp()
        .on((r) => r.url.endsWith('/api/oauth/usage'), () => ok(fixture('claude', 'usage.json')))
        .on((r) => r.url.endsWith('/api/oauth/profile'), () => ok(fixture('claude', 'profile.json')))
  },
  {
    name: 'Codex',
    provider: () => new CodexProvider(),
    hint: 'Login expired. Run `codex` to sign in again, then refresh.',
    isRefresh: (r) => r.url === 'https://auth.openai.com/oauth/token',
    isUsage: (r) => r.url === 'https://chatgpt.com/backend-api/wham/usage',
    context: (expiresIn, http) =>
      fakeContext({
        now,
        http,
        allowTokenRefresh: false,
        files: {
          [CODEX_FILE]: JSON.stringify({ tokens: { access_token: jwt({ exp: seconds(expiresIn) }), refresh_token: 'r', account_id: 'acct' }, last_refresh: '2026-10-15T10:00:00Z' })
        }
      }),
    api: () => new FakeHttp().on((r) => r.url === 'https://chatgpt.com/backend-api/wham/usage', () => ok(fixture('codex', 'usage.json')))
  },
  {
    name: 'Cursor',
    provider: () => new CursorProvider(),
    hint: 'Login expired. Open Cursor to renew it, then refresh.',
    isRefresh: (r) => r.url === 'https://api2.cursor.sh/oauth/token',
    isUsage: (r) => r.url.endsWith('/GetCurrentPeriodUsage'),
    context: (expiresIn, http) =>
      fakeContext({
        now,
        http,
        allowTokenRefresh: false,
        sqlite: new FakeSqlite({
          [CURSOR_DB]: { ItemTable: { 'cursorAuth/accessToken': jwt({ sub: 'auth0|user_1', exp: seconds(expiresIn) }), 'cursorAuth/refreshToken': 'r' } }
        })
      }),
    api: () =>
      new FakeHttp()
        .on((r) => r.url.endsWith('/GetCurrentPeriodUsage'), () =>
          json({ billingCycleStart: '1769913600000', billingCycleEnd: '1772592000000', planUsage: { totalPercentUsed: 10 }, enabled: true })
        )
        .on(() => true, () => json({}, 404))
  },
  {
    name: 'Grok',
    provider: () => new GrokProvider(),
    hint: 'Login expired. Run `grok login` to sign in again, then refresh.',
    isRefresh: (r) => r.url === 'https://auth.x.ai/oauth2/token',
    isUsage: (r) => r.url.startsWith('https://cli-chat-proxy.grok.com/v1/billing'),
    context: (expiresIn, http) =>
      fakeContext({
        now,
        http,
        allowTokenRefresh: false,
        files: { [GROK_FILE]: JSON.stringify({ 'https://auth.x.ai::client': { key: jwt({ exp: seconds(expiresIn) }), refresh_token: 'r' } }) }
      }),
    api: () =>
      new FakeHttp()
        .on((r) => r.url.startsWith('https://cli-chat-proxy.grok.com/v1/billing'), () => ok(fixture('grok', 'credits.json')))
        .on((r) => r.url.endsWith('/v1/settings'), () => ok(fixture('grok', 'settings.json')))
  }
]

describe.each(cases)('$name with Read-only Logins', (c) => {
  it('shows the re-login hint for an expired login without refreshing or writing', async () => {
    const ctx = c.context(-60, c.api())
    await expect(c.provider().refresh(ctx)).rejects.toMatchObject({ category: 'authExpired', message: c.hint })
    expect(ctx.http.requests.filter(c.isRefresh)).toEqual([])
    expect(ctx.fs.writes).toEqual([])
  })

  it('still tries a token that is expiring but not expired, once, as is', async () => {
    const ctx = c.context(120, c.api())
    const snapshot = await c.provider().refresh(ctx)
    expect(snapshot.lines.length).toBeGreaterThan(0)
    expect(ctx.http.requests.filter(c.isUsage)).toHaveLength(1)
    expect(ctx.http.requests.filter(c.isRefresh)).toEqual([])
    expect(ctx.fs.writes).toEqual([])
  })

  it('answers a 401 with the hint instead of refreshing', async () => {
    const http = new FakeHttp().on(c.isUsage, () => json({}, 401)).on(() => true, () => json({ access_token: 'must-not-be-used' }))
    const ctx = c.context(3600, http)
    await expect(c.provider().refresh(ctx)).rejects.toMatchObject({ category: 'authExpired', message: c.hint })
    expect(ctx.http.requests.filter(c.isUsage)).toHaveLength(1)
    expect(ctx.http.requests.filter(c.isRefresh)).toEqual([])
    expect(ctx.fs.writes).toEqual([])
  })
})
