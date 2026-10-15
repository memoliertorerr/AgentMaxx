import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FakeHttp, fakeContext, json } from '../../../../tests/helpers/fakes'
import { ProviderError } from '../../errors'
import type { HttpRequest } from '../../http'
import { claudeCredentialsPath, loadClaudeCredentials } from './auth'
import { ClaudeProvider } from './index'
import { formatClaudePlan, formatLivePlan, mapClaudeUsage } from './mapper'

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, '../../../../tests/fixtures/claude', name), 'utf8')) as Record<string, unknown>

const CREDENTIALS = 'C:\\Users\\ada\\.claude\\.credentials.json'
const now = new Date('2026-10-15T12:00:00Z')

function credentialsFile(oauth: Record<string, unknown>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ claudeAiOauth: oauth, ...extra })
}

const isUsage = (r: HttpRequest) => r.url === 'https://api.anthropic.com/api/oauth/usage'
const isProfile = (r: HttpRequest) => r.url === 'https://api.anthropic.com/api/oauth/profile'
const isRefresh = (r: HttpRequest) => r.url === 'https://platform.claude.com/v1/oauth/token'

describe('mapClaudeUsage', () => {
  it('maps every window, the scoped Fable limit, and capped extra usage', () => {
    const mapped = mapClaudeUsage(fixture('usage.json'), { subscriptionType: 'max', rateLimitTier: 'claude_max_subscription_20x' })
    expect(mapped.plan).toBe('Max 20x')
    expect(mapped.lines).toEqual([
      { type: 'progress', label: 'Session', used: 10, limit: 100, format: { kind: 'percent' }, periodDurationMs: 18_000_000, resetsAt: '2026-10-15T14:00:00.000Z' },
      { type: 'progress', label: 'Weekly', used: 20, limit: 100, format: { kind: 'percent' }, periodDurationMs: 604_800_000, resetsAt: '2026-10-19T00:00:00.000Z' },
      { type: 'progress', label: 'Sonnet', used: 5, limit: 100, format: { kind: 'percent' }, periodDurationMs: 604_800_000, resetsAt: '2026-10-19T00:00:00.000Z' },
      { type: 'progress', label: 'Fable', used: 7, limit: 100, format: { kind: 'percent' }, periodDurationMs: 604_800_000, resetsAt: '2026-10-19T00:00:00.000Z' },
      { type: 'progress', label: 'Extra usage spent', used: 5, limit: 10, format: { kind: 'dollars' } }
    ])
  })

  it('shows uncapped extra usage as a plain amount', () => {
    const mapped = mapClaudeUsage({ extra_usage: { is_enabled: true, used_credits: 123456 } }, {})
    expect(mapped.lines).toEqual([{ type: 'values', label: 'Extra usage spent', values: [{ number: 1234.56, kind: 'dollars' }] }])
  })

  it('leaves the reset off a session that has not started', () => {
    const [session] = mapClaudeUsage({ five_hour: { utilization: 0, resets_at: null } }, {}).lines
    expect(session).toMatchObject({ label: 'Session', used: 0 })
    expect(session).not.toHaveProperty('resetsAt')
  })

  it('reads epoch seconds and milliseconds resets', () => {
    for (const value of [1_760_536_800, 1_760_536_800_000]) {
      const [line] = mapClaudeUsage({ five_hour: { utilization: 1, resets_at: value } }, {}).lines
      expect(line).toMatchObject({ resetsAt: '2025-10-15T14:00:00.000Z' })
    }
  })

  it('formats plans like upstream', () => {
    expect(formatClaudePlan('pro', undefined)).toBe('Pro')
    expect(formatClaudePlan('max', 'default_claude_max_5x')).toBe('Max 5x')
    expect(formatClaudePlan(undefined, 'x')).toBeUndefined()
    expect(formatLivePlan(fixture('profile.json'), { subscriptionType: 'pro' })).toBe('Max 20x')
    expect(formatLivePlan({ account: { uuid: 'a' } }, {})).toBeUndefined()
  })
})

