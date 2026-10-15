import { join } from 'node:path'
import { Menu, Tray, app, nativeImage } from 'electron'
import { encodePng } from '../core/png'

// Development runs keep the app's data inside the repo (scripts/env.sh sets this), so nothing
// is written to the user's real profile while building.
const userDataOverride = process.env.USAGEMAXX_USER_DATA
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
  app.setPath('crashDumps', join(userDataOverride, 'crashes'))
  app.setAppLogsPath(join(userDataOverride, 'logs'))
}

let tray: Tray | null = null

function placeholderIcon(): Electron.NativeImage {
  const size = 16
  const rgba = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - 7.5
      const dy = y - 7.5
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance <= 7 && distance >= 4) {
        const i = (y * size + x) * 4
        rgba.set([37, 99, 235, 255], i)
      }
    }
  }
  return nativeImage.createFromBuffer(encodePng(size, size, rgba))
}

function createTray(): void {
  tray = new Tray(placeholderIcon())
  tray.setToolTip('UsageMaxx')
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Quit UsageMaxx', click: () => app.quit() }]))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.whenReady().then(() => {
    // A tray app has no dock presence on macOS (development only; Windows is the target).
    app.dock?.hide()
    createTray()
    if (process.env.USAGEMAXX_SMOKE === '1') {
      console.log('usagemaxx:ready')
    }
  })
}
