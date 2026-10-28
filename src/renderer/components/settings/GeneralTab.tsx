import { useEffect, useState } from 'react'
import type { LaunchAtLogin, SettingsChange } from '../../../core/ipc'
import type { Settings } from '../../../core/settings'
import { Segmented, Switch } from '../Controls'

// Settings → General: launch at login (the OS login-item registry, not settings.json) and how
// numbers and times read.

interface GeneralTabProps {
  settings: Settings
  change: (change: SettingsChange) => void
  notify: (message: string) => void
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="settings-row">
      <span className="settings-row-text">
        <span className="settings-row-title">{title}</span>
        {hint ? <span className="settings-row-hint">{hint}</span> : null}
      </span>
      {children}
    </div>
  )
}

export function GeneralTab({ settings, change, notify }: GeneralTabProps): React.JSX.Element {
  const [login, setLogin] = useState<LaunchAtLogin | undefined>(undefined)

  useEffect(() => {
    void window.agentmaxx.getLaunchAtLogin().then(setLogin)
  }, [])

  const setLaunchAtLogin = async (enabled: boolean) => {
    const result = await window.agentmaxx.setLaunchAtLogin(enabled)
    if (!result.ok) notify(result.reason)
    setLogin(await window.agentmaxx.getLaunchAtLogin())
  }

  return (
    <div className="settings-section">
      <div className="settings-group">
        <Row title="Launch at Login" hint={login && !login.supported ? 'Works in the installed app.' : 'Start AgentMaxx when you sign in to Windows.'}>
          <Switch checked={login?.enabled ?? false} disabled={!login?.supported} label="Launch at login" onChange={(enabled) => void setLaunchAtLogin(enabled)} />
        </Row>
      </div>

      <div className="settings-group">
        <Row title="Show Usage As">
          <Segmented
            label="Show usage as"
            value={settings.displayMode}
            options={[
              { value: 'used', label: 'Used' },
              { value: 'left', label: 'Left' }
            ]}
            onChange={(value) => change({ kind: 'displayMode', value })}
          />
        </Row>
        <Row title="Reset Times">
          <Segmented
            label="Reset times"
            value={settings.resetMode}
            options={[
              { value: 'countdown', label: 'Countdown' },
              { value: 'absolute', label: 'Exact Time' }
            ]}
            onChange={(value) => change({ kind: 'resetMode', value })}
          />
        </Row>
        <Row title="Time Format">
          <Segmented
            label="Time format"
            value={settings.timeFormat}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: '12h', label: '12-Hour' },
              { value: '24h', label: '24-Hour' }
            ]}
            onChange={(value) => change({ kind: 'timeFormat', value })}
          />
        </Row>
        <Row title="Always Show Pacing" hint="Show the projection and even-pace tick on every meter, not only near a limit.">
          <Switch checked={settings.alwaysShowPacing} label="Always show pacing" onChange={(value) => change({ kind: 'alwaysShowPacing', value })} />
        </Row>
      </div>

      <div className="settings-group">
        <Row
          title="Read-only Logins"
          hint="Never renew provider logins. When one expires, its card asks you to sign in again with the provider's own app or CLI."
        >
          <Switch checked={settings.readOnlyLogins} label="Read-only logins" onChange={(value) => change({ kind: 'readOnlyLogins', value })} />
        </Row>
      </div>

      <div className="settings-group">
        <Row title="Theme">
          <Segmented
            label="Theme"
            value={settings.theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]}
            onChange={(value) => change({ kind: 'theme', value })}
          />
        </Row>
      </div>
    </div>
  )
}
