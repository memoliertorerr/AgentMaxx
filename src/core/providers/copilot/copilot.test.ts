import { describe, expect, it } from 'vitest'
import { FakeHttp, fakeContext, json } from '../../../../tests/helpers/fakes'
import type { HttpRequest } from '../../http'
import { ghHostsPath, ghHostsValue, loadCopilotToken, oauthTokenFromEditorJson } from './auth'
import { CopilotProvider } from './index'
import { mapCopilotUsage, orgBillingLines } from './mapper'

const now = new Date('2026-10-15T12:00:00Z')
const LOCAL = 'C:\\Users\\ada\\AppData\\Local'
const ROAMING = 'C:\\Users\\ada\\AppData\\Roaming'
const reset = { periodDurationMs: 2_592_000_000, resetsAt: '2026-11-01T00:00:00.000Z' }

describe('mapCopilotUsage', () => {
  it('maps a paid plan: credits used and extra usage; unlimited chat is hidden', () => {
    const mapped = mapCopilotUsage({
      copilot_plan: 'individual_pro',
      quota_reset_date: '2026-11-01',
      quota_snapshots: {
        premium_interactions: { entitlement: 300, remaining: 120, percent_remaining: 40, overage_permitted: true, overage_count: 3 },
        chat: { unlimited: true },
        completions: { entitlement: -1, remaining: -1 }
      }
    })
    expect(mapped).toEqual({
      plan: 'Individual Pro',
      isOrgManagedSeat: false,
      lines: [
        { type: 'progress', label: 'Credits', used: 60, limit: 100, format: { kind: 'percent' }, ...reset },
        { type: 'values', label: 'Extra Usage', values: [{ number: 3, kind: 'count' }] }
      ]
    })
  })

  it('maps free-plan chat and completions counts', () => {
    const mapped = mapCopilotUsage({
      copilot_plan: 'free',
      quota_snapshots: {
        premium_interactions: { entitlement: 0, remaining: 0 },
        chat: { entitlement: 50, remaining: 40 },
        completions: { entitlement: 2000, remaining: 1500 }
      }
    })
    expect(mapped.lines).toMatchObject([
      { label: 'Chat', used: 20 },
      { label: 'Completions', used: 25 }
    ])
  })

  it('reads the older free-tier shape', () => {
    const mapped = mapCopilotUsage({ limited_user_quotas: { chat: 40, completions: 1500 }, monthly_quotas: { chat: 50, completions: 2000 } })
    expect(mapped.lines.map((line) => [line.label, line.type === 'progress' ? line.used : undefined])).toEqual([
      ['Chat', 20],
      ['Completions', 25]
    ])
  })

  it('treats an org-managed seat as a plan with an optional personal count', () => {
    const mapped = mapCopilotUsage({ copilot_plan: 'business', token_based_billing: true, quota_snapshots: { premium_interactions: { entitlement: 0, credits_used: 42 } } })
    expect(mapped).toEqual({
      plan: 'Business',
      isOrgManagedSeat: true,
      lines: [{ type: 'values', label: 'Credits', values: [{ number: 42, kind: 'count' }] }]
    })
  })

  it('fails loudly on a payload with nothing usable', () => {
    expect(() => mapCopilotUsage({})).toThrow('Copilot usage data is unavailable for this account.')
  })

  it('sums Copilot credit items from an org billing summary', () => {
    expect(
      orgBillingLines({
        usageItems: [
          { product: 'Copilot', unitType: 'ai-credits', grossQuantity: 120, netAmount: 4.5 },
          { product: 'copilot', unitType: 'AI-Units', grossQuantity: 30, netAmount: 0 },
          { product: 'Actions', unitType: 'minutes', grossQuantity: 999, netAmount: 9 }
        ]
      })
    ).toEqual([
      { type: 'values', label: 'Org Credits', values: [{ number: 150, kind: 'count', label: 'credits' }] },
      { type: 'values', label: 'Org Spend', values: [{ number: 4.5, kind: 'dollars' }] }
    ])
    expect(orgBillingLines({ usageItems: [] })).toBeUndefined()
  })
})

