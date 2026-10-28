import { useEffect, useRef, useState } from 'react'
import type { AppState } from '../../core/state'
import { nextUpdateText } from '../../core/view'
import { MoreIcon, RefreshIcon } from './Icons'

interface FooterProps {
  state: AppState
  now: Date
  onOpenSettings: () => void
}

export function Footer({ state, now, onOpenSettings }: FooterProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menuOpen])

  const run = (action: () => void) => () => {
    setMenuOpen(false)
    action()
  }

  return (
    <footer className="footer">
      <span className="footer-version">v{state.version}</span>
      <button className="footer-update" onClick={() => void window.usagemaxx.refresh()} title="Refresh all providers now (F5)">
        {state.refreshing ? <span className="spinner" /> : <RefreshIcon size={11} />}
        {nextUpdateText(state.nextRefreshAt, state.refreshing, now)}
      </button>
      <span className="header-spacer" />
      <div ref={menu}>
        <button className="icon-button" aria-haspopup="menu" aria-expanded={menuOpen} title="Options" onClick={() => setMenuOpen((open) => !open)}>
          <MoreIcon />
        </button>
        {menuOpen ? (
          <div className="menu" role="menu">
            <button role="menuitem" onClick={run(onOpenSettings)}>
              Settings
            </button>
            <button role="menuitem" onClick={run(() => void window.usagemaxx.refresh())}>
              Refresh Now
            </button>
            <button role="menuitem" onClick={run(() => void window.usagemaxx.openExternal('https://github.com/memoliertorerr/UsageMaxx/issues'))}>
              Report an Issue…
            </button>
            <hr />
            <button role="menuitem" onClick={run(() => window.usagemaxx.quit())}>
              Quit UsageMaxx
            </button>
          </div>
        ) : null}
      </div>
    </footer>
  )
}
