import { describe, expect, it } from 'vitest'
import { FakeHttp, FakeSqlite, fakeContext, json } from '../../../../tests/helpers/fakes'
import type { HttpRequest } from '../../http'
import { cursorSession, cursorStateDbPath, needsRefresh } from './auth'
import { CursorProvider } from './index'
import { mapCursorUsage, mapGrokBotUsage, mapRequestBasedUsage, requestBasedFallback } from './mapper'
import { mapUsageSummary } from './summary'

const now = new Date('2026-10-15T12:00:00Z')
const DB = 'C:\\Users\\ada\\AppData\\Roaming\\Cursor\\User\\globalStorage\\state.vscdb'

function jwt(payload: Record<string, unknown>): string {
  return `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`
}
const validToken = jwt({ sub: 'auth0|user_123', exp: now.getTime() / 1000 + 3600 })
const expiredToken = jwt({ sub: 'auth0|user_123', exp: now.getTime() / 1000 - 60 })

const individualUsage = {
  billingCycleStart: 1_770_000_000_000,
  billingCycleEnd: 1_772_592_000_000,
  planUsage: { limit: 40_000, remaining: 32_000, totalPercentUsed: 20, autoPercentUsed: 12.5, apiPercentUsed: 7.5 },
  spendLimitUsage: { individualLimit: 5_000, individualRemaining: 3_000 }
}
const cycle = { periodDurationMs: 2_592_000_000, resetsAt: new Date(1_772_592_000_000).toISOString() }

describe('mapCursorUsage', () => {
  it('maps an individual plan with credits, pools, and on-demand', () => {
    const mapped = mapCursorUsage(individualUsage, 'pro plan', { hasCreditGrants: true, totalCents: 1_000, usedCents: 250 }, 500)
    expect(mapped.plan).toBe('Pro Plan')
    expect(mapped.lines).toEqual([
      { type: 'values', label: 'Credits', values: [{ number: 12.5, kind: 'dollars' }] },
      { type: 'progress', label: 'Total usage', used: 20, limit: 100, format: { kind: 'percent' }, ...cycle },
      { type: 'progress', label: 'Cursor Models', used: 12.5, limit: 100, format: { kind: 'percent' }, ...cycle },
      { type: 'progress', label: 'Other Models', used: 7.5, limit: 100, format: { kind: 'percent' }, ...cycle },
      { type: 'progress', label: 'On-demand', used: 20, limit: 50, format: { kind: 'dollars' } }
    ])
  })

  it('uses only structured percentages for Teams seats with model pools', () => {
    const mapped = mapCursorUsage({ planUsage: { limit: 2_000, autoPercentUsed: 10, apiPercentUsed: 5 } }, 'Team', undefined, 0)
    expect(mapped.lines.map((line) => line.label)).toEqual(['Cursor Models', 'Other Models'])
  })

  it('shows a dollar total for older team accounts', () => {
    const mapped = mapCursorUsage({ planUsage: { limit: 2_000, totalSpend: 500 } }, 'Team', undefined, 0)
    expect(mapped.lines[0]).toMatchObject({ label: 'Total usage', used: 5, limit: 20, format: { kind: 'dollars' } })
  })

  it('rejects disabled accounts and payloads without any limit data', () => {
    expect(() => mapCursorUsage({ enabled: false, planUsage: {} }, 'Pro', undefined, 0)).toThrow('No active Cursor subscription.')
    expect(() => mapCursorUsage({ planUsage: {} }, 'Pro', undefined, 0)).toThrow(/invalid/)
  })
})

