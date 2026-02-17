import type { Grid } from './sudoku'

// "Works forever" puzzle code: encodes the starting puzzle grid only.
// Format: BBSG1-<base64url>
// Payload: 41 bytes (81 nibbles = 41 bytes with padding) + 1 checksum byte.

const PREFIX = 'BBSG1-'

function toBase64Url(bytes: Uint8Array) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  const b64 = btoa(bin)
  return b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function fromBase64Url(s: string) {
  const b64 = s.replaceAll('-', '+').replaceAll('_', '/')
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const bin = atob(b64 + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function checksumXor(bytes: Uint8Array) {
  let x = 0
  for (const b of bytes) x ^= b
  return x & 0xff
}

export function encodePuzzle(puzzle: Grid) {
  if (!Array.isArray(puzzle) || puzzle.length !== 9 || puzzle.some((r) => !Array.isArray(r) || r.length !== 9)) {
    throw new Error('Invalid puzzle grid')
  }

  const nibbles: number[] = []
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = Number(puzzle[r][c] || 0)
      if (!Number.isInteger(v) || v < 0 || v > 9) throw new Error('Invalid cell value')
      nibbles.push(v)
    }
  }

  const byteLen = Math.ceil(nibbles.length / 2)
  const bytes = new Uint8Array(byteLen)
  for (let i = 0; i < nibbles.length; i += 2) {
    const hi = nibbles[i] & 0x0f
    const lo = (nibbles[i + 1] ?? 0) & 0x0f
    bytes[i / 2] = (hi << 4) | lo
  }

  const payload = new Uint8Array(bytes.length + 1)
  payload.set(bytes, 0)
  payload[payload.length - 1] = checksumXor(bytes)

  return PREFIX + toBase64Url(payload)
}

export function decodePuzzle(code: string): Grid {
  const s = String(code || '').trim()
  if (!s.startsWith(PREFIX)) throw new Error('Invalid code prefix')

  const payload = fromBase64Url(s.slice(PREFIX.length))
  if (payload.length < 2) throw new Error('Invalid payload')

  const bytes = payload.slice(0, payload.length - 1)
  const cs = payload[payload.length - 1]
  if (checksumXor(bytes) !== cs) throw new Error('Invalid checksum')

  const nibbles: number[] = []
  for (const b of bytes) {
    nibbles.push((b >> 4) & 0x0f)
    nibbles.push(b & 0x0f)
  }

  if (nibbles.length < 81) throw new Error('Invalid grid length')

  const grid: Grid = Array.from({ length: 9 }, () => Array(9).fill(0))
  let k = 0
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = nibbles[k++]!
      if (v < 0 || v > 9) throw new Error('Invalid cell')
      grid[r][c] = v
    }
  }
  return grid
}
