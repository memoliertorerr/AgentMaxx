import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type UsageMaxxApi, type View } from '../core/ipc'
import type { AppState } from '../core/state'

// The renderer's only door into the app: a fixed set of calls, no raw ipcRenderer.

const api: UsageMaxxApi = {
  getState: () => ipcRenderer.invoke(IPC.getState),
  onState(listener) {
    const handler = (_event: Electron.IpcRendererEvent, state: AppState) => listener(state)
    ipcRenderer.on(IPC.state, handler)
    return () => {
      ipcRenderer.removeListener(IPC.state, handler)
    }
  },
  onNavigate(listener) {
    const handler = (_event: Electron.IpcRendererEvent, view: View) => listener(view)
    ipcRenderer.on(IPC.navigate, handler)
    return () => {
      ipcRenderer.removeListener(IPC.navigate, handler)
    }
  },
  refresh: () => ipcRenderer.invoke(IPC.refresh),
  refreshProvider: (providerId) => ipcRenderer.invoke(IPC.refreshProvider, providerId),
  updateSettings: (change) => ipcRenderer.invoke(IPC.updateSettings, change),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  hidePopup: () => ipcRenderer.send(IPC.hidePopup),
  resizePopup: (height) => ipcRenderer.send(IPC.resizePopup, height),
  quit: () => ipcRenderer.send(IPC.quit)
}

contextBridge.exposeInMainWorld('usagemaxx', api)
