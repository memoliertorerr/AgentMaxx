import { contextBridge } from 'electron'

// The renderer's only door into the app. UM4 fills this with the typed IPC API.
contextBridge.exposeInMainWorld('usagemaxx', {})
