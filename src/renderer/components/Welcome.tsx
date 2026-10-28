import { useEffect, useState } from 'react'
import type { AppState } from '../../core/state'
import { welcomeChoices } from '../../core/settingsView'
import type { ProviderInfo } from '../../core/types'
import { AppMark } from './AppMark'
import { Checkbox } from './Controls'
import { ProviderIcon } from './ProviderIcon'

// First run: providers signed in on this PC are found (locally, never over the network) and
// preselected. Continue turns the selection on; Choose Later turns nothing on.

interface WelcomeProps {
  state: AppState
  complete: (providerIds: string[]) => void
}

function ChoiceRow({ info, selected, toggle }: { info: ProviderInfo; selected: boolean; toggle: () => void }): React.JSX.Element {
  return (
    <li>
      <button type="button" className="choice-row" onClick={toggle}>
        <ProviderIcon info={info} />
        <span className="choice-name">{info.displayName}</span>
        <Checkbox checked={selected} label={`Track ${info.displayName}`} onChange={toggle} />
      </button>
    </li>
  )
}

export function Welcome({ state, complete }: WelcomeProps): React.JSX.Element {
  const [detected, setDetected] = useState<Record<string, boolean> | undefined>(undefined)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let active = true
    void window.agentmaxx.detectProviders().then((result) => {
      if (!active) return
      setDetected(result)
      setSelected(new Set(welcomeChoices(state.providers, result).found.map((info) => info.id)))
    })
    return () => {
      active = false
    }
    // Detection runs once per welcome screen; later state pushes mustn't reset the selection.
  }, [])

  const toggle = (id: string) => () =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const choices = detected ? welcomeChoices(state.providers, detected) : undefined
  // Keep registry order when submitting.
  const chosen = state.providers.map((provider) => provider.info.id).filter((id) => selected.has(id))

  return (
    <div className="welcome">
      <div className="welcome-header">
        <AppMark size={36} />
        <h1>Welcome to AgentMaxx</h1>
        <p>Choose the AI tools whose limits you want in the tray. You can change this later in Settings.</p>
      </div>

      {!choices ? (
        <div className="welcome-loading" role="status">
          <span className="spinner" /> Looking for AI tools on this PC…
        </div>
      ) : (
        <>
          <div className="section-label">{choices.found.length > 0 ? 'Signed in on this PC' : 'No signed-in tools found'}</div>
          {choices.found.length > 0 ? (
            <ul className="choice-list">
              {choices.found.map((info) => (
                <ChoiceRow key={info.id} info={info} selected={selected.has(info.id)} toggle={toggle(info.id)} />
              ))}
            </ul>
          ) : (
            <p className="hint">Sign in to a tool's own app or CLI, or pick from all providers below.</p>
          )}
          {choices.others.length > 0 ? (
            showAll || choices.found.length === 0 ? (
              <>
                <div className="section-label">Other providers</div>
                <ul className="choice-list">
                  {choices.others.map((info) => (
                    <ChoiceRow key={info.id} info={info} selected={selected.has(info.id)} toggle={toggle(info.id)} />
                  ))}
                </ul>
              </>
            ) : (
              <button type="button" className="text-button" onClick={() => setShowAll(true)}>
                Show all providers ({choices.others.length} more)
              </button>
            )
          ) : null}
        </>
      )}

      <div className="welcome-actions">
        <button type="button" className="secondary-button" onClick={() => complete([])}>
          Choose Later
        </button>
        <button type="button" className="primary-button" disabled={!choices || chosen.length === 0} onClick={() => complete(chosen)}>
          Continue
        </button>
      </div>
    </div>
  )
}
