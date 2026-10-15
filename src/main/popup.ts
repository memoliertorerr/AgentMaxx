import path from 'node:path'
import { BrowserWindow, screen, type Rectangle } from 'electron'
import type { Logger } from '../core/runtime'
import { computePopupPosition } from './positioning'

// The dashboard popup: a frameless, always-on-top window that opens next to the tray icon and
// hides when it loses focus, like the Windows clock and volume flyouts.

export const POPUP_WIDTH = 360
export const POPUP_MAX_HEIGHT = 600
const POPUP_MIN_HEIGHT = 160
// A click on the tray icon blurs (and hides) the popup just before the click arrives; ignore
// that click so it doesn't immediately reopen the popup.
const REOPEN_GUARD_MS = 250

export class Popup {
  readonly window: BrowserWindow
  private lastHiddenByBlur = 0
  private height = 480
  private anchor: Rectangle | undefined

  constructor(
    private readonly log: Logger,
    private readonly options: { preloadPath: string; keepOpenOnBlur?: boolean }
  ) {
    this.window = new BrowserWindow({
      width: POPUP_WIDTH,
      height: this.height,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      // "toolbar" keeps the popup out of Alt+Tab on Windows.
      ...(process.platform === 'win32' ? { type: 'toolbar' } : {}),
      title: 'UsageMaxx',
      backgroundColor: '#00000000',
      webPreferences: {
        preload: options.preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false
      }
    })
    this.window.setMenu(null)
    this.window.on('blur', () => {
      if (this.options.keepOpenOnBlur) return
      this.lastHiddenByBlur = Date.now()
      this.window.hide()
    })
    this.window.webContents.on('render-process-gone', (_event, details) => {
      this.log.error('popup', `renderer exited: ${details.reason}`)
    })
    // The renderer never navigates; links open in the browser through IPC.
    this.window.webContents.on('will-navigate', (event) => event.preventDefault())
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  }

  async load(): Promise<void> {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) await this.window.loadURL(devUrl)
    else await this.window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  get visible(): boolean {
    return this.window.isVisible()
  }

  toggle(trayBounds: Rectangle): void {
    if (this.window.isVisible()) {
      this.hide()
      return
    }
    if (Date.now() - this.lastHiddenByBlur < REOPEN_GUARD_MS) return
    this.show(trayBounds)
  }

  show(trayBounds: Rectangle): void {
    this.anchor = trayBounds
    this.place()
    this.window.show()
    this.window.focus()
  }

  hide(): void {
    this.window.hide()
  }

  /** Called by the renderer with its content height; clamped to sane bounds. */
  setContentHeight(height: number): void {
    if (!Number.isFinite(height)) return
    const next = Math.round(Math.min(Math.max(height, POPUP_MIN_HEIGHT), POPUP_MAX_HEIGHT))
    if (next === this.height) return
    this.height = next
    if (this.window.isVisible()) this.place()
    else this.window.setSize(POPUP_WIDTH, next)
  }

  private place(): void {
    const cursor = screen.getCursorScreenPoint()
    const anchor = this.anchor ?? { x: 0, y: 0, width: 0, height: 0 }
    const hasAnchor = anchor.width > 0 && anchor.height > 0
    const display = screen.getDisplayNearestPoint(hasAnchor ? { x: anchor.x, y: anchor.y } : cursor)
    const position = computePopupPosition({
      trayBounds: anchor,
      cursor,
      displayBounds: display.bounds,
      workArea: display.workArea,
      size: { width: POPUP_WIDTH, height: this.height }
    })
    this.window.setBounds({ ...position, width: POPUP_WIDTH, height: this.height })
  }
}
