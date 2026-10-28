import { Menu, Tray, nativeImage, type NativeImage, type Rectangle } from 'electron'
import type { AppState } from '../core/state'
import { TRAY_ICON_SIZES, renderTrayIcon, type TrayMeter } from './trayIcon'
import { trayMeters, trayTooltip } from './trayModel'

// The notification-area icon: pinned meters as bars, pinned readings in the tooltip, left click
// toggles the popup, right click opens a small menu.

export interface TrayActions {
  togglePopup(bounds: Rectangle): void
  refresh(): void
  openSettings(bounds: Rectangle): void
  quit(): void
}

export function buildTrayImage(meters: readonly TrayMeter[]): NativeImage {
  const image = nativeImage.createEmpty()
  for (const { size, scaleFactor } of TRAY_ICON_SIZES) {
    image.addRepresentation({ scaleFactor, buffer: renderTrayIcon(meters, size) })
  }
  return image
}

export class TrayController {
  private readonly tray: Tray
  private iconKey = ''
  private tooltip = ''

  constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(buildTrayImage([]))
    this.tray.setToolTip('AgentMaxx')
    this.tray.on('click', (_event, bounds) => this.actions.togglePopup(bounds))
    this.tray.on('right-click', () => this.tray.popUpContextMenu(this.menu()))
  }

  get bounds(): Rectangle {
    return this.tray.getBounds()
  }

  update(state: AppState, now: Date): void {
    const meters = trayMeters(state, now)
    const key = JSON.stringify(meters.map((meter) => [Math.round(meter.fraction * 100), meter.tone]))
    if (key !== this.iconKey) {
      this.iconKey = key
      this.tray.setImage(buildTrayImage(meters))
    }
    const tooltip = trayTooltip(state)
    if (tooltip !== this.tooltip) {
      this.tooltip = tooltip
      this.tray.setToolTip(tooltip)
    }
  }

  destroy(): void {
    this.tray.destroy()
  }

  private menu(): Menu {
    return Menu.buildFromTemplate([
      { label: 'Refresh Now', click: () => this.actions.refresh() },
      { label: 'Settings', click: () => this.actions.openSettings(this.tray.getBounds()) },
      { type: 'separator' },
      { label: 'Quit AgentMaxx', click: () => this.actions.quit() }
    ])
  }
}
