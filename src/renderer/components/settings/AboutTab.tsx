import { AppMark } from '../AppMark'

const REPO_URL = 'https://github.com/memoliertorerr/UsageMaxx'
const UPSTREAM_URL = 'https://github.com/robinebers/openusage'

export function AboutTab({ version }: { version: string }): React.JSX.Element {
  return (
    <div className="settings-section about">
      <AppMark size={44} />
      <h2>UsageMaxx</h2>
      <span className="about-version">Version {version}</span>
      <p>Your AI coding limits in the Windows tray.</p>
      <p className="notice">Unofficial Windows port of OpenUsage by Robin Ebers. Not affiliated.</p>
      <div className="about-links">
        <button type="button" className="link-button" onClick={() => void window.usagemaxx.openExternal(REPO_URL)}>
          GitHub
        </button>
        <button type="button" className="link-button" onClick={() => void window.usagemaxx.openExternal(`${REPO_URL}/issues`)}>
          Report an Issue
        </button>
        <button type="button" className="link-button" onClick={() => void window.usagemaxx.openExternal(UPSTREAM_URL)}>
          Original Project
        </button>
      </div>
      <span className="about-license">MIT License · credentials stay on this PC</span>
    </div>
  )
}
