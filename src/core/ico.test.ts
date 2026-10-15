import { describe, expect, it } from 'vitest'
import { encodeIco } from './ico'
import { encodePng } from './png'

const png = (size: number) => encodePng(size, size, new Uint8Array(size * size * 4).fill(200))

describe('encodeIco', () => {
  it('writes a header, one directory entry per image, and the PNGs at their offsets', () => {
    const images = [16, 256].map((size) => ({ size, png: png(size) }))
    const ico = encodeIco(images)
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 2])

    const entry = (index: number) => ico.subarray(6 + 16 * index, 22 + 16 * index)
    expect([entry(0).readUInt8(0), entry(0).readUInt8(1), entry(0).readUInt16LE(6)]).toEqual([16, 16, 32])
    // 256 px is stored as 0 in the one-byte size fields.
    expect([entry(1).readUInt8(0), entry(1).readUInt8(1)]).toEqual([0, 0])

    for (const [index, image] of images.entries()) {
      const length = entry(index).readUInt32LE(8)
      const offset = entry(index).readUInt32LE(12)
      expect(length).toBe(image.png.length)
      expect(ico.subarray(offset, offset + length).equals(image.png)).toBe(true)
    }
    expect(ico.length).toBe(6 + 32 + images[0]!.png.length + images[1]!.png.length)
  })

  it('rejects an empty icon and impossible sizes', () => {
    expect(() => encodeIco([])).toThrow()
    expect(() => encodeIco([{ size: 512, png: png(1) }])).toThrow()
  })
})
