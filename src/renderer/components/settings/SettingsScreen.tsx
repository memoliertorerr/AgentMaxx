import type { SettingsChange, SettingsTab } from '../../../core/ipc'
import { SETTINGS_TABS } from '../../../core/settingsView'
import type { AppState } from '../../../core/state'
import { BackIcon } from '../Icons'
import { AboutTab } from './AboutTab'
import { ApiKeysTab } from './ApiKeysTab'
import { GeneralTab } from './GeneralTab'
import { ProvidersTab } from './ProvidersTab'

// Settings inside the popup: a back arrow, tabs, and the tab's content. The back arrow leaves a
// provider's metrics for the provider list first, then returns to the dashboard.

interface SettingsScreenProps {
  state: AppState
  tab: SettingsTab
  providerId: string | undefined
  navigate: (tab: SettingsTab | 'dashboard', providerId?: string) => void
  change: (change: SettingsChange) => void
  notify: (message: string) => void
}

export function SettingsScreen({ state, tab, providerId, navigate, change, notify }: SettingsScreenProps): React.JSX.Element {
  const inDetail = tab === 'providers' && providerId !== undefined
  const detailName = inDetail ? state.providers.find((provider) => provider.info.id === providerId)?.info.displayName : undefined
  return (
    <>
      <div className="screen-header">
        <button type="button" className="icon-button" aria-label="Back" onClick={() => (inDetail ? navigate('providers') : navigate('dashboard'))}>
          <BackIcon />
        </button>
        <h1>{detailName ? `${detailName} Metrics` : 'Settings'}</h1>
      </div>
      {inDetail ? null : (
        <div className="tabs" role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              role="tab"
              aria-selected={candidate.id === tab}
              className={candidate.id === tab ? 'selected' : undefined}
              onClick={() => navigate(candidate.id)}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      )}
      {tab === 'providers' ? <ProvidersTab state={state} providerId={providerId} open={(id) => navigate('providers', id)} change={change} /> : null}
      {tab === 'keys' ? <ApiKeysTab state={state} /> : null}
      {tab === 'general' ? <GeneralTab settings={state.settings} change={change} notify={notify} /> : null}
      {tab === 'about' ? <AboutTab version={state.version} /> : null}
    </>
  )
}
