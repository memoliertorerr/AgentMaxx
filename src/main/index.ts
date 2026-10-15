import { join } from 'node:path'
import { app, nativeTheme } from 'electron'
import { IPC } from '../core/ipc'
import { createProviders } from '../core/providers/registry'
import type { Theme } from '../core/settings'
import { createContextFactory } from './context'
import { registerIpc } from './ipc'
import { createFileLogger } from './log'
import { Popup } from './popup'
import { TrayController } from './tray'
import { AppStore } from './store'

// Composition root: builds the providers, the store, the popup, and the tray, and connects them.

const demo = process.env.USAGEMAXX_DEMO === '1'
const smoke = process.env.USAGEMAXX_SMOKE === '1'
const smokeShow = process.env.USAGEMAXX_SMOKE_SHOW === '1'
const forcedTheme = process.env.USAGEMAXX_THEME

// Development runs keep the app's data inside the repo (scripts/env.sh sets this), so nothing is
// written to the user's real profile while building. Demo data never mixes with real data.
const userDataOverride = process.env.USAGEMAXX_USER_DATA
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
  app.setPath('crashDumps', join(userDataOverride, 'crashes'))
  app.setAppLogsPath(join(userDataOverride, 'logs'))
}
if (demo) app.setPath('userData', join(app.getPath('userData'), 'demo'))

const BACKGROUND = { light: '#F7F7F8', dark: '#1F1F22' } as const
const TRAY_RETICK_MS = 30_000

function applyTheme(theme: Theme, popup?: Popup): void {
  const source = forcedTheme === 'light' || forcedTheme === 'dark' ? forcedTheme : theme
  if (nativeTheme.themeSource !== source) nativeTheme.themeSource = source
  popup?.window.setBackgroundColor(nativeTheme.shouldUseDarkColors ? BACKGROUND.dark : BACKGROUND.light)
}

async function main(): Promise<void> {
  await app.whenReady()
  // A tray app has no dock presence on macOS (development only; Windows is the target).
  app.dock?.hide()

  const log = createFileLogger(app.getPath('logs'), { echo: !app.isPackaged })
  log.info('app', `UsageMaxx ${app.getVersion()} starting on ${process.platform} (demo: ${demo})`)

  const providers = createProviders({ demo })
  const store = await AppStore.create({
    providers,
    userDataDir: app.getPath('userData'),
    log,
    version: app.getVersion(),
    demo,
    makeContext: createContextFactory({
      log,
      // Filled in by UM7 (Windows Credential Manager) and UM8 (saved API keys).
      secrets: { list: async () => [] },
      apiKeys: { get: async () => undefined }
    })
  })
  if (demo && store.getSettings().enabledProviders === null) {
    const ids = providers.map((provider) => provider.info.id)
    await store.updateSettings((settings) => ({ ...settings, enabledProviders: ids, knownProviders: ids }))
  }

  const popup = new Popup(log, { preloadPath: join(__dirname, '../preload/index.js'), keepOpenOnBlur: smoke })
  applyTheme(store.getSettings().theme, popup)

  let quitting = false
  const quit = async (): Promise<void> => {
    if (quitting) return
    quitting = true
    tray.destroy()
    await store.stop()
    app.exit(0)
  }

  const tray = new TrayController({
    togglePopup: (bounds) => popup.toggle(bounds),
    refresh: () => void store.refreshAll(true),
    openSettings: (bounds) => {
      popup.show(bounds)
      popup.window.webContents.send(IPC.navigate, 'settings')
    },
    quit: () => void quit()
  })

  registerIpc({ store, popup, log, quit: () => void quit() })
  store.subscribe((state) => {
    if (!popup.window.isDestroyed()) popup.window.webContents.send(IPC.state, state)
    tray.update(state, new Date())
    applyTheme(state.settings.theme, popup)
  })

  app.on('second-instance', () => popup.show(tray.bounds))
  // A tray app keeps running with its popup hidden.
  app.on('window-all-closed', () => undefined)

  await popup.load()
  tray.update(store.getState(), new Date())
  store.start()
  // Pace colors and countdowns move with the clock between refreshes.
  setInterval(() => tray.update(store.getState(), new Date()), TRAY_RETICK_MS)

  if (smoke) console.log('usagemaxx:ready')
  if (smokeShow) popup.show(tray.bounds)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  main().catch((error: unknown) => {
    console.error('UsageMaxx failed to start:', error)
    app.exit(1)
  })
}
