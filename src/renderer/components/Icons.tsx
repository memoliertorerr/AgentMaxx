// Small inline icons (no icon dependency). All use currentColor.

interface IconProps {
  size?: number
}

export function WarningIcon({ size = 14 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7.13 1.98a1 1 0 0 1 1.74 0l6.03 10.5A1 1 0 0 1 14.03 14H1.97a1 1 0 0 1-.87-1.52zM8 5.25a.75.75 0 0 0-.75.75v3.25a.75.75 0 0 0 1.5 0V6A.75.75 0 0 0 8 5.25M8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2"
      />
    </svg>
  )
}

export function ChevronIcon({ size = 12 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="m4 6 4 4 4-4" />
    </svg>
  )
}

export function RefreshIcon({ size = 13 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89M13.5 2.5v3h-3"
      />
    </svg>
  )
}

export function FlameIcon({ size = 11 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.6 1.1c.4 2.1-.5 3.3-1.6 4.5C5.8 6.9 4.5 8.3 4.5 10.5A3.5 3.5 0 0 0 8 14a3.5 3.5 0 0 0 3.5-3.5c0-1.2-.4-2.1-1-3 .1 1-.3 1.8-1 2.2.2-2.6-.5-5.3-1.9-8.6"
      />
    </svg>
  )
}

export function MoreIcon({ size = 14 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="3.5" cy="8" r="1.3" fill="currentColor" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.3" fill="currentColor" />
    </svg>
  )
}

export function BackIcon({ size = 14 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" d="M10 3.5 5.5 8l4.5 4.5" />
    </svg>
  )
}

export function ErrorIcon({ size = 14 }: IconProps): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13m0 3a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 4.5m0 7.25a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8"
      />
    </svg>
  )
}
