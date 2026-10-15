import type { SettingsChange } from '../../../core/ipc'
import { PIN_LIMIT_TEXT, metricSettings, providerSummary } from '../../../core/settingsView'
import type { AppState, ProviderView } from '../../../core/state'
import { Checkbox, Switch } from '../Controls'
import { ChevronRightIcon, StarIcon } from '../Icons'
import { ProviderIcon } from '../ProviderIcon'

// Settings → Providers: every provider with an on/off switch, in registry order; a row opens that
// provider's metrics, where each can be shown, tucked behind the card's caret, or pinned to the tray.

interface ProvidersTabProps {
  state: AppState
  providerId: string | undefined
  open: (providerId: string | undefined) => void
  change: (change: SettingsChange) => void
}

export function ProvidersTab({ state, providerId, open, change }: ProvidersTabProps): React.JSX.Element {
  const detail = providerId ? state.providers.find((provider) => provider.info.id === providerId) : undefined
  if (detail) return <ProviderDetail provider={detail} change={change} />

  return (
    <div className="settings-section">
      <p className="hint">Turn on the tools you use. Open one to choose its metrics and tray pins.</p>
      <ul className="settings-list">
        {state.providers.map((provider) => (
          <li key={provider.info.id}>
            <div className={`provider-row${provider.enabled ? '' : ' off'}`}>
              <button type="button" className="provider-row-main" onClick={() => open(provider.info.id)} aria-label={`${provider.info.displayName} metrics`}>
                <ProviderIcon info={provider.info} />
                <span className="provider-row-text">
                  <span className="provider-row-name">{provider.info.displayName}</span>
                  <span className="provider-row-summary">{providerSummary(provider)}</span>
                </span>
                <span className="provider-row-chevron">
                  <ChevronRightIcon />
                </span>
              </button>
              <Switch
                checked={provider.enabled}
                label={`Show ${provider.info.displayName}`}
                onChange={(enabled) => change({ kind: 'setProviderEnabled', providerId: provider.info.id, enabled })}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProviderDetail({ provider, change }: { provider: ProviderView; change: (change: SettingsChange) => void }): React.JSX.Element {
  const id = provider.info.id
  const { rows, pinLimitReached } = metricSettings(provider)
  return (
    <div className="settings-section">
      <div className="detail-header">
        <ProviderIcon info={provider.info} />
        <span className="provider-row-name">{provider.info.displayName}</span>
        <span className="header-spacer" />
        <span className="detail-switch-label">{provider.enabled ? 'On' : 'Off'}</span>
        <Switch checked={provider.enabled} label={`Show ${provider.info.displayName}`} onChange={(enabled) => change({ kind: 'setProviderEnabled', providerId: id, enabled })} />
      </div>

      <div className="metric-table" role="table" aria-label={`${provider.info.displayName} metrics`}>
        <div className="metric-table-head" role="row">
          <span role="columnheader">Metric</span>
          <span role="columnheader" title="Pinned metrics show in the tray icon and tooltip">
            Pin
          </span>
          <span role="columnheader" title="On-demand metrics sit behind the card's caret">
            On demand
          </span>
          <span role="columnheader">Show</span>
        </div>
        {rows.map((row) => (
          <div key={row.id} className={`metric-table-row${row.enabled ? '' : ' off'}`} role="row">
            <span className="metric-name" role="cell">
              {row.title}
            </span>
            <span role="cell">
              <button
                type="button"
                className={`star${row.pinned ? ' pinned' : ''}`}
                aria-pressed={row.pinned}
                aria-label={row.pinned ? `Unpin ${row.title}` : `Pin ${row.title} to the tray`}
                title={row.canPin ? (row.pinned ? 'Unpin from the tray' : 'Pin to the tray') : PIN_LIMIT_TEXT}
                disabled={!row.canPin}
                onClick={() => change({ kind: 'togglePin', providerId: id, metricId: row.id })}
              >
                <StarIcon filled={row.pinned} />
              </button>
            </span>
            <span role="cell">
              <Checkbox
                checked={row.onDemand}
                label={`Put ${row.title} behind the caret`}
                onChange={(value) => change({ kind: 'setMetricFlag', providerId: id, metricId: row.id, flag: 'onDemand', value })}
              />
            </span>
            <span role="cell">
              <Switch checked={row.enabled} label={`Show ${row.title}`} onChange={(value) => change({ kind: 'setMetricFlag', providerId: id, metricId: row.id, flag: 'enabled', value })} />
            </span>
          </div>
        ))}
      </div>
      <p className={`hint${pinLimitReached ? ' pin-limit' : ''}`}>
        {pinLimitReached ? `${PIN_LIMIT_TEXT}. Unpin one to pin another.` : `Pinned metrics show in the tray icon and tooltip. ${PIN_LIMIT_TEXT}.`}
      </p>
    </div>
  )
}
