import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeContext } from '../../tests/helpers/fakes'
import { detectLocalCredentials } from './detect'
import type { ProviderRuntime } from './runtime'

function provider(id: string, probe: () => Promise<boolean>): ProviderRuntime {
  return {
    info: { id, displayName: id, brandColor: '#000', links: [], autoEnable: true },
    metrics: [],
    refresh: () => Promise.reject(new Error('detection must never refresh')),
    hasLocalCredentials: probe
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('detectLocalCredentials', () => {
  it('reports each provider, treating a failing or hanging probe as not found', async () => {
    vi.useFakeTimers()
    const providers = [
      provider('claude', async () => true),
      provider('codex', async () => false),
      provider('cursor', () => Promise.reject(new Error('locked database'))),
      provider('copilot', () => new Promise<boolean>(() => undefined))
    ]
    const pending = detectLocalCredentials(providers, fakeContext(), 10_000)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await pending).toEqual({ claude: true, codex: false, cursor: false, copilot: false })
  })
})
