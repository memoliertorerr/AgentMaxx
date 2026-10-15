import { describe, expect, it } from 'vitest'
import { computePopupPosition, taskbarEdge, type Rect } from './positioning'

// A 1920x1080 display with a 48 px taskbar, as on a default Windows 11 install.
const display: Rect = { x: 0, y: 0, width: 1920, height: 1080 }
const size = { width: 360, height: 560 }
const noCursor = { x: 0, y: 0 }

describe('taskbarEdge', () => {
  it('finds the inset edge', () => {
    expect(taskbarEdge(display, { x: 0, y: 0, width: 1920, height: 1032 }, noCursor)).toBe('bottom')
    expect(taskbarEdge(display, { x: 0, y: 48, width: 1920, height: 1032 }, noCursor)).toBe('top')
    expect(taskbarEdge(display, { x: 62, y: 0, width: 1858, height: 1080 }, noCursor)).toBe('left')
    expect(taskbarEdge(display, { x: 0, y: 0, width: 1858, height: 1080 }, noCursor)).toBe('right')
  })

  it('falls back to the edge nearest the tray icon when the taskbar auto-hides', () => {
    expect(taskbarEdge(display, display, { x: 1800, y: 1075 })).toBe('bottom')
    expect(taskbarEdge(display, display, { x: 1915, y: 500 })).toBe('right')
  })
})

describe('computePopupPosition', () => {
  it('opens above a bottom taskbar, centered on the icon and clamped to the right edge', () => {
    const position = computePopupPosition({
      trayBounds: { x: 1780, y: 1040, width: 24, height: 32 },
      cursor: noCursor,
      displayBounds: display,
      workArea: { x: 0, y: 0, width: 1920, height: 1032 },
      size
    })
    expect(position).toEqual({ x: 1920 - 360 - 12, y: 1032 - 560 - 12 })
  })

  it('centers on the icon when there is room', () => {
    const position = computePopupPosition({
      trayBounds: { x: 1000, y: 1040, width: 24, height: 32 },
      cursor: noCursor,
      displayBounds: display,
      workArea: { x: 0, y: 0, width: 1920, height: 1032 },
      size
    })
    expect(position).toEqual({ x: 1012 - 180, y: 460 })
  })

  it('opens below a top taskbar', () => {
    const position = computePopupPosition({
      trayBounds: { x: 1780, y: 8, width: 24, height: 32 },
      cursor: noCursor,
      displayBounds: display,
      workArea: { x: 0, y: 48, width: 1920, height: 1032 },
      size
    })
    expect(position.y).toBe(48 + 12)
  })

  it('opens beside a left or right taskbar, vertically centered on the icon', () => {
    const left = computePopupPosition({
      trayBounds: { x: 16, y: 900, width: 32, height: 24 },
      cursor: noCursor,
      displayBounds: display,
      workArea: { x: 62, y: 0, width: 1858, height: 1080 },
      size
    })
    expect(left).toEqual({ x: 62 + 12, y: 1080 - 560 - 12 })

    const right = computePopupPosition({
      trayBounds: { x: 1870, y: 400, width: 32, height: 24 },
      cursor: noCursor,
      displayBounds: display,
      workArea: { x: 0, y: 0, width: 1858, height: 1080 },
      size
    })
    expect(right).toEqual({ x: 1858 - 360 - 12, y: 412 - 280 })
  })

  it('works on a secondary monitor left of the primary (negative coordinates)', () => {
    const secondary: Rect = { x: -2560, y: -200, width: 2560, height: 1440 }
    const position = computePopupPosition({
      trayBounds: { x: -120, y: 1200, width: 24, height: 32 },
      cursor: noCursor,
      displayBounds: secondary,
      workArea: { x: -2560, y: -200, width: 2560, height: 1392 },
      size
    })
    expect(position).toEqual({ x: -360 - 12, y: -200 + 1392 - 560 - 12 })
  })

  it('anchors to the cursor when the tray bounds are unavailable', () => {
    const position = computePopupPosition({
      trayBounds: { x: 0, y: 0, width: 0, height: 0 },
      cursor: { x: 900, y: 1060 },
      displayBounds: display,
      workArea: { x: 0, y: 0, width: 1920, height: 1032 },
      size
    })
    expect(position).toEqual({ x: 720, y: 460 })
  })

  it('stays inside a work area smaller than the popup', () => {
    const position = computePopupPosition({
      trayBounds: { x: 250, y: 590, width: 24, height: 24 },
      cursor: noCursor,
      displayBounds: { x: 0, y: 0, width: 300, height: 600 },
      workArea: { x: 0, y: 0, width: 300, height: 560 },
      size
    })
    expect(position).toEqual({ x: 12, y: 12 })
  })
})
