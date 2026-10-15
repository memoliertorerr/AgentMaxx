import { ipcMain, shell } from 'electron'
import { IPC, applySettingsChange, isSafeExternalUrl, parseSettingsChange, type ChangeResult } from '../core/ipc'
import type { Logger } from '../core/runtime'
import type { Popup } from './popup'
import type { AppStore } from './store'

// Main-process handlers for the renderer's requests. Every payload is validated here; the
// renderer is treated as untrusted input.

export function registerIpc(deps: { store: AppStore; popup: Popup; log: Logger; quit: () => void }): void {
  const { store, popup, log } = deps
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
}