describe('fallbacks', () => {
  it('routes unusable Enterprise and Team plan data to the summary fallback', () => {
    expect(requestBasedFallback({ planUsage: {} }, 'Enterprise', false)).toBe('Enterprise usage data unavailable. Try again later.')
    expect(requestBasedFallback({ planUsage: {} }, 'team', false)).toBe('Team request-based usage data unavailable. Try again later.')
    expect(requestBasedFallback(individualUsage, 'Pro', false)).toBeUndefined()
  })

  it('maps the usage summary', () => {
    const mapped = mapUsageSummary(
      {
        billingCycleStart: '2026-10-01T00:00:00Z',
        billingCycleEnd: '2026-10-31T00:00:00Z',
        membershipType: 'enterprise',
        individualUsage: { plan: { totalPercentUsed: 40, autoPercentUsed: 30 }, onDemand: { enabled: true, limit: 10_000, used: 2_500 } }
      },
      undefined,
      undefined,
      'unavailable'
    )
    expect(mapped.plan).toBe('Enterprise')
    expect(mapped.lines).toMatchObject([
      { label: 'Total usage', used: 40, resetsAt: '2026-10-31T00:00:00.000Z', periodDurationMs: 30 * 86_400_000 },
      { label: 'Cursor Models', used: 30 },
      { label: 'On-demand', used: 25, limit: 100, format: { kind: 'dollars' } }
    ])
  })

  it('prefers the request count when the request endpoint has one', () => {
    const mapped = mapUsageSummary(undefined, { 'gpt-4': { numRequests: 120, maxRequestUsage: 500 }, startOfMonth: '2026-10-01T00:00:00Z' }, 'Enterprise', 'x')
    expect(mapped.lines).toMatchObject([
      { label: 'Total usage', used: 120, limit: 500, format: { kind: 'count', suffix: 'requests' } },
      { label: 'Requests', used: 120, limit: 500 }
    ])
    expect(() => mapUsageSummary(undefined, undefined, undefined, 'Nothing here')).toThrow('Nothing here')
  })

  it('maps the legacy request-count shape', () => {
    expect(mapRequestBasedUsage({ 'gpt-4': { numRequests: 3, maxRequestUsage: 50 } }, 'Pro', 'x').lines).toMatchObject([{ label: 'Requests', used: 3, limit: 50 }])
  })
})

describe('mapGrokBotUsage', () => {
  it('maps the weekly allowance and skips accounts without one', () => {
    expect(mapGrokBotUsage({ usagePercent: 37.5, currentPeriodStart: '2026-10-13T00:00:00Z', nextResetTimestampUtc: '2026-10-20T00:00:00Z' })).toEqual({
      type: 'progress',
      label: 'Grok Bot usage',
      used: 37.5,
      limit: 100,
      format: { kind: 'percent' },
      periodDurationMs: 604_800_000,
      resetsAt: '2026-10-20T00:00:00.000Z'
    })
    expect(mapGrokBotUsage({ usagePercent: 125 })).toMatchObject({ used: 100 })
    expect(mapGrokBotUsage({ usagePercent: 10, usesPooledEnterpriseAllowance: true })).toBeUndefined()
    expect(mapGrokBotUsage({ usagePercent: true })).toBeUndefined()
    expect(mapGrokBotUsage({ usagePercent: -1 })).toBeUndefined()
  })
})

describe('Cursor auth', () => {
  it('reads state.vscdb from %APPDATA%', () => {
    expect(cursorStateDbPath(fakeContext())).toBe(DB)
  })

  it('derives the web session from the token subject', () => {
    expect(cursorSession(validToken)).toEqual({ userId: 'user_123', sessionToken: `user_123%3A%3A${validToken}` })
  })

  it('refreshes near expiry or when the expiry is unreadable', () => {
    expect(needsRefresh(validToken, now)).toBe(false)
    expect(needsRefresh(expiredToken, now)).toBe(true)
    expect(needsRefresh('opaque', now)).toBe(true)
  })
})

const isUsage = (r: HttpRequest) => r.url.endsWith('/GetCurrentPeriodUsage')
const isRefresh = (r: HttpRequest) => r.url === 'https://api2.cursor.sh/oauth/token'

function sqlite(tokens: Record<string, string>): FakeSqlite {
  return new FakeSqlite({ [DB]: { ItemTable: tokens } })
}

