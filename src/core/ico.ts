// A minimal ICO writer: each image is stored as a PNG (the "PNG-in-ICO" form Windows has read since
// Vista), so the app icon is drawn in code like the tray icon, with no image dependency.

export interface IcoImage {
  /** Width and height in pixels, 1...256. */
  size: number
  png: Buffer
}

const HEADER_BYTES = 6
const ENTRY_BYTES = 16

export function encodeIco(images: readonly IcoImage[]): Buffer {
  if (images.length === 0) throw new Error('an icon needs at least one image')
  const header = Buffer.alloc(HEADER_BYTES)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  const entries: Buffer[] = []
  let offset = HEADER_BYTES + ENTRY_BYTES * images.length
  for (const { size, png } of images) {
    if (!Number.isInteger(size) || size < 1 || size > 256) throw new Error(`icon size out of range: ${size}`)
    const entry = Buffer.alloc(ENTRY_BYTES)
    entry.writeUInt8(size === 256 ? 0 : size, 0) // width; 0 means 256
    entry.writeUInt8(size === 256 ? 0 : size, 1) // height
    entry.writeUInt8(0, 2) // palette colors
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)])
}
