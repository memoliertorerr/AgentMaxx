import { useCallback, useEffect, useState } from 'react'
import { API_KEY_PROVIDERS, type ApiKeyProvider } from '../../../core/apiKeys'
import type { ApiKeyEntry, ChangeResult } from '../../../core/ipc'
import { keyStatusText } from '../../../core/settingsView'
import type { AppState } from '../../../core/state'
import type { ProviderInfo } from '../../../core/types'
import { ProviderIcon } from '../ProviderIcon'

// Settings → API Keys: OpenRouter and Z.ai keys. A saved key is encrypted by the main process
// (DPAPI on Windows); the renderer sees a key only when the user asks to reveal it.

function iconInfo(state: AppState, provider: ApiKeyProvider): ProviderInfo {
  return (
    state.providers.find((candidate) => candidate.info.id === provider.id)?.info ?? {
      id: provider.id,
      displayName: provider.displayName,
      brandColor: '#6B6B75',
      links: [],
      autoEnable: true
    }
  )
}

interface KeyCardProps {
  provider: ApiKeyProvider
  info: ProviderInfo
  entry: ApiKeyEntry | undefined
  reload: () => Promise<void>
}

function KeyCard({ provider, info, entry, reload }: KeyCardProps): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [revealed, setRevealed] = useState<string | undefined>(undefined)
  const [message, setMessage] = useState<{ text: string; error: boolean } | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const status = entry?.status ?? 'notSet'
  const saved = status === 'saved' || status === 'overrideActive'

  const run = async (action: () => Promise<ChangeResult>, success: string) => {
    setBusy(true)
    try {
      const result = await action()
      setMessage(result.ok ? { text: success, error: false } : { text: result.reason, error: true })
      if (result.ok) {
        setDraft('')
        setRevealed(undefined)
      }
      await reload()
    } finally {
      setBusy(false)
    }
  }

  const toggleReveal = async () => {
    if (revealed !== undefined) {
      setRevealed(undefined)
      return
    }
    const key = await window.agentmaxx.revealKey(provider.id)
    if (key) setRevealed(key)
    else setMessage({ text: "Couldn't read the key. Save it again.", error: true })
  }

  return (
    <section className="key-card" aria-label={`${provider.displayName} API key`}>
      <div className="key-card-header">
        <ProviderIcon info={info} />
        <span className="key-card-title">
          <span className="provider-row-name">{provider.displayName}</span>
          <span className={`key-status ${status}`}>{keyStatusText(entry, provider)}</span>
        </span>
      </div>
      {revealed !== undefined ? <code className="key-reveal">{revealed}</code> : null}
      <form
        className="key-form"
        onSubmit={(event) => {
          event.preventDefault()
          void run(() => window.agentmaxx.saveKey(provider.id, draft), 'Key saved.')
        }}
      >
        <input
          className="text-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={saved ? 'Paste a new key to replace it' : `Paste your ${provider.displayName} key`}
          aria-label={`${provider.displayName} API key`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="primary-button small" disabled={busy || draft.trim() === ''}>
          Save
        </button>
      </form>
      <div className="key-actions">
        {status !== 'notSet' ? (
          <button type="button" className="text-button" onClick={() => void toggleReveal()}>
            {revealed !== undefined ? 'Hide' : 'Reveal'}
          </button>
        ) : null}
        {saved ? (
          <button type="button" className="text-button danger" disabled={busy} onClick={() => void run(() => window.agentmaxx.clearKey(provider.id), 'Saved key removed.')}>
            Clear
          </button>
        ) : null}
        <span className="header-spacer" />
        <button type="button" className="text-button" onClick={() => void window.agentmaxx.openExternal(provider.keysUrl)}>
          Get a key
        </button>
      </div>
      {message ? <p className={`key-message${message.error ? ' error' : ''}`}>{message.text}</p> : null}
    </section>
  )
}

export function ApiKeysTab({ state }: { state: AppState }): React.JSX.Element {
  const [entries, setEntries] = useState<ApiKeyEntry[] | undefined>(undefined)
  const reload = useCallback(async () => setEntries(await window.agentmaxx.getKeyStatus()), [])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <div className="settings-section">
      <p className="hint">Keys are encrypted with Windows DPAPI and kept on this PC only. A saved key is used instead of an environment variable.</p>
      {API_KEY_PROVIDERS.map((provider) => (
        <KeyCard
          key={provider.id}
          provider={provider}
          info={iconInfo(state, provider)}
          entry={entries?.find((entry) => entry.providerId === provider.id)}
          reload={reload}
        />
      ))}
    </div>
  )
}
