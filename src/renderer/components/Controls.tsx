// Small form controls shared by the welcome and Settings screens.

interface SwitchProps {
  checked: boolean
  label: string
  disabled?: boolean
  onChange: (checked: boolean) => void
}

/** A Windows-style toggle switch. `label` names it for screen readers. */
export function Switch({ checked, label, disabled, onChange }: SwitchProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`switch${checked ? ' on' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onChange(!checked)
      }}
    >
      <span className="switch-knob" />
    </button>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  label: string
  onChange: (value: T) => void
}

/** A row of mutually exclusive choices (a radio group drawn as one control). */
export function Segmented<T extends string>({ value, options, label, onChange }: SegmentedProps<T>): React.JSX.Element {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? 'selected' : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface CheckboxProps {
  checked: boolean
  label: string
  disabled?: boolean
  onChange: (checked: boolean) => void
}

export function Checkbox({ checked, label, disabled, onChange }: CheckboxProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`checkbox${checked ? ' on' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onChange(!checked)
      }}
    >
      {checked ? (
        <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" d="m3 8.5 3.2 3L13 4.5" />
        </svg>
      ) : null}
    </button>
  )
}
