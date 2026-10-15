import { ProviderError } from '../../errors'
import type { ProviderContext, ProviderRuntime } from '../../runtime'
import type { MetricDescriptor, MetricLine, ProviderInfo, ProviderSnapshot } from '../../types'

// Fixed sample data for screenshots and development (USAGEMAXX_DEMO=1). Covers every shape the
// dashboard renders: percent / dollar / count meters with and without resets, values, badges,
// a provider that errors, one with a soft warning, and one whose data is outdated. Never
// registered alongside real providers, and its ids are prefixed so caches can't mix.

const HOUR = 3_600_000
const DAY = 24 * HOUR
const SESSION = 5 * HOUR
const WEEK = 7 * DAY

function metric(id: string, options: Partial<Omit<MetricDescriptor, 'id'>> = {}): MetricDescriptor {
  return { id, defaultEnabled: true, defaultOnDemand: false, defaultPinned: false, ...options }
}

/** A percent meter whose window is `remainingMs` from resetting. */
function windowed(label: string, used: number, periodMs: number, remainingMs: number, now: Date): MetricLine {
  return {
    type: 'progress',
    label,
    used,
    limit: 100,
    format: { kind: 'percent' },
    resetsAt: new Date(now.getTime() + remainingMs).toISOString(),
    periodDurationMs: periodMs
  }
}

class DemoProvider implements ProviderRuntime {
  constructor(
    readonly info: ProviderInfo,
    readonly metrics: readonly MetricDescriptor[],
    private readonly produce: (now: Date) => Omit<ProviderSnapshot, 'providerId' | 'displayName'>
  ) {}

  async refresh(ctx: ProviderContext): Promise<ProviderSnapshot> {
    await new Promise((resolve) => setTimeout(resolve, 150))
    const now = ctx.now()
    return { providerId: this.info.id, displayName: this.info.displayName, ...this.produce(now) }
  }

  async hasLocalCredentials(): Promise<boolean> {
    return true
  }
}

function info(id: string, displayName: string, brandColor: string, links: ProviderInfo['links'] = []): ProviderInfo {
  return { id: `demo-${id}`, displayName, brandColor, links, autoEnable: true }
}

export function createDemoProviders(): ProviderRuntime[] {
  return [
    new DemoProvider(
      info('claude', 'Claude', '#D97757', [
        { label: 'Status', url: 'https://status.anthropic.com' },
        { label: 'Usage', url: 'https://claude.ai/settings/usage' }
      ]),
      [
        metric('Session', { defaultPinned: true, sessionStartSignal: 'missingResetDate' }),
        metric('Weekly', { defaultPinned: true }),
        metric('Sonnet', { defaultOnDemand: true }),
        metric('Extra Usage', { defaultOnDemand: true })
      ],
      (now) => ({
        plan: 'Max 5x',
        refreshedAt: now.toISOString(),
        lines: [
          windowed('Session', 38, SESSION, 2 * HOUR + 10 * 60_000, now),
          windowed('Weekly', 71, WEEK, 2 * DAY + 4 * HOUR, now),
          windowed('Sonnet', 12, WEEK, 2 * DAY + 4 * HOUR, now),
          { type: 'progress', label: 'Extra Usage', used: 12.4, limit: 50, format: { kind: 'dollars' } }
        ]
      })
    ),
    new DemoProvider(
      info('codex', 'Codex', '#10A37F', [{ label: 'Usage', url: 'https://chatgpt.com/codex/settings/usage' }]),
      [
        metric('Session', { defaultPinned: true }),
        metric('Weekly', { defaultPinned: true }),
        metric('Credits', { defaultOnDemand: true })
      ],
      (now) => ({
        plan: 'Pro 200',
        refreshedAt: now.toISOString(),
        lines: [
          windowed('Session', 92, SESSION, 40 * 60_000, now),
          windowed('Weekly', 45, WEEK, 3 * DAY + 2 * HOUR, now),
          {
            type: 'values',
            label: 'Credits',
            values: [
              { number: 31.84, kind: 'dollars' },
              { number: 796, kind: 'count', label: 'credits' }
            ]
          }
        ]
      })
    ),
    new DemoProvider(
      info('cursor', 'Cursor', '#5B5BD6'),
      [metric('Total Usage'), metric('Cursor Models'), metric('Other Models'), metric('Requests', { defaultOnDemand: true })],
      (now) => ({
        plan: 'Pro',
        refreshedAt: now.toISOString(),
        lines: [
          { type: 'progress', label: 'Total Usage', used: 82, limit: 100, format: { kind: 'percent' } },
          windowed('Cursor Models', 34, 30 * DAY, 18 * DAY, now),
          windowed('Other Models', 15, 30 * DAY, 18 * DAY, now),
          { type: 'progress', label: 'Requests', used: 312, limit: 500, format: { kind: 'count', suffix: 'requests' } }
        ]
      })
    ),
    new DemoProvider(
      info('copilot', 'Copilot', '#6E40C9'),
      [metric('Credits', { defaultPinned: true }), metric('Chat', { defaultOnDemand: true }), metric('Completions', { defaultOnDemand: true })],
      (now) => ({
        plan: 'Pro',
        refreshedAt: now.toISOString(),
        lines: [windowed('Credits', 54, 30 * DAY, 12 * DAY, now)]
      })
    ),
    new DemoProvider(
      info('openrouter', 'OpenRouter', '#6467F2', [{ label: 'API Keys', url: 'https://openrouter.ai/keys' }]),
      [metric('Credits'), metric('Balance'), metric('Today'), metric('Key Limit', { defaultOnDemand: true })],
      (now) => ({
        plan: 'Pay as you go',
        refreshedAt: now.toISOString(),
        lines: [
          { type: 'progress', label: 'Credits', used: 37.5, limit: 50, format: { kind: 'dollars' } },
          { type: 'values', label: 'Balance', values: [{ number: 12.5, kind: 'dollars' }] },
          { type: 'values', label: 'Today', values: [{ number: 1.2, kind: 'dollars' }] },
          { type: 'badge', label: 'Key Limit', text: 'No limit' }
        ]
      })
    ),
    new DemoProvider(info('zai', 'Z.ai', '#2563EB'), [metric('Session'), metric('Weekly')], (now) => ({
      refreshedAt: now.toISOString(),
      lines: [],
      warning: 'No active GLM Coding Plan'
    })),
    new DemoProvider(info('devin', 'Devin', '#0F766E'), [metric('Weekly'), metric('Daily')], (now) => ({
      plan: 'Core',
      // Fetched three hours ago, so the card reads "Outdated".
      refreshedAt: new Date(now.getTime() - 3 * HOUR).toISOString(),
      lines: [windowed('Weekly', 64, WEEK, 4 * DAY, new Date(now.getTime() - 3 * HOUR))]
    })),
    new (class extends DemoProvider {
      override async refresh(): Promise<ProviderSnapshot> {
        throw new ProviderError('notLoggedIn', 'Not logged in. Run `grok login`, then refresh.')
      }
    })(info('grok', 'Grok', '#111111'), [metric('Weekly'), metric('Extra Usage')], () => ({ refreshedAt: '', lines: [] }))
  ]
}