describe('Claude credentials', () => {
  it('reads %USERPROFILE%\\.claude\\.credentials.json', async () => {
    const ctx = fakeContext({ files: { [CREDENTIALS]: credentialsFile({ accessToken: 'file-token' }) } })
    expect(claudeCredentialsPath(ctx)).toBe(CREDENTIALS)
    expect((await loadClaudeCredentials(ctx)).map((c) => [c.source, c.oauth.accessToken])).toEqual([['file', 'file-token']])
  })

  it('honors CLAUDE_CONFIG_DIR', async () => {
    const ctx = fakeContext({
      env: { USERPROFILE: 'C:\\Users\\ada', CLAUDE_CONFIG_DIR: 'D:\\claude-work' },
      files: { 'D:\\claude-work\\.credentials.json': credentialsFile({ accessToken: 'work' }) }
    })
    expect((await loadClaudeCredentials(ctx))[0]?.oauth.accessToken).toBe('work')
  })

  it('keeps CLAUDE_CODE_OAUTH_TOKEN behind a login that can read usage', async () => {
    const ctx = fakeContext({
      env: { USERPROFILE: 'C:\\Users\\ada', CLAUDE_CODE_OAUTH_TOKEN: 'env-token' },
      files: { [CREDENTIALS]: credentialsFile({ accessToken: 'file-token', scopes: ['user:inference', 'user:profile'] }) }
    })
    expect((await loadClaudeCredentials(ctx)).map((c) => [c.source, c.inferenceOnly])).toEqual([
      ['file', false],
      ['environment', true]
    ])
  })

  it('uses the environment token alone in a headless setup', async () => {
    const ctx = fakeContext({ env: { USERPROFILE: 'C:\\Users\\ada', CLAUDE_CODE_OAUTH_TOKEN: 'env-token' } })
    expect((await loadClaudeCredentials(ctx)).map((c) => c.source)).toEqual(['environment'])
  })

  it('reports an unreadable credentials file instead of "not logged in"', async () => {
    const ctx = fakeContext({ files: { [CREDENTIALS]: '{}' } })
    ctx.fs.unreadable.add(CREDENTIALS)
    await expect(loadClaudeCredentials(ctx)).rejects.toMatchObject({ category: 'credentialAccess' })
  })
})

