import type { SettingsChange } from '../../core/ipc'
import type { Settings } from '../../core/settings'
import type { ProviderView } from '../../core/state'
import { cardSections, hasExpander, lastUpdatedText } from '../../core/view'
import { ChevronIcon, ErrorIcon, RefreshIcon, WarningIcon } from './Icons'
import { MetricRow } from './MetricRow'
import { ProviderIcon } from './ProviderIcon'

interface CardProps {
  provider: ProviderView
  settings: Settings
  now: Date
  change: (change: SettingsChange) => void
}

export function ProviderCard({ provider, settings, now, change }: CardProps): React.JSX.Element {
  const { primary, onDemand } = cardSections(provider)
  const expandable = hasExpander(provider)
  const open = expandable && provider.expanded
  const id = provider.info.id

  const rowProps = {
    settings,
    now,
    onToggleDisplay: () => change({ kind: 'displayMode', value: settings.displayMode === 'used' ? 'left' : 'used' }),
    onToggleReset: () => change({ kind: 'resetMode', value: settings.resetMode === 'countdown' ? 'absolute' : 'countdown' })
  }

  // Before the first successful refresh, an error replaces the rows instead of a column of "No data".
  const showRows = provider.hasSnapshot || !provider.error

  return (
    <section className="card" aria-label={provider.info.displayName}>
      <header className="card-header">
        <ProviderIcon info={provider.info} />
        <span className="provider-name">{provider.info.displayName}</span>
        {provider.plan ? <span className="pill">{provider.plan}</span> : null}
        {provider.stale ? (
          <span className="tag-outdated" title={lastUpdatedText(provider.refreshedAt, now)}>
            Outdated
          </span>
        ) : null}
        {provider.error && provider.hasSnapshot ? (
          <span className="error-icon" title={provider.error.message} role="img" aria-label={provider.error.message}>
            <ErrorIcon />
          </span>
        ) : null}
        {provider.warning ? (
          <span className="warning-icon" title={provider.warning} role="img" aria-label={provider.warning}>
            <WarningIcon />
          </span>
        ) : null}
        <span className="header-spacer" />
        {provider.refreshing ? (
          <span className="spinner" role="status" aria-label="Refreshing" />
        ) : (
          <button className="icon-button refresh" title={`Refresh ${provider.info.displayName}`} onClick={() => void window.usagemaxx.refreshProvider(id)}>
            <RefreshIcon />
          </button>
        )}
      </header>

      {!showRows && provider.error ? <div className="card-error">{provider.error.message}</div> : null}

      {showRows ? primary.map((metric) => <MetricRow key={metric.id} metric={metric} {...rowProps} />) : null}

      {open ? (
        <>
          {showRows && onDemand.length > 0 ? <hr className="divider" /> : null}
          {showRows ? onDemand.map((metric) => <MetricRow key={metric.id} metric={metric} {...rowProps} />) : null}
          {provider.info.links.length > 0 ? (
            <div className="links">
              {provider.info.links.map((link) => (
                <button key={link.url} className="link-button" onClick={() => void window.usagemaxx.openExternal(link.url)}>
                  {link.label}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {expandable ? (
        <div className="expander">
          <button
            className={`caret${open ? ' open' : ''}`}
            aria-expanded={open}
            aria-label={open ? 'Show less' : 'Show more'}
            onClick={() => change({ kind: 'toggleExpanded', providerId: id })}
          >
            <ChevronIcon />
          </button>
        </div>
      ) : null}
    </section>
  )
}
