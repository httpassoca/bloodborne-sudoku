import { describe, expect, it } from 'vitest'
import { nextLogicalMove } from './logicSolver'
import type { Grid } from './sudoku'

describe('logicSolver', () => {
  it('finds a naked single when a cell has only one candidate', () => {
    const g: Grid = [
      [1, 2, 3, 4, 5, 6, 7, 8, 0],
      [4, 5, 6, 7, 8, 9, 1, 2, 3],
      [7, 8, 9, 1, 2, 3, 4, 5, 6],
      [2, 3, 4, 5, 6, 7, 8, 9, 1],
      [5, 6, 7, 8, 9, 1, 2, 3, 4],
      [8, 9, 1, 2, 3, 4, 5, 6, 7],
      [3, 4, 5, 6, 7, 8, 9, 1, 2],
      [6, 7, 8, 9, 1, 2, 3, 4, 5],
      [9, 1, 2, 3, 4, 5, 6, 7, 8],
    ]

    // missing number in (0,8) is 9
    const m = nextLogicalMove(g)
    expect(m).toEqual({ r: 0, c: 8, n: 9, kind: 'naked-single' })
  })

  it('finds a hidden single in a row', () => {
    // Construct a situation where row 0 has multiple empties, but only one spot can take 9.
    const g: Grid = Array.from({ length: 9 }, () => Array(9).fill(0))

    // Fill column constraints so that in row 0:
    // - c0 cannot be 9 (since col0 has a 9)
    // - c1 cannot be 9 (since col1 has a 9)
    // - c2 can be 9
    g[3][0] = 9
    g[3][1] = 9

    // Fill rest of row 0 so only c0/c1/c2 are empty.
    g[0][3] = 1
    g[0][4] = 2
    g[0][5] = 3
    g[0][6] = 4
    g[0][7] = 5
    g[0][8] = 6

    const m = nextLogicalMove(g)
    expect(m).not.toBeNull()
    expect(m!.kind).toBe('hidden-single')
    expect(m).toMatchObject({ r: 0, c: 2, n: 9 })
    expect((m as any).unit?.type).toBe('row')
  })
})
