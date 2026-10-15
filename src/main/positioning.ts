// Where the popup opens: next to the tray icon, on the taskbar's edge, fully inside the work
// area. Pure, so every taskbar placement is unit-tested without a display.

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export type TaskbarEdge = 'bottom' | 'top' | 'left' | 'right'

export interface PopupPositionInput {
  /** The tray icon's screen bounds; empty when the platform can't report them. */
  trayBounds: Rect
  /** Used when trayBounds is empty. */
  cursor: Point
  displayBounds: Rect
  workArea: Rect
  size: { width: number; height: number }
  /** Gap between the popup and the taskbar / screen edges. */
  margin?: number
}

const DEFAULT_MARGIN = 12

function center(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function hasArea(rect: Rect): boolean {
  return rect.width > 0 && rect.height > 0
}

/**
 * The edge the taskbar sits on: the side where the work area is inset from the display. With
 * no inset (an auto-hiding taskbar), the display edge nearest the anchor point.
 */
export function taskbarEdge(displayBounds: Rect, workArea: Rect, anchor: Point): TaskbarEdge {
  const insets: Array<[TaskbarEdge, number]> = [
    ['bottom', displayBounds.y + displayBounds.height - (workArea.y + workArea.height)],
    ['top', workArea.y - displayBounds.y],
    ['left', workArea.x - displayBounds.x],
    ['right', displayBounds.x + displayBounds.width - (workArea.x + workArea.width)]
  ]
  const [largest] = [...insets].sort((a, b) => b[1] - a[1])
  if (largest && largest[1] > 0) return largest[0]

  const distances: Array<[TaskbarEdge, number]> = [
    ['bottom', displayBounds.y + displayBounds.height - anchor.y],
    ['top', anchor.y - displayBounds.y],
    ['left', anchor.x - displayBounds.x],
    ['right', displayBounds.x + displayBounds.width - anchor.x]
  ]
  const [nearest] = [...distances].sort((a, b) => a[1] - b[1])
  return nearest ? nearest[0] : 'bottom'
}

function clamp(value: number, min: number, max: number): number {
  return max < min ? min : Math.min(Math.max(value, min), max)
}

export function computePopupPosition(input: PopupPositionInput): Point {
  const margin = input.margin ?? DEFAULT_MARGIN
  const { workArea: area, size } = input
  const anchor = hasArea(input.trayBounds) ? center(input.trayBounds) : input.cursor
  const edge = taskbarEdge(input.displayBounds, area, anchor)

  let x: number
  let y: number
  switch (edge) {
    case 'bottom':
      x = anchor.x - size.width / 2
      y = area.y + area.height - size.height - margin
      break
    case 'top':
      x = anchor.x - size.width / 2
      y = area.y + margin
      break
    case 'left':
      x = area.x + margin
      y = anchor.y - size.height / 2
      break
    case 'right':
      x = area.x + area.width - size.width - margin
      y = anchor.y - size.height / 2
      break
  }

  return {
    x: Math.round(clamp(x, area.x + margin, area.x + area.width - size.width - margin)),
    y: Math.round(clamp(y, area.y + margin, area.y + area.height - size.height - margin))
  }
}