describe('ClaudeProvider.refresh', () => {
  function usageOk(http: FakeHttp): FakeHttp {
    return http.on(isUsage, () => json(fixture('usage.json'))).on(isProfile, () => json(fixture('profile.json')))
  }

  it('fetches usage and the live plan', async () => {
    const ctx = fakeContext({
      now,
      http: usageOk(new FakeHttp()),
      files: { [CREDENTIALS]: credentialsFile({ accessToken: 'token', subscriptionType: 'pro', scopes: ['user:profile'] }) }
    })
    const snapshot = await new ClaudeProvider().refresh(ctx)
    expect(snapshot.plan).toBe('Max 20x')
    expect(snapshot.lines.map((line) => line.label)).toEqual(['Session', 'Weekly', 'Sonnet', 'Fable', 'Extra usage spent'])
    const usageRequest = ctx.http.requests.find(isUsage)
    expect(usageRequest?.headers).toMatchObject({ Authorization: 'Bearer token', 'anthropic-beta': 'oauth-2025-04-20' })
  })

  it('looks the live plan up once per access token', async () => {
    const provider = new ClaudeProvider()
    const ctx = fakeContext({ now, http: usageOk(new FakeHttp()), files: { [CREDENTIALS]: credentialsFile({ accessToken: 'token' }) } })
    await provider.refresh(ctx)
    await provider.refresh(ctx)
    expect(ctx.http.requests.filter(isProfile)).toHaveLength(1)
    expect(ctx.http.requests.filter(isUsage)).toHaveLength(2)
  })

  it('refreshes an expiring token and writes back only the token fields', async () => {
    const http = usageOk(new FakeHttp()).on(isRefresh, () => json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }))
    const original = credentialsFile(
      { accessToken: 'old-access', refreshToken: 'old-refresh', expiresAt: now.getTime() + 60_000, subscriptionType: 'max', scopes: ['user:profile'] },
      { mcpOAuth: { server: { accessToken: 'mcp' } } }
    )
    const ctx = fakeContext({ now, http, files: { [CREDENTIALS]: original } })
    await new ClaudeProvider().refresh(ctx)

    const refreshBody = JSON.parse(ctx.http.requests.find(isRefresh)?.body ?? '{}') as Record<string, unknown>
    expect(refreshBody).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'old-refresh', client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e' })
    expect(ctx.http.requests.find(isUsage)?.headers?.Authorization).toBe('Bearer new-access')
    const written = JSON.parse(ctx.fs.files.get(CREDENTIALS) ?? '{}')
    expect(written).toEqual({
      claudeAiOauth: {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresAt: now.getTime() + 3_600_000,
        subscriptionType: 'max',
        scopes: ['user:profile']
      },
      mcpOAuth: { server: { accessToken: 'mcp' } }
    })
  })

  it('refreshes and retries once after a 401', async () => {
    let calls = 0
    const http = new FakeHttp()
      .on(isUsage, () => (++calls === 1 ? json({}, 401) : json(fixture('usage.json'))))
      .on(isProfile, () => json({}))
      .on(isRefresh, () => json({ access_token: 'fresh' }))
    const ctx = fakeContext({ now, http, files: { [CREDENTIALS]: credentialsFile({ accessToken: 'stale', refreshToken: 'r' }) } })
    const snapshot = await new ClaudeProvider().refresh(ctx)
    expect(snapshot.lines).toHaveLength(5)
    expect(ctx.http.requests.filter(isUsage).map((r) => r.headers?.Authorization)).toEqual(['Bearer stale', 'Bearer fresh'])
  })

  it('reports an expired session on invalid_grant', async () => {
    const http = new FakeHttp().on(isUsage, () => json({}, 401)).on(isRefresh, () => json({ error: 'invalid_grant' }, 400))
    const ctx = fakeContext({ now, http, files: { [CREDENTIALS]: credentialsFile({ accessToken: 'a', refreshToken: 'r' }) } })
    await expect(new ClaudeProvider().refresh(ctx)).rejects.toMatchObject({
      category: 'authExpired',
      message: 'Session expired. Run `claude` to log in again.'
    })
  })

  it('serves the last good usage with a warning while rate limited', async () => {
    let limited = false
    const http = new FakeHttp()
      .on(isUsage, () => (limited ? json({}, 429, { 'retry-after': '120' }) : json(fixture('usage.json'))))
      .on(isProfile, () => json({}))
    const provider = new ClaudeProvider()
    const ctx = fakeContext({ now, http, files: { [CREDENTIALS]: credentialsFile({ accessToken: 'a' }) } })

    await provider.refresh(ctx)
    limited = true
    const snapshot = await provider.refresh(ctx)
    expect(snapshot.lines).toHaveLength(5)
    expect(snapshot.warning).toBe('Updates blocked by Anthropic. Be patient — manual refreshes will make it worse. Retrying in ~2m.')

    // Inside the cooldown the endpoint isn't called again.
    const before = ctx.http.requests.filter(isUsage).length
    await provider.refresh(ctx)
    expect(ctx.http.requests.filter(isUsage).length).toBe(before)
  })

  it('fails as rate limited when there is no earlier usage to show', async () => {
    const ctx = fakeContext({ now, http: new FakeHttp().on(isUsage, () => json({}, 429)), files: { [CREDENTIALS]: credentialsFile({ accessToken: 'a' }) } })
    await expect(new ClaudeProvider().refresh(ctx)).rejects.toMatchObject({ category: 'rateLimited' })
  })

  it('says "not logged in" without credentials', async () => {
    const error = await new ClaudeProvider().refresh(fakeContext({ now })).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProviderError)
    expect(error).toMatchObject({ category: 'notLoggedIn', message: 'Not logged in. Run `claude` to authenticate.' })
  })

  it('asks for a re-login when the token lacks the user:profile scope', async () => {
    const ctx = fakeContext({ now, files: { [CREDENTIALS]: credentialsFile({ accessToken: 'a', subscriptionType: 'pro', scopes: ['user:inference'] }) } })
    const snapshot = await new ClaudeProvider().refresh(ctx)
    expect(snapshot).toMatchObject({ plan: 'Pro', lines: [] })
    expect(snapshot.warning).toMatch(/^Re-login for live usage/)
    expect(ctx.http.requests).toHaveLength(0)
  })

  it('explains that an environment token alone can’t read usage', async () => {
    const ctx = fakeContext({ now, env: { USERPROFILE: 'C:\\Users\\ada', CLAUDE_CODE_OAUTH_TOKEN: 'env' } })
    const snapshot = await new ClaudeProvider().refresh(ctx)
    expect(snapshot.warning).toMatch(/CLAUDE_CODE_OAUTH_TOKEN/)
  })

  it('detects local credentials without the network', async () => {
    const provider = new ClaudeProvider()
    expect(await provider.hasLocalCredentials(fakeContext({ files: { [CREDENTIALS]: credentialsFile({ accessToken: 'a' }) } }))).toBe(true)
    expect(await provider.hasLocalCredentials(fakeContext())).toBe(false)
  })
})
