import type { Settings } from '../../core/settings'
import type { MetricView } from '../../core/state'
import { progressRow, valuesText, valuesTooltip } from '../../core/view'
import { FlameIcon } from './Icons'

interface RowProps {
  metric: MetricView
  settings: Settings
  now: Date
  onToggleDisplay: () => void
  onToggleReset: () => void
}

/** One metric: a meter for bounded lines, a value for unbounded ones, "No data" without a line. */
export function MetricRow({ metric, settings, now, onToggleDisplay, onToggleReset }: RowProps): React.JSX.Element {
  const line = metric.line
  if (!line) {
    return (
      <div className="row">
        <div className="row-line">
          <span className="row-label">{metric.id}</span>
          <span className="row-nodata">No data</span>
        </div>
      </div>
    )
  }

  switch (line.type) {
    case 'progress': {
      const model = progressRow(line, metric, settings, now)
      const otherMode = settings.displayMode === 'used' ? 'left' : 'used'
      return (
        <div className="row">
          <div className="row-line">
            <span className="row-label">{metric.id}</span>
            {model.note ? (
              <span className={`note ${model.note.kind}`} title={model.barTooltip}>
                {model.note.kind === 'runOut' ? <FlameIcon /> : null}
                {model.note.text}
              </span>
            ) : null}
          </div>
          <div className="bar" title={model.barTooltip}>
            <div className={`bar-fill ${model.severity}`} style={{ width: `${model.fraction * 100}%` }} />
            {model.tick !== undefined ? <div className="bar-tick" style={{ left: `${model.tick * 100}%` }} /> : null}
          </div>
          <div className="row-line">
            <button className="headline" onClick={onToggleDisplay} title={`Show ${otherMode}`}>
              {model.headline}
            </button>
            {model.trailing ? (
              model.trailingIsReset ? (
                <button className="trailing" onClick={onToggleReset} title={model.trailingTooltip}>
                  {model.trailing}
                </button>
              ) : (
                <span className="trailing" title={model.trailingTooltip}>
                  {model.trailing}
                </span>
              )
            ) : null}
          </div>
        </div>
      )
    }
    case 'values':
      return (
        <div className="row">
          <div className="row-line">
            <span className="row-label">{metric.id}</span>
            <span className="row-value" title={valuesTooltip(line)}>
              {valuesText(line)}
            </span>
          </div>
        </div>
      )
    case 'badge':
      return (
        <div className="row">
          <div className="row-line">
            <span className="row-label">{metric.id}</span>
            <span className="badge" title={line.subtitle} style={line.colorHex ? { color: line.colorHex } : undefined}>
              {line.text}
            </span>
          </div>
        </div>
      )
    case 'text':
      return (
        <div className="row">
          <div className="row-line">
            <span className="row-label">{metric.id}</span>
            <span className="row-value">{line.value}</span>
          </div>
        </div>
      )
  }
}
