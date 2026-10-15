import { encodePng } from '../core/png'

// The tray icon, drawn in code: up to two horizontal usage bars for pinned metrics, or the app
// mark (a three-quarter gauge ring) when nothing is pinned. Rendered with 4x4 supersampling so
// edges stay smooth at 16, 24, and 32 px (100%, 150%, 200% display scaling).

export type Tone = 'normal' | 'warning' | 'critical'

export interface TrayMeter {
  /** Bar fill, 0...1. */
  fraction: number
  tone: Tone
}

type RGBA = readonly [number, number, number, number]

const TONE_COLORS: Record<Tone, RGBA> = {
  normal: [59, 130, 246, 255], // blue-500
  warning: [245, 158, 11, 255], // amber-500
  critical: [239, 68, 68, 255] // red-500
}
// Mid-gray at partial opacity reads on both the dark (default) and light Windows taskbar.
const TRACK: RGBA = [140, 140, 140, 150]
const MARK: RGBA = [59, 130, 246, 255]
const MARK_TRACK: RGBA = [140, 140, 140, 140]

const SAMPLES = 4

type Shader = (x: number, y: number) => RGBA | undefined

/** Supersamples `shade` over each pixel and composites the coverage-weighted color. */
function rasterize(size: number, shade: Shader): Uint8Array {
  const rgba = new Uint8Array(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const color = shade(px + (sx + 0.5) / SAMPLES, py + (sy + 0.5) / SAMPLES)
          if (!color) continue
          const alpha = color[3] / 255
          r += color[0] * alpha
          g += color[1] * alpha
          b += color[2] * alpha
          a += alpha
        }
      }
      const i = (py * size + px) * 4
      if (a > 0) {
        rgba[i] = Math.round(r / a)
        rgba[i + 1] = Math.round(g / a)
        rgba[i + 2] = Math.round(b / a)
        rgba[i + 3] = Math.round((a / (SAMPLES * SAMPLES)) * 255)
      }
    }
  }
  return rgba
}

interface Box {
  x: number
  y: number
  width: number
  height: number
  radius: number
}

function insideRoundedBox(px: number, py: number, box: Box): boolean {
  if (px < box.x || px > box.x + box.width || py < box.y || py > box.y + box.height) return false
  const r = Math.min(box.radius, box.width / 2, box.height / 2)
  const cx = Math.min(Math.max(px, box.x + r), box.x + box.width - r)
  const cy = Math.min(Math.max(py, box.y + r), box.y + box.height - r)
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0
}

function barsShader(meters: readonly TrayMeter[], size: number): Shader {
  const pad = size / 16
  const gap = size / 8
  const count = meters.length
  const height = count === 1 ? size / 2 : (size - 2 * pad - gap) / 2
  const top = count === 1 ? (size - height) / 2 : pad
  const boxes = meters.map((meter, index) => {
    const track: Box = { x: pad, y: top + index * (height + gap), width: size - 2 * pad, height, radius: height / 3 }
    return { track, fillWidth: track.width * clamp01(meter.fraction), color: TONE_COLORS[meter.tone] }
  })
  return (x, y) => {
    for (const { track, fillWidth, color } of boxes) {
      if (!insideRoundedBox(x, y, track)) continue
      return x <= track.x + fillWidth ? color : TRACK
    }
    return undefined
  }
}

function markShader(size: number): Shader {
  const c = size / 2
  const outer = size / 2 - size / 32
  const inner = outer - size / 5
  // The gauge's lit arc runs clockwise from 135° (lower left) through the top to 405°/45°,
  // leaving the bottom quarter as track.
  return (x, y) => {
    const dx = x - c
    const dy = y - c
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance > outer || distance < inner) return undefined
    const degrees = (Math.atan2(dy, dx) * 180) / Math.PI // 0° = right, 90° = down
    const inGap = degrees > 45 && degrees < 135
    return inGap ? MARK_TRACK : MARK
  }
}

/** Raw RGBA pixels (size × size × 4) for the given meters; the app mark when there are none. */
export function renderTrayIconPixels(meters: readonly TrayMeter[], size: number): Uint8Array {
  const shown = meters.slice(0, 2)
  return rasterize(size, shown.length > 0 ? barsShader(shown, size) : markShader(size))
}

/** PNG bytes for the tray icon at `size` px. */
export function renderTrayIcon(meters: readonly TrayMeter[], size: number): Buffer {
  return encodePng(size, size, renderTrayIconPixels(meters, size))
}

/** The sizes Windows asks for at 100%, 150%, and 200% scaling, with their scale factors. */
export const TRAY_ICON_SIZES: ReadonlyArray<{ size: number; scaleFactor: number }> = [
  { size: 16, scaleFactor: 1 },
  { size: 24, scaleFactor: 1.5 },
  { size: 32, scaleFactor: 2 }
]
