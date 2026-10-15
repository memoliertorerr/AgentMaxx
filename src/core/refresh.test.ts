import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeContext, silentLogger } from '../../tests/helpers/fakes'
import { ProviderError } from './errors'
import { RefreshEngine } from './refresh'
import type { ProviderContext, ProviderRuntime } from './runtime'
import type { ProviderSnapshot } from './types'

type Behavior = (ctx: ProviderContext) => Promise<ProviderSnapshot>

class FakeProvider implements ProviderRuntime {
  calls = 0
  readonly metrics = []
  readonly info

  constructor(
    id: string,
    public behavior: Behavior
  ) {
    this.info = { id, displayName: id, brandColor: '#000000', links: [], autoEnable: true }
  }

  async refresh(ctx: ProviderContext): Promise<ProviderSnapshot> {
    this.calls++
    return this.behavior(ctx)
  }

  async hasLocalCredentials(): Promise<boolean> {
    return true
  }
}

function snapshot(id: string, used: number): ProviderSnapshot {
  return {
    providerId: id,
    displayName: id,
    refreshedAt: new Date().toISOString(),
    lines: [{ type: 'progress', label: 'Session', used, limit: 100, format: { kind: 'percent' } }]
  }
}

function engineWith(...providers: FakeProvider[]): RefreshEngine {
  return new RefreshEngine({
    providers,
    makeContext: ({ signal, manual }) => ({ ...fakeContext(), signal, manual }),
    now: () => new Date(),
    log: silentLogger
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('RefreshEngine', () => {
  it('refreshes enabled providers in parallel', async () => {
    const order: string[] = []
    const slow = new FakeProvider('slow', async () => {
      order.push('slow:start')
      await new Promise((resolve) => setTimeout(resolve, 1000))
      order.push('slow:end')
      return snapshot('slow', 1)
    })
    const fast = new FakeProvider('fast', async () => {
      order.push('fast:start')
      return snapshot('fast', 2)
    })
    const engine = engineWith(slow, fast)
    engine.setEnabled(['slow', 'fast'])
    const done = engine.refreshAll()
    await vi.advanceTimersByTimeAsync(0)
    expect(engine.state('fast')?.snapshot).toBeDefined()
    expect(engine.state('slow')?.refreshing).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    await done
    expect(order).toEqual(['slow:start', 'fast:start', 'slow:end'])
  })

  it('times a hanging provider out after 120 s without blocking the others', async () => {
    let aborted = false
    const hanging = new FakeProvider('hang', (ctx) => {
      ctx.signal.addEventListener('abort', () => (aborted = true))
      return new Promise(() => undefined)
    })
    const healthy = new FakeProvider('ok', async () => snapshot('ok', 5))
    const engine = engineWith(hanging, healthy)
    engine.setEnabled(['hang', 'ok'])
    const done = engine.refreshAll()
    await vi.advanceTimersByTimeAsync(0)
    expect(engine.state('ok')?.snapshot).toBeDefined()
    await vi.advanceTimersByTimeAsync(120_000)
    await done
    expect(engine.state('hang')).toMatchObject({
      refreshing: false,
      error: { category: 'timeout', message: 'Refresh timed out after 120s' }
    })
    expect(aborted).toBe(true)
  })

  it('keeps the last good snapshot when a refresh fails, and clears the error on success', async () => {
    const provider = new FakeProvider('p', async () => snapshot('p', 40))
    const engine = engineWith(provider)
    engine.setEnabled(['p'])
    await engine.refreshAll()

    provider.behavior = async () => {
      throw new ProviderError('network', 'Usage request failed. Check your connection.')
    }
    await engine.refreshAll({ force: true })
    const failed = engine.state('p')
    expect(failed?.snapshot?.lines[0]).toMatchObject({ used: 40 })
    expect(failed?.error).toEqual({ category: 'network', message: 'Usage request failed. Check your connection.' })

    provider.behavior = async () => snapshot('p', 41)
    await engine.refreshAll({ force: true })
    expect(engine.state('p')?.error).toBeUndefined()
    expect(engine.state('p')?.snapshot?.lines[0]).toMatchObject({ used: 41 })
  })

  it('shows cached snapshots at once but refetches them on the first pass', async () => {
    const provider = new FakeProvider('p', async () => snapshot('p', 7))
    const engine = engineWith(provider)
    engine.seed({ p: snapshot('p', 3) })
    expect(engine.state('p')).toMatchObject({ fromPreviousSession: true })
    engine.setEnabled(['p'])
    await engine.refreshAll()
    expect(provider.calls).toBe(1)
    expect(engine.state('p')).toMatchObject({ fromPreviousSession: false })
  })

  it('skips providers refreshed this interval unless forced', async () => {
    const provider = new FakeProvider('p', async () => snapshot('p', 1))
    const engine = engineWith(provider)
    engine.setEnabled(['p'])
    await engine.refreshAll()
    await engine.refreshAll()
    expect(provider.calls).toBe(1)
    await engine.refreshAll({ force: true })
    expect(provider.calls).toBe(2)
  })

  it('refreshes a newly enabled provider immediately once running', async () => {
    const a = new FakeProvider('a', async () => snapshot('a', 1))
    const b = new FakeProvider('b', async () => snapshot('b', 1))
    const engine = engineWith(a, b)
    engine.setEnabled(['a'])
    engine.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(b.calls).toBe(0)
    engine.setEnabled(['a', 'b'])
    await vi.advanceTimersByTimeAsync(0)
    expect(b.calls).toBe(1)
    engine.stop()
  })

  it('runs again every five minutes after a pass finishes', async () => {
    const provider = new FakeProvider('p', async () => snapshot('p', 1))
    const engine = engineWith(provider)
    engine.setEnabled(['p'])
    engine.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(provider.calls).toBe(1)
    expect(engine.nextRefreshAt?.toISOString()).toBe('2026-10-15T12:05:00.000Z')
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(provider.calls).toBe(2)
    engine.stop()
  })

  it('joins a refresh already in flight instead of starting a second one', async () => {
    const provider = new FakeProvider('p', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return snapshot('p', 1)
    })
    const engine = engineWith(provider)
    engine.setEnabled(['p'])
    const first = engine.refreshOne('p')
    const second = engine.refreshOne('p')
    await vi.advanceTimersByTimeAsync(10)
    await Promise.all([first, second])
    expect(provider.calls).toBe(1)
  })
})
