import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { crc32, encodePng } from './png'

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(Buffer.from('123456789', 'ascii'))).toBe(0xcbf43926)
  })
})

describe('encodePng', () => {
  it('writes a valid signature, header, and pixel data', () => {
    const rgba = new Uint8Array(2 * 2 * 4).fill(255)
    rgba[0] = 10 // first pixel red channel
    const png = encodePng(2, 2, rgba)

    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR')
    expect(png.readUInt32BE(16)).toBe(2)
    expect(png.readUInt32BE(20)).toBe(2)

    const idatStart = png.indexOf('IDAT', 0, 'ascii')
    const idatLength = png.readUInt32BE(idatStart - 4)
    const raw = inflateSync(png.subarray(idatStart + 4, idatStart + 4 + idatLength))
    expect(raw.length).toBe((2 * 4 + 1) * 2)
    expect(raw[0]).toBe(0) // filter byte
    expect(raw[1]).toBe(10)
  })

  it('rejects a buffer of the wrong size', () => {
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow(/expected 16 bytes/)
  })
})
