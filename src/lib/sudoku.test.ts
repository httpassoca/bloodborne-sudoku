import { describe, expect, it } from 'vitest'
import {
  cloneGrid,
  computeConflicts,
  countSolutions,
  generatePuzzle,
  generateSolvedGrid,
  isSolved,
  isValidPlacement,
  type Grid,
} from './sudoku'

function setOf1to9(a: number[]): boolean {
  if (a.length !== 9) return false
  const s = new Set(a)
  if (s.size !== 9) return false
  for (let n = 1; n <= 9; n++) if (!s.has(n)) return false
  return true
}

function boxValues(grid: Grid, br: number, bc: number): number[] {
  const out: number[] = []
  for (let r = br * 3; r < br * 3 + 3; r++) {
    for (let c = bc * 3; c < bc * 3 + 3; c++) out.push(grid[r][c])
  }
  return out
}

describe('sudoku lib', () => {
  it('generateSolvedGrid() creates a valid solved grid', () => {
    const g = generateSolvedGrid()

    // rows
    for (let r = 0; r < 9; r++) {
      expect(setOf1to9(g[r])).toBe(true)
    }

    // cols
    for (let c = 0; c < 9; c++) {
      const col = Array.from({ length: 9 }, (_, r) => g[r][c])
      expect(setOf1to9(col)).toBe(true)
    }

    // boxes
    for (let br = 0; br < 3; br++) {
      for (let bc = 0; bc < 3; bc++) {
        expect(setOf1to9(boxValues(g, br, bc))).toBe(true)
      }
    }
  })

  it('isValidPlacement() rejects duplicates in row/col/box', () => {
    const g: Grid = Array.from({ length: 9 }, () => Array(9).fill(0))
    g[0][0] = 5
    expect(isValidPlacement(g, 0, 1, 5)).toBe(false) // row conflict
    expect(isValidPlacement(g, 1, 0, 5)).toBe(false) // col conflict
    expect(isValidPlacement(g, 1, 1, 5)).toBe(false) // box conflict
    expect(isValidPlacement(g, 0, 1, 6)).toBe(true)
  })

  it('computeConflicts() flags all cells involved in a conflict', () => {
    const g: Grid = Array.from({ length: 9 }, () => Array(9).fill(0))
    g[0][0] = 7
    g[0][3] = 7 // row conflict
    g[4][0] = 7 // col conflict
    g[1][1] = 7 // box conflict with (0,0)

    const bad = computeConflicts(g)

    // row conflict cells
    expect(bad.has('0,0')).toBe(true)
    expect(bad.has('0,3')).toBe(true)
    // col conflict cells
    expect(bad.has('4,0')).toBe(true)
    // box conflict cells
    expect(bad.has('1,1')).toBe(true)
  })

  it('generatePuzzle() produces a puzzle with a unique solution matching the provided solution', () => {
    // This test is intentionally light (one generated puzzle), but still checks uniqueness.
    const { puzzle, solution } = generatePuzzle('easy')

    // Sanity: puzzle is not already solved
    expect(isSolved(puzzle, solution)).toBe(false)

    const test = cloneGrid(puzzle)
    expect(countSolutions(test, 2)).toBe(1)

    // and the provided solution actually solves the puzzle (all non-zero clues must match)
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const v = puzzle[r][c]
        if (v !== 0) expect(v).toBe(solution[r][c])
      }
    }
  })
})
