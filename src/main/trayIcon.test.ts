import { describe, expect, it } from 'vitest'
import { renderTrayIcon, renderTrayIconPixels } from './trayIcon'

function pixel(rgba: Uint8Array, size: number, x: number, y: number): number[] {
  const i = (y * size + x) * 4
  return [...rgba.subarray(i, i + 4)]
}

function filledColumns(rgba: Uint8Array, size: number, row: number, color: number[]): number {
  let count = 0
  for (let x = 0; x < size; x++) {
    const [r, g, b, a] = pixel(rgba, size, x, row)
    if (a === 255 && r === color[0] && g === color[1] && b === color[2]) count++
  }
  return count
}

const BLUE = [59, 130, 246]
const RED = [239, 68, 68]

describe('renderTrayIcon', () => {
  it('produces a PNG of the requested size', () => {
    for (const size of [16, 24, 32]) {
      const png = renderTrayIcon([{ fraction: 0.5, tone: 'normal' }], size)
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
      expect(png.readUInt32BE(16)).toBe(size)
      expect(png.readUInt32BE(20)).toBe(size)
    }
  })

  it('fills each bar in proportion to usage', () => {
    const size = 32
    const pixels = renderTrayIconPixels(
      [
        { fraction: 0.25, tone: 'normal' },
        { fraction: 0.75, tone: 'critical' }
      ],
      size
    )
    // Rows through the middle of each bar.
    const topRow = 7
    const bottomRow = 24
    const quarter = filledColumns(pixels, size, topRow, BLUE)
    const threeQuarters = filledColumns(pixels, size, bottomRow, RED)
    expect(quarter).toBeGreaterThanOrEqual(5)
    expect(quarter).toBeLessThanOrEqual(8)
    expect(threeQuarters).toBeGreaterThanOrEqual(19)
    expect(threeQuarters).toBeLessThanOrEqual(23)
  })

  it('leaves the bar track unfilled at zero usage', () => {
    const pixels = renderTrayIconPixels([{ fraction: 0, tone: 'normal' }], 16)
    expect(filledColumns(pixels, 16, 8, BLUE)).toBe(0)
    expect(pixel(pixels, 16, 8, 8)[3]).toBeGreaterThan(0) // track is visible
  })

  it('draws the app mark with no pinned meters', () => {
    const size = 32
    const pixels = renderTrayIconPixels([], size)
    expect(pixel(pixels, size, 16, 16)[3]).toBe(0) // hollow center
    expect(pixel(pixels, size, 16, 2)).toEqual([...BLUE, 255]) // lit arc at the top
  })

  it('draws at most two bars', () => {
    const three = renderTrayIconPixels(
      [
        { fraction: 1, tone: 'normal' },
        { fraction: 1, tone: 'normal' },
        { fraction: 1, tone: 'critical' }
      ],
      16
    )
    expect(three.some((_, i) => i % 4 === 0 && three[i] === RED[0] && three[i + 1] === RED[1])).toBe(false)
  })
})
