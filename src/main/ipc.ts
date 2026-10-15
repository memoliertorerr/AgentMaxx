import { ipcMain, shell } from 'electron'
import { apiKeyProvider } from '../core/apiKeys'
import { toErrorInfo } from '../core/errors'
import { IPC, applySettingsChange, isSafeExternalUrl, parseSettingsChange, type ApiKeyEntry, type ChangeResult, type LaunchAtLogin } from '../core/ipc'
import type { Logger } from '../core/runtime'
import type { ApiKeyVault } from './apiKeys'
import type { LoginItem } from './loginItem'
import type { Popup } from './popup'
import type { AppStore } from './store'

// Main-process handlers for the renderer's requests. Every payload is validated here; the
// renderer is treated as untrusted input.

export interface IpcDependencies {
  store: AppStore
  popup: Popup
  keys: ApiKeyVault
  loginItem: LoginItem
  log: Logger
  quit: () => void
}

export function registerIpc(deps: IpcDependencies): void {
  const { store, popup, keys, loginItem, log } = deps
  const fromPopup = (event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent) =>
    event.sender.id === popup.window.webContents.id

  ipcMain.handle(IPC.getState, (event) => {
    if (!fromPopup(event)) throw new Error('unknown sender')
    return store.getState()
  })

  ipcMain.handle(IPC.refresh, async (event) => {
    if (!fromPopup(event)) return
    await store.refreshAll(true)
  })

  ipcMain.handle(IPC.refreshProvider, async (event, providerId: unknown) => {
    if (!fromPopup(event) || typeof providerId !== 'string') return
    if (!store.providers.some((provider) => provider.info.id === providerId)) return
    await store.refreshProvider(providerId)
  })

  ipcMain.handle(IPC.updateSettings, async (event, raw: unknown): Promise<ChangeResult> => {
    if (!fromPopup(event)) return { ok: false, reason: 'Unknown sender' }
    const change = parseSettingsChange(raw)
    if (!change) {
      log.warn('ipc', 'rejected a malformed settings change')
      return { ok: false, reason: 'Invalid change' }
    }
    const catalog = {
      order: store.providers.map((provider) => provider.info.id),
      descriptors: (id: string) => store.providers.find((provider) => provider.info.id === id)?.metrics
    }
    const result = applySettingsChange(store.getSettings(), change, catalog)
    if (!result.ok) return result
    await store.updateSettings(() => result.settings)
    return { ok: true }
  })

  ipcMain.handle(IPC.openExternal, async (event, url: unknown) => {
    if (!fromPopup(event)) return
    if (!isSafeExternalUrl(url)) {
      log.warn('ipc', 'refused to open a non-web link')
      return
    }
    await shell.openExternal(url)
  })

  ipcMain.on(IPC.hidePopup, (event) => {
    if (fromPopup(event)) popup.hide()
  })

  ipcMain.on(IPC.resizePopup, (event, height: unknown) => {
    if (fromPopup(event) && typeof height === 'number') popup.setContentHeight(height)
  })

  ipcMain.on(IPC.quit, (event) => {
    if (fromPopup(event)) deps.quit()
  })

  // A key change takes effect at once for an enabled provider.
  const refreshIfEnabled = (providerId: string) => {
    if (store.getSettings().enabledProviders?.includes(providerId)) void store.refreshProvider(providerId)
  }

  ipcMain.handle(IPC.getKeyStatus, async (event): Promise<ApiKeyEntry[]> => {
    if (!fromPopup(event)) return []
    return keys.statuses()
  })

  ipcMain.handle(IPC.saveKey, async (event, providerId: unknown, key: unknown): Promise<ChangeResult> => {
    if (!fromPopup(event)) return { ok: false, reason: 'Unknown sender' }
    const provider = apiKeyProvider(providerId)
    if (!provider) return { ok: false, reason: 'Unknown provider' }
    const result = await keys.save(provider.id, key)
    if (result.ok) refreshIfEnabled(provider.id)
    return result
  })

  ipcMain.handle(IPC.clearKey, async (event, providerId: unknown): Promise<ChangeResult> => {
    if (!fromPopup(event)) return { ok: false, reason: 'Unknown sender' }
    const provider = apiKeyProvider(providerId)
    if (!provider) return { ok: false, reason: 'Unknown provider' }
    const result = await keys.clear(provider.id)
    if (result.ok) refreshIfEnabled(provider.id)
    return result
  })

  ipcMain.handle(IPC.revealKey, async (event, providerId: unknown): Promise<string | undefined> => {
    const provider = apiKeyProvider(providerId)
    if (!fromPopup(event) || !provider) return undefined
    try {
      return await keys.reveal(provider.id)
    } catch (error) {
      log.warn('ipc', `couldn't reveal the ${provider.id} key: ${toErrorInfo(error).message}`)
      return undefined
    }
  })

  ipcMain.handle(IPC.detectProviders, async (event): Promise<Record<string, boolean>> => {
    if (!fromPopup(event)) return {}
    return store.detectLocalCredentials()
  })

  ipcMain.handle(IPC.getLaunchAtLogin, (event): LaunchAtLogin => {
    if (!fromPopup(event)) return { supported: false, enabled: false }
    return loginItem.get()
  })

  ipcMain.handle(IPC.setLaunchAtLogin, (event, enabled: unknown): ChangeResult => {
    if (!fromPopup(event)) return { ok: false, reason: 'Unknown sender' }
    if (typeof enabled !== 'boolean') return { ok: false, reason: 'Invalid change' }
    return loginItem.set(enabled)
  })
}