describe('Copilot token discovery', () => {
  it('reads the editor plugin token from %LOCALAPPDATA%', async () => {
    const ctx = fakeContext({ files: { [`${LOCAL}\\github-copilot\\apps.json`]: JSON.stringify({ 'github.com:Iv1.abc': { oauth_token: 'gho_editor' } }) } })
    expect(await loadCopilotToken(ctx)).toEqual({ value: 'gho_editor', source: 'editor' })
  })

  it("reads gh's hosts.yml from %APPDATA%\\GitHub CLI", async () => {
    const hosts = 'github.com:\n    user: ada\n    oauth_token: gho_file\n    git_protocol: https\nghe.example.com:\n    oauth_token: gho_other\n'
    const ctx = fakeContext({ files: { [`${ROAMING}\\GitHub CLI\\hosts.yml`]: hosts } })
    expect(ghHostsPath(ctx)).toBe(`${ROAMING}\\GitHub CLI\\hosts.yml`)
    expect(await loadCopilotToken(ctx)).toEqual({ value: 'gho_file', source: 'ghConfig' })
  })

  it('asks the gh CLI next', async () => {
    const ctx = fakeContext({ commands: { 'gh auth token --hostname github.com': { code: 0, stdout: 'gho_cli\n', stderr: '' } } })
    expect(await loadCopilotToken(ctx)).toEqual({ value: 'gho_cli', source: 'ghCli' })
  })

  it("falls back to Credential Manager, preferring the hosts.yml user's entry", async () => {
    const wrapped = (token: string) => `go-keyring-base64:${Buffer.from(token).toString('base64')}`
    const ctx = fakeContext({
      files: { [`${ROAMING}\\GitHub CLI\\hosts.yml`]: 'github.com:\n    user: ada\n' },
      secrets: [
        { target: 'gh:github.com:someone', secret: wrapped('gho_wrong') },
        { target: 'gh:github.com:ada', secret: wrapped('gho_ada') },
        { target: 'gh:ghe.example.com:ada', secret: 'gho_enterprise' }
      ]
    })
    expect(await loadCopilotToken(ctx)).toEqual({ value: 'gho_ada', source: 'credentialManager' })
  })

  it('finds nothing when no source has a token', async () => {
    expect(await loadCopilotToken(fakeContext())).toBeUndefined()
  })

  it('parses only the github.com block of hosts.yml', () => {
    expect(ghHostsValue('enterprise.local:\n  user: x\ngithub.com:\n  user: "ada"\n', 'user')).toBe('ada')
    expect(oauthTokenFromEditorJson('{"gitlab.com":{"oauth_token":"x"}}')).toBeUndefined()
  })
})

const isUsage = (r: HttpRequest) => r.url === 'https://api.github.com/copilot_internal/user'

describe('CopilotProvider.refresh', () => {
  const tokenFile = { [`${LOCAL}\\github-copilot\\apps.json`]: JSON.stringify({ 'github.com': { oauth_token: 'gho_t' } }) }

  it('calls the Copilot user endpoint with editor headers', async () => {
    const http = new FakeHttp().on(isUsage, () => json({ copilot_plan: 'pro', quota_snapshots: { premium_interactions: { entitlement: 300, remaining: 150 } } }))
    const ctx = fakeContext({ now, http, files: tokenFile })
    const snapshot = await new CopilotProvider().refresh(ctx)
    expect(snapshot.plan).toBe('Pro')
    expect(ctx.http.requests[0]?.headers).toMatchObject({ Authorization: 'token gho_t', 'X-Github-Api-Version': '2025-04-01' })
  })

  it('asks for re-authentication on 401', async () => {
    const ctx = fakeContext({ now, http: new FakeHttp().on(isUsage, () => json({}, 401)), files: tokenFile })
    await expect(new CopilotProvider().refresh(ctx)).rejects.toMatchObject({ category: 'authExpired', message: /gh auth login/ })
  })

  it('looks up org billing for an org-managed seat and remembers the org', async () => {
    const http = new FakeHttp()
      .on(isUsage, () => json({ copilot_plan: 'business', token_based_billing: true, quota_snapshots: { premium_interactions: { entitlement: 0 } } }))
      .on((r) => r.url.startsWith('https://api.github.com/user/orgs'), () => json([{ login: 'no-copilot' }, { login: 'acme' }]))
      .on((r) => r.url.includes('/orgs/no-copilot/'), () => json({ usageItems: [] }))
      .on((r) => r.url.includes('/orgs/acme/'), () => json({ usageItems: [{ product: 'copilot', unitType: 'ai-credits', grossQuantity: 10, netAmount: 1 }] }))
    const ctx = fakeContext({ now, http, files: tokenFile })
    const provider = new CopilotProvider()
    const first = await provider.refresh(ctx)
    expect(first.lines.map((line) => line.label)).toEqual(['Org Credits', 'Org Spend'])
    await provider.refresh(ctx)
    expect(ctx.http.requests.filter((r) => r.url.includes('/user/orgs'))).toHaveLength(1)
  })

  it('keeps a plan-only card when the token cannot list orgs', async () => {
    const http = new FakeHttp()
      .on(isUsage, () => json({ copilot_plan: 'business', token_based_billing: true }))
      .on((r) => r.url.includes('/user/orgs'), () => json({ message: 'forbidden' }, 403))
    const snapshot = await new CopilotProvider().refresh(fakeContext({ now, http, files: tokenFile }))
    expect(snapshot).toMatchObject({ plan: 'Business', lines: [] })
  })
})
