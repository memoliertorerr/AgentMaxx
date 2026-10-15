import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeContext, json } from '../../../../tests/helpers/fakes'
import type { HttpRequest } from '../../http'
import { ZaiProvider } from './index'
import { MONTH_MS, isNoCodingPlan, mapZaiQuota, planName } from './mapper'

const fixture = (name: string) => JSON.parse(readFileSync(path.join(__dirname, '../../../../tests/fixtures/zai', name), 'utf8')) as unknown

const isQuota = (r: HttpRequest) => r.url === 'https://api.z.ai/api/monitor/usage/quota/limit'
const isSubscription = (r: HttpRequest) => r.url === 'https://api.z.ai/api/biz/subscription/list'
const HOUR_MS = 3_600_000

describe('mapZaiQuota', () => {
  it('classifies token windows by length and maps web searches (live TOKENS_LIMIT shape)', () => {
    expect(mapZaiQuota(fixture('quota.json'))).toEqual([
      { type: 'progress', label: 'Session', used: 17, limit: 100, format: { kind: 'percent' }, periodDurationMs: 5 * HOUR_MS, resetsAt: '2026-06-29T09:22:51.179Z' },
      { type: 'progress', label: 'Weekly', used: 3, limit: 100, format: { kind: 'percent' }, periodDurationMs: 168 * HOUR_MS, resetsAt: '2026-07-06T02:38:06.997Z' },
      {
        type: 'progress',
        label: 'Web Searches',
        used: 0,
        limit: 1000,
        format: { kind: 'count', suffix: 'searches' },
        periodDurationMs: MONTH_MS,
        resetsAt: '2026-07-29T02:38:06.976Z'
      }
    ])
  })

  it('maps the current CREDIT_LIMIT shape, where an idle session has no reset time', () => {
    const [session, weekly] = mapZaiQuota(fixture('quota-credit.json'))
    expect(session).toEqual({ type: 'progress', label: 'Session', used: 0, limit: 100, format: { kind: 'percent' }, periodDurationMs: 5 * HOUR_MS })
    expect(weekly).toMatchObject({ label: 'Weekly', used: 98, resetsAt: '2026-08-14T05:34:39.998Z' })
  })

  it('accepts limits on the root object and matches entries by name', () => {
    const lines = mapZaiQuota({ limits: [{ name: 'TOKENS_LIMIT', unit: 4, number: 7, percentage: 140 }] })
    // Seven days is multi-day → Weekly; the percentage is clamped.
    expect(lines).toEqual([{ type: 'progress', label: 'Weekly', used: 100, limit: 100, format: { kind: 'percent' }, periodDurationMs: 168 * HOUR_MS }])
  })

  it('returns no lines for an empty limits array or only unknown windows', () => {
    expect(mapZaiQuota({ data: { limits: [] } })).toEqual([])
    expect(mapZaiQuota({ data: { limits: [{ type: 'CREDIT_LIMIT', unit: 9, number: 1, percentage: 5 }] } })).toEqual([])
  })

  it('rejects missing required values instead of showing zero', () => {
    for (const body of [
      { data: { limits: [{ type: 'CREDIT_LIMIT', unit: 3, number: 5 }] } },
      { data: { limits: [{ type: 'CREDIT_LIMIT', unit: 3, percentage: 5 }] } },
      { data: { limits: [{ type: 'TIME_LIMIT', usage: 1000 }] } },
      { data: { limits: 'none' } },
      { data: { limits: [1] } },
      { data: null },
      []
    ]) {
      expect(() => mapZaiQuota(body), JSON.stringify(body)).toThrow(expect.objectContaining({ category: 'decoding' }))
    }
  })

  it('recognizes the no-coding-plan answer and reads the plan name', () => {
    expect(isNoCodingPlan(fixture('no-plan.json'))).toBe(true)
    expect(isNoCodingPlan({ success: false, msg: 'Internal error' })).toBe(false)
    expect(isNoCodingPlan(fixture('quota.json'))).toBe(false)
    expect(planName(fixture('subscription.json'))).toBe('GLM Coding Pro')
    expect(planName({ data: [] })).toBeUndefined()
  })
})

describe('ZaiProvider', () => {
  it('maps the quota with the plan name from the subscription', async () => {
    const ctx = fakeContext({ apiKeys: { zai: 'zk-saved' }, env: { ZAI_API_KEY: 'zk-env' } })
    ctx.http.on(isQuota, () => json(fixture('quota.json'))).on(isSubscription, () => json(fixture('subscription.json')))
    const snapshot = await new ZaiProvider().refresh(ctx)
    expect(snapshot.plan).toBe('GLM Coding Pro')
    expect(snapshot.lines.map((line) => line.label)).toEqual(['Session', 'Weekly', 'Web Searches'])
    expect(ctx.http.requests.every((r) => r.headers?.Authorization === 'Bearer zk-saved')).toBe(true)
  })

  it('uses ZAI_API_KEY before GLM_API_KEY', async () => {
    for (const [env, expected] of [
      [{ ZAI_API_KEY: 'zk-one', GLM_API_KEY: 'zk-two' }, 'Bearer zk-one'],
      [{ GLM_API_KEY: 'zk-two' }, 'Bearer zk-two']
    ] as const) {
      const ctx = fakeContext({ env })
      ctx.http.on(isQuota, () => json(fixture('quota.json'))).on(isSubscription, () => json(fixture('subscription.json')))
      await new ZaiProvider().refresh(ctx)
      expect(ctx.http.requests[0]?.headers?.Authorization).toBe(expected)
    }
  })

  it('keeps the meters when the subscription lookup fails', async () => {
    const ctx = fakeContext({ apiKeys: { zai: 'zk' } })
    ctx.http.on(isQuota, () => json(fixture('quota-credit.json'))).on(isSubscription, () => json({}, 500))
    const snapshot = await new ZaiProvider().refresh(ctx)
    expect(snapshot.plan).toBeUndefined()
    expect(snapshot.lines).toHaveLength(2)
  })

  it('warns that there is no active GLM Coding Plan', async () => {
    const ctx = fakeContext({ apiKeys: { zai: 'zk' } })
    ctx.http.on(isQuota, () => json(fixture('no-plan.json'))).on(isSubscription, () => json({ data: [] }))
    await expect(new ZaiProvider().refresh(ctx)).rejects.toMatchObject({
      category: 'notAvailable',
      message: 'No active GLM Coding Plan. Subscribe at z.ai/subscribe to see usage.'
    })
  })

  it('reports a rejected key, a failed request, and a missing key', async () => {
    const rejected = fakeContext({ apiKeys: { zai: 'zk' } })
    rejected.http.on(() => true, () => json({}, 401))
    await expect(new ZaiProvider().refresh(rejected)).rejects.toMatchObject({ category: 'authInvalid', message: expect.stringContaining('Z.ai API key invalid') })

    const failed = fakeContext({ apiKeys: { zai: 'zk' } })
    failed.http.on(isQuota, () => json({}, 502)).on(isSubscription, () => json({}, 502))
    await expect(new ZaiProvider().refresh(failed)).rejects.toMatchObject({ category: 'http5xx', message: 'Usage request failed (HTTP 502). Try again later.' })

    const missing = fakeContext()
    await expect(new ZaiProvider().refresh(missing)).rejects.toMatchObject({ category: 'notLoggedIn', message: expect.stringContaining('No Z.ai API key') })
    expect(await new ZaiProvider().hasLocalCredentials(missing)).toBe(false)
    expect(await new ZaiProvider().hasLocalCredentials(fakeContext({ env: { GLM_API_KEY: 'zk' } }))).toBe(true)
  })
})
