import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { formatValue } from '../core/format'
import { progressHeadline, progressTrailing } from '../core/progress'
import type { AppState } from '../core/state'
import type { MetricLine } from '../core/types'

// Placeholder dashboard (UM4): plain text, proving the IPC path end to end. UM5 replaces it.

function describe(line: MetricLine, state: AppState, now: Date): string {
  switch (line.type) {
    case 'progress':
      return [progressHeadline(line, state.settings.displayMode), progressTrailing(line, { now, resetMode: state.settings.resetMode })]
        .filter(Boolean)
        .join(' · ')
    case 'values':
      return line.values.map((value) => formatValue(value, 'row')).join(' · ')
    case 'badge':
      return line.text
    case 'text':
      return line.value
  }
}

export function App(): React.JSX.Element {
  const [state, setState] = useState<AppState | undefined>(undefined)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    void window.usagemaxx.getState().then((initial) => {
      if (active) setState(initial)
    })
    const unsubscribe = window.usagemaxx.onState(setState)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.usagemaxx.hidePopup()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      active = false
      unsubscribe()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  useLayoutEffect(() => {
    if (root.current) window.usagemaxx.resizePopup(root.current.scrollHeight)
  })

  if (!state) return <div ref={root} />
  const now = new Date()
  return (
    <div ref={root} data-ready="true" style={{ padding: 12, fontFamily: 'system-ui', fontSize: 13 }}>
      {state.providers
        .filter((provider) => provider.enabled)
        .map((provider) => (
          <section key={provider.info.id} style={{ marginBottom: 10 }}>
            <strong>{provider.info.displayName}</strong>
            {provider.plan ? ` (${provider.plan})` : ''}
            {provider.error ? ` — ${provider.error.message}` : ''}
            {provider.stale ? ' — Outdated' : ''}
            <ul style={{ margin: '4px 0', paddingLeft: 16 }}>
              {provider.metrics
                .filter((metric) => metric.enabled)
                .map((metric) => (
                  <li key={metric.id}>
                    {metric.id}: {metric.line ? describe(metric.line, state, now) : 'No data'}
                  </li>
                ))}
            </ul>
          </section>
        ))}
    </div>
  )
}
