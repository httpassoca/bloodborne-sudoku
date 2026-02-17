import { describe, expect, it } from 'vitest'
import { decodePuzzle, encodePuzzle } from './puzzleCode'
import type { Grid } from './sudoku'

describe('puzzleCode', () => {
  it('roundtrips a puzzle grid', () => {
    const g: Grid = Array.from({ length: 9 }, (_, r) =>
      Array.from({ length: 9 }, (_, c) => ((r * 9 + c) % 10))
    )

    const code = encodePuzzle(g)
    const out = decodePuzzle(code)
    expect(out).toEqual(g)
  })

  it('rejects invalid checksum', () => {
    const g: Grid = Array.from({ length: 9 }, () => Array(9).fill(0))
    const code = encodePuzzle(g)
    const bad = code.slice(0, -1) + (code.slice(-1) === 'A' ? 'B' : 'A')
    expect(() => decodePuzzle(bad)).toThrow()
  })
})
