import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { SettingsChange, SettingsTab, View } from '../core/ipc'
import { parseRoute, type Route } from '../core/settingsView'
import { Footer } from './components/Footer'
import { ProviderCard } from './components/ProviderCard'
import { Welcome } from './components/Welcome'
import { SettingsScreen } from './components/settings/SettingsScreen'
import { useAppState } from './hooks/useAppState'
import { useNow } from './hooks/useNow'

const TOAST_MS = 2500

export function App(): React.JSX.Element {
  const [route, setRoute] = useState<Route>({ screen: 'dashboard' })
  const [toast, setToast] = useState<string | undefined>(undefined)
  const navigate = useCallback((next: View) => setRoute(parseRoute(next)), [])
  const state = useAppState(navigate)
  const now = useNow()
  const content = useRef<HTMLDivElement>(null)
  const footer = useRef<HTMLDivElement>(null)

  const change = useCallback(async (settingsChange: SettingsChange) => {
    const result = await window.agentmaxx.updateSettings(settingsChange)
    if (!result.ok) setToast(result.reason)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(undefined), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const openSettings = useCallback((tab: SettingsTab | 'dashboard', providerId?: string) => {
    setRoute(tab === 'dashboard' ? { screen: 'dashboard' } : { screen: 'settings', tab, ...(providerId ? { providerId } : {}) })
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Back out one level: a provider's metrics → the list → the dashboard → hide.
        if (route.screen === 'settings' && route.providerId) setRoute({ screen: 'settings', tab: 'providers' })
        else if (route.screen === 'settings') setRoute({ screen: 'dashboard' })
        else window.agentmaxx.hidePopup()
      } else if (event.key === 'F5') {
        event.preventDefault()
        void window.agentmaxx.refresh()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [route])

  // The popup sizes itself to its content (main clamps it); past the cap, the list scrolls.
  const reportHeight = useCallback(() => {
    if (!content.current) return
    const footerHeight = footer.current?.offsetHeight ?? 0
    // Round up: scrollHeight is rounded, and a fractional overflow would still show a scrollbar.
    const contentHeight = Math.ceil(Math.max(content.current.scrollHeight, content.current.getBoundingClientRect().height))
    window.agentmaxx.resizePopup(contentHeight + footerHeight + 2)
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
  const screen = state.firstRun ? 'welcome' : route.screen === 'settings' ? `settings-${route.tab}` : 'dashboard'

  return (
    <div className="app" data-ready="true" data-view={screen}>
      <div className="scroll">
        <div className="content" ref={content}>
          {state.firstRun ? (
            <Welcome state={state} complete={(enabledProviders) => void change({ kind: 'completeFirstRun', enabledProviders })} />
          ) : route.screen === 'settings' ? (
            <SettingsScreen state={state} tab={route.tab} providerId={route.providerId} navigate={openSettings} change={change} notify={setToast} />
          ) : enabled.length === 0 ? (
            <div className="empty">
              <h2>No Providers On</h2>
              <span>Pick the AI tools you use to see their limits here.</span>
              <button className="primary-button" onClick={() => openSettings('providers')}>
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
        <Footer state={state} now={now} onOpenSettings={() => openSettings('providers')} />
      </div>
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  )
}
