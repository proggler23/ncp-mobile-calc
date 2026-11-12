// Generates simple placeholder PNG icons (no external deps). Usage: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const c = Buffer.alloc(4)
  c.writeUInt32BE(crc(td))
  return Buffer.concat([len, td, c])
}

function png(size) {
  const blue = [0x1d, 0x4e, 0xd8]
  const white = [255, 255, 255]
  const rows = []
  const cx = size / 2
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx + 0.5, y - cx + 0.5) / size
      let col = blue
      if (d < 0.29) col = white // outer disc (inside maskable safe zone)
      if (Math.abs(y - cx) < size * 0.04 && d < 0.29) col = blue // band
      if (d < 0.1) col = white // centre
      if (d >= 0.07 && d < 0.1) col = blue // centre ring
      row[1 + x * 3] = col[0]
      row[2 + x * 3] = col[1]
      row[3 + x * 3] = col[2]
    }
    rows.push(row)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
for (const s of [192, 512]) writeFileSync(`public/icons/icon-${s}.png`, png(s))
console.log('icons written')
