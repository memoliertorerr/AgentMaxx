import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SettingsChange, View } from '../core/ipc'
import { Footer } from './components/Footer'
import { BackIcon } from './components/Icons'
import { ProviderCard } from './components/ProviderCard'
import { useAppState } from './hooks/useAppState'
import { useNow } from './hooks/useNow'

const TOAST_MS = 2500

export function App(): React.JSX.Element {
  const [view, setView] = useState<View>('dashboard')
  const [toast, setToast] = useState<string | undefined>(undefined)
  const navigate = useCallback((next: View) => setView(next), [])
  const state = useAppState(navigate)
  const now = useNow()
  const content = useRef<HTMLDivElement>(null)
  const footer = useRef<HTMLDivElement>(null)

  const change = useCallback(async (settingsChange: SettingsChange) => {
    const result = await window.usagemaxx.updateSettings(settingsChange)
    if (!result.ok) setToast(result.reason)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(undefined), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (view !== 'dashboard') setView('dashboard')
        else window.usagemaxx.hidePopup()
      } else if (event.key === 'F5') {
        event.preventDefault()
        void window.usagemaxx.refresh()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view])

  // The popup sizes itself to its content (main clamps it); past the cap, the list scrolls.
  const reportHeight = useCallback(() => {
    if (!content.current) return
    const footerHeight = footer.current?.offsetHeight ?? 0
    window.usagemaxx.resizePopup(content.current.scrollHeight + footerHeight + 2)
  }, [])

  useLayoutEffect(reportHeight)

  useEffect(() => {
    if (!content.current) return
    const observer = new ResizeObserver(reportHeight)
    observer.observe(content.current)
    return () => observer.disconnect()
  }, [reportHeight, state === undefined])

  if (!state) return <div className="app" />

  const enabled = state.providers.filter((provider) => provider.enabled)

  return (
    <div className="app" data-ready="true" data-view={view}>
      <div className="scroll">
        <div className="content" ref={content}>
          {view === 'settings' ? (
            <>
              <div className="screen-header">
                <button className="icon-button" aria-label="Back" onClick={() => setView('dashboard')}>
                  <BackIcon />
                </button>
                <h1>Settings</h1>
              </div>
              <div className="empty">Settings arrive in a later step of the build.</div>
            </>
          ) : enabled.length === 0 ? (
            <div className="empty">
              <h2>No Providers On</h2>
              <span>Pick the AI tools you use to see their limits here.</span>
              <button className="primary-button" onClick={() => setView('settings')}>
                Choose Providers
              </button>
            </div>
          ) : (
            enabled.map((provider) => (
              <ProviderCard key={provider.info.id} provider={provider} settings={state.settings} now={now} change={change} />
            ))
          )}
        </div>
      </div>
      <div ref={footer}>
        <Footer state={state} now={now} onOpenSettings={() => setView('settings')} />
      </div>
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
