import type { ProviderInfo } from '../../core/types'

/** A letter monogram on the provider's brand color. No third-party logos are bundled. */
export function ProviderIcon({ info }: { info: ProviderInfo }): React.JSX.Element {
  const letter = info.displayName.replace(/[^\p{L}\p{N}]/gu, '').charAt(0).toUpperCase() || '?'
  return (
    <span className="provider-icon" style={{ background: info.brandColor }} aria-hidden="true">
      {letter}
    </span>
  )
}
