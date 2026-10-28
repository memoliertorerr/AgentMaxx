import { formatValue } from '../core/format'
import { barFraction, meterState, severityOf, trayValue } from '../core/progress'
import { pinnedMetrics, type AppState, type PinnedMetric } from '../core/state'
import type { MetricLine } from '../core/types'
import type { TrayMeter } from './trayIcon'

// What the tray shows, derived from AppState. Pure (no Electron), so it's unit-tested.

export const WINDOWS_TOOLTIP_LIMIT = 127

/** The first two pinned bounded metrics, as bars filled the way the dashboard shows them. */
export function trayMeters(state: AppState, now: Date): TrayMeter[] {
  const meters: TrayMeter[] = []
  for (const pin of pinnedMetrics(state)) {
    if (pin.line.type !== 'progress') continue
    meters.push({
      fraction: barFraction(pin.line, state.settings.displayMode),
      tone: severityOf(
        meterState(pin.line, {
          now,
          resetMode: state.settings.resetMode,
          ...(pin.metric.sessionStartSignal ? { sessionStartSignal: pin.metric.sessionStartSignal } : {})
        })
      )
    })
    if (meters.length === 2) break
  }
  return meters
}

function lineReading(line: MetricLine, state: AppState): string | undefined {
  switch (line.type) {
    case 'progress':
      return `${trayValue(line, state.settings.displayMode)} ${state.settings.displayMode}`
    case 'values':
      return line.values[0] ? formatValue(line.values[0], 'tray') : undefined
    case 'badge':
      return line.text
    case 'text':
      return line.value
  }
}

/** "Claude: Session 62% left · Weekly 29% left", one provider per line, within Windows' limit. */
export function trayTooltip(state: AppState): string {
  const byProvider = new Map<string, { name: string; pins: PinnedMetric[] }>()
  for (const pin of pinnedMetrics(state)) {
    const entry = byProvider.get(pin.provider.info.id) ?? { name: pin.provider.info.displayName, pins: [] }
    entry.pins.push(pin)
    byProvider.set(pin.provider.info.id, entry)
  }
  const lines = [...byProvider.values()].map(({ name, pins }) => {
    const readings = pins.flatMap((pin) => {
      const reading = lineReading(pin.line, state)
      return reading ? [`${pin.metric.title} ${reading}`] : []
    })
    return `${name}: ${readings.join(' · ')}`
  })
  const text = lines.length > 0 ? lines.join('\n') : 'AgentMaxx'
  return text.length <= WINDOWS_TOOLTIP_LIMIT ? text : `${text.slice(0, WINDOWS_TOOLTIP_LIMIT - 1)}…`
}
