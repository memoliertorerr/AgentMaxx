import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fakeContext, json } from '../../../../tests/helpers/fakes'
import { ProviderError } from '../../errors'
import type { HttpRequest } from '../../http'
import { OpenRouterProvider } from './index'
import { creditsLines, keyMetrics } from './mapper'

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, '../../../../tests/fixtures/openrouter', name), 'utf8')) as Record<string, unknown>

const isCredits = (r: HttpRequest) => r.url === 'https://openrouter.ai/api/v1/credits'
const isKey = (r: HttpRequest) => r.url === 'https://openrouter.ai/api/v1/key'
const data = (name: string) => fixture(name).data as Record<string, unknown>

describe('OpenRouter mapper', () => {
  it('maps /credits to a dollar meter and the remaining balance', () => {
    expect(creditsLines(data('credits.json'))).toEqual([
      { type: 'progress', label: 'Credits', used: 178.2, limit: 277.47, format: { kind: 'dollars' } },
      { type: 'values', label: 'Balance', values: [{ number: 277.47 - 178.2, kind: 'dollars' }] }
    ])
  })

  it('shows only Balance, as a real $0, for an account that never bought credits', () => {
    expect(creditsLines({ total_credits: 0, total_usage: 0 })).toEqual([{ type: 'values', label: 'Balance', values: [{ number: 0, kind: 'dollars' }] }])
    expect(creditsLines({ total_credits: 10 })).toEqual([])
  })

  it('maps /key period spend, the per-key cap, and the tier', () => {
    expect(keyMetrics(data('key.json'))).toEqual({
      plan: 'Pay as you go',
      lines: [
        { type: 'values', label: 'Today', values: [{ number: 0, kind: 'dollars' }] },
        { type: 'values', label: 'This Week', values: [{ number: 1.25, kind: 'dollars' }] },
        { type: 'values', label: 'This Month', values: [{ number: 4.5, kind: 'dollars' }] },
        // limit 5 − limit_remaining 3, not the key's lifetime usage.
        { type: 'progress', label: 'Key Limit', used: 2, limit: 5, format: { kind: 'dollars' } }
      ]
    })
  })

  it('leaves Key Limit out when the key has no cap', () => {
    expect(keyMetrics({ is_free_tier: true, limit: null })).toEqual({ plan: 'Free tier', lines: [] })
    expect(keyMetrics({ limit: 0, usage_daily: 1 }).lines.map((line) => line.label)).toEqual(['Today'])
  })
})

function provider(options: Parameters<typeof fakeContext>[0] = {}) {
  const ctx = fakeContext(options)
  return { ctx, provider: new OpenRouterProvider() }
}

describe('OpenRouterProvider', () => {
  it('prefers the saved key over environment variables', async () => {
    const { ctx, provider: openRouter } = provider({
      apiKeys: { openrouter: 'sk-saved' },
      env: { USERPROFILE: 'C:\\Users\\ada', OPENROUTER_API_KEY: 'sk-env' }
    })
    ctx.http.on(isCredits, () => json(fixture('credits.json'))).on(isKey, () => json(fixture('key.json')))
    const snapshot = await openRouter.refresh(ctx)
    expect(snapshot.plan).toBe('Pay as you go')
    expect(snapshot.lines.map((line) => line.label)).toEqual(['Credits', 'Balance', 'Today', 'This Week', 'This Month', 'Key Limit'])
    expect(ctx.http.requests.map((r) => r.headers?.Authorization)).toEqual(['Bearer sk-saved', 'Bearer sk-saved'])
  })

  it('falls back to OPENROUTER_API_KEY, then OPENROUTER_KEY', async () => {
    for (const [env, expected] of [
      [{ OPENROUTER_API_KEY: ' sk-one ', OPENROUTER_KEY: 'sk-two' }, 'Bearer sk-one'],
      [{ OPENROUTER_API_KEY: '  ', OPENROUTER_KEY: 'sk-two' }, 'Bearer sk-two']
    ] as const) {
      const { ctx, provider: openRouter } = provider({ env })
      ctx.http.on(isCredits, () => json(fixture('credits.json'))).on(isKey, () => json(fixture('key.json')))
      await openRouter.refresh(ctx)
      expect(ctx.http.requests[0]?.headers?.Authorization).toBe(expected)
    }
  })

  it('asks for a key when none is set', async () => {
    const { ctx, provider: openRouter } = provider()
    await expect(openRouter.refresh(ctx)).rejects.toMatchObject({ category: 'notLoggedIn', message: expect.stringContaining('No OpenRouter API key') })
    expect(await openRouter.hasLocalCredentials(ctx)).toBe(false)
  })

  it('detects a saved key without decrypting it', async () => {
    const ctx = fakeContext()
    ctx.apiKeys = { get: () => Promise.reject(new Error('must not decrypt')), has: async (id) => id === 'openrouter' }
    expect(await new OpenRouterProvider().hasLocalCredentials(ctx)).toBe(true)
  })

  it('keeps the balance when /key is forbidden for this key type', async () => {
    const { ctx, provider: openRouter } = provider({ apiKeys: { openrouter: 'sk' } })
    ctx.http.on(isCredits, () => json(fixture('credits.json'))).on(isKey, () => json({}, 403))
    const snapshot = await openRouter.refresh(ctx)
    expect(snapshot.lines.map((line) => line.label)).toEqual(['Credits', 'Balance'])
    expect(snapshot.plan).toBeUndefined()
  })

  it('calls the key invalid only when both endpoints reject it', async () => {
    const { ctx, provider: openRouter } = provider({ apiKeys: { openrouter: 'sk' } })
    ctx.http.on(() => true, () => json({}, 401))
    await expect(openRouter.refresh(ctx)).rejects.toMatchObject({ category: 'authInvalid', message: expect.stringContaining('API key invalid') })
  })

  it('reports the first endpoint failure when nothing usable came back', async () => {
    const { ctx, provider: openRouter } = provider({ apiKeys: { openrouter: 'sk' } })
    ctx.http.on(isCredits, () => json({}, 503)).on(isKey, () => json({}, 401))
    await expect(openRouter.refresh(ctx)).rejects.toMatchObject({ category: 'http5xx', message: 'OpenRouter request failed (HTTP 503).' })
  })

  it('treats a body without a data object as invalid', async () => {
    const { ctx, provider: openRouter } = provider({ apiKeys: { openrouter: 'sk' } })
    ctx.http.on(() => true, () => json({ error: 'nope' }))
    await expect(openRouter.refresh(ctx)).rejects.toMatchObject({ category: 'decoding' })
  })

  it("says it couldn't reach OpenRouter on a network failure", async () => {
    const { ctx, provider: openRouter } = provider({ apiKeys: { openrouter: 'sk' } })
    ctx.http.on(() => true, () => {
      throw new ProviderError('network', 'Usage request failed. Check your connection.', 'GET https://openrouter.ai: ECONNRESET')
    })
    await expect(openRouter.refresh(ctx)).rejects.toMatchObject({ category: 'network', message: "Couldn't reach OpenRouter. Check your connection." })
  })
})