/** A Cursor API that answers the primary and optional endpoints. */
function cursorApi(): FakeHttp {
  return new FakeHttp()
    .on(isUsage, () => json(individualUsage))
    .on((r) => r.url.endsWith('/GetPlanInfo'), () => json({ planInfo: { planName: 'Pro' } }))
    .on((r) => r.url.endsWith('/GetCreditGrantsBalance'), () => json({ hasCreditGrants: false }))
    .on((r) => r.url.endsWith('/GetSandUsageStatus'), () => json({ usagePercent: 5 }))
    .on((r) => r.url === 'https://cursor.com/api/auth/stripe', () => json({ customerBalance: 0 }))
}

describe('CursorProvider.refresh', () => {
  it('maps usage, plan, and Grok Bot with the stored token', async () => {
    const ctx = fakeContext({ now, http: cursorApi(), sqlite: sqlite({ 'cursorAuth/accessToken': validToken, 'cursorAuth/refreshToken': 'r' }) })
    const snapshot = await new CursorProvider().refresh(ctx)
    expect(snapshot.plan).toBe('Pro')
    expect(snapshot.lines.map((line) => line.label)).toEqual(['Total usage', 'Cursor Models', 'Other Models', 'On-demand', 'Grok Bot usage'])
    expect(ctx.http.requests.find(isUsage)?.headers).toMatchObject({ Authorization: `Bearer ${validToken}`, 'Connect-Protocol-Version': '1' })
    expect(ctx.http.requests.find((r) => r.url.includes('stripe'))?.headers?.Cookie).toBe(`WorkosCursorSessionToken=user_123%3A%3A${validToken}`)
  })

  it('refreshes an expired token in memory and reuses it next time', async () => {
    const http = cursorApi().on(isRefresh, () => json({ access_token: validToken }))
    const ctx = fakeContext({ now, http, sqlite: sqlite({ 'cursorAuth/accessToken': expiredToken, 'cursorAuth/refreshToken': 'r' }) })
    const provider = new CursorProvider()
    await provider.refresh(ctx)
    await provider.refresh(ctx)
    expect(ctx.http.requests.filter(isRefresh)).toHaveLength(1)
    expect(JSON.parse(ctx.http.requests.find(isRefresh)?.body ?? '{}')).toEqual({
      grant_type: 'refresh_token',
      client_id: 'KbZUR41cY7W6zRSdpSUJ7I7mLYBKOCmB',
      refresh_token: 'r'
    })
    expect(ctx.http.requests.filter(isUsage).every((r) => r.headers?.Authorization === `Bearer ${validToken}`)).toBe(true)
  })

  it('reports an ended session when Cursor says to log out', async () => {
    const http = new FakeHttp().on(isRefresh, () => json({ shouldLogout: true }, 401))
    const ctx = fakeContext({ now, http, sqlite: sqlite({ 'cursorAuth/refreshToken': 'r' }) })
    await expect(new CursorProvider().refresh(ctx)).rejects.toMatchObject({ category: 'authExpired', message: /Session expired/ })
  })

  it('says "not logged in" without a database or tokens', async () => {
    await expect(new CursorProvider().refresh(fakeContext({ now }))).rejects.toMatchObject({ category: 'notLoggedIn' })
    await expect(new CursorProvider().refresh(fakeContext({ now, sqlite: sqlite({}) }))).rejects.toMatchObject({ category: 'notLoggedIn' })
  })

  it('keeps the card when an optional endpoint fails', async () => {
    const http = new FakeHttp()
      .on(isUsage, () => json(individualUsage))
      .on((r) => r.url.endsWith('/GetPlanInfo'), () => json({}, 500))
      .on((r) => r.url.endsWith('/GetCreditGrantsBalance'), () => json({ nonsense: true }))
      .on((r) => r.url.endsWith('/GetSandUsageStatus'), () => json({}, 403))
      .on((r) => r.url.includes('stripe'), () => ({ status: 200, headers: {}, text: '<html>' }))
    const ctx = fakeContext({ now, http, sqlite: sqlite({ 'cursorAuth/accessToken': validToken }) })
    const snapshot = await new CursorProvider().refresh(ctx)
    expect(snapshot.lines.map((line) => line.label)).toEqual(['Total usage', 'Cursor Models', 'Other Models', 'On-demand'])
    expect(snapshot.plan).toBeUndefined()
  })
})
