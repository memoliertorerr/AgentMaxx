import { app } from 'electron'
import type { ChangeResult, LaunchAtLogin } from '../core/ipc'
import type { Logger } from '../core/runtime'

// Launch at login through the OS login-item registry, which stays the source of truth (nothing is
// stored in settings). Development runs report it unsupported: registering an unpackaged Electron
// binary as a login item would touch the developer's real profile.

export function createLoginItem(log: Logger) {
  return {
    get(): LaunchAtLogin {
      if (!app.isPackaged) return { supported: false, enabled: false }
      return { supported: true, enabled: app.getLoginItemSettings().openAtLogin }
    },
    set(enabled: boolean): ChangeResult {
      if (!app.isPackaged) return { ok: false, reason: 'Launch at login works in the installed app.' }
      app.setLoginItemSettings({ openAtLogin: enabled })
      log.info('app', `launch at login ${enabled ? 'on' : 'off'}`)
      return { ok: true }
    }
  }
}

export type LoginItem = ReturnType<typeof createLoginItem>
