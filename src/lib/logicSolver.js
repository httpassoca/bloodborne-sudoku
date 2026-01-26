// Human-ish step solver: naked singles + hidden singles (row/col/box)
// Returns { r, c, n, kind, detail } or null.

import { isValidPlacement } from './sudoku'

export function candidatesFor(grid, r, c) {
  if (grid[r][c] !== 0) return []
  const out = []
  for (let n = 1; n <= 9; n++) {
    if (isValidPlacement(grid, r, c, n)) out.push(n)
  }
  return out
}

function allCandidates(grid) {
  const cand = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => []))
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) cand[r][c] = candidatesFor(grid, r, c)
    }
  }
  return cand
}

export function nextLogicalMove(grid) {
  const cand = allCandidates(grid)

  // 1) Naked single
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] !== 0) continue
      if (cand[r][c].length === 1) {
        const n = cand[r][c][0]
        return {
          r,
          c,
          n,
          kind: 'naked-single',
          detail: `Only candidate for r${r + 1}c${c + 1} is ${n}.`,
        }
      }
    }
  }

  // Helpers for hidden singles
  const checkUnit = (cells, label) => {
    const counts = new Map() // n -> [{r,c}]
    for (const { r, c } of cells) {
      if (grid[r][c] !== 0) continue
      for (const n of cand[r][c]) {
        if (!counts.has(n)) counts.set(n, [])
        counts.get(n).push({ r, c })
      }
    }

    for (let n = 1; n <= 9; n++) {
      const spots = counts.get(n) || []
      if (spots.length === 1) {
        const { r, c } = spots[0]
        return {
          r,
          c,
          n,
          kind: 'hidden-single',
          detail: `${n} can only go in one place in ${label} → r${r + 1}c${c + 1}.`,
        }
      }
    }
    return null
  }

  // 2) Hidden single in rows
  for (let r = 0; r < 9; r++) {
    const cells = Array.from({ length: 9 }, (_, c) => ({ r, c }))
    const m = checkUnit(cells, `row ${r + 1}`)
    if (m) return m
  }

  // 3) Hidden single in cols
  for (let c = 0; c < 9; c++) {
    const cells = Array.from({ length: 9 }, (_, r) => ({ r, c }))
    const m = checkUnit(cells, `column ${c + 1}`)
    if (m) return m
  }

  // 4) Hidden single in boxes
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const cells = []
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) cells.push({ r, c })
      }
      const m = checkUnit(cells, `box (${br + 1},${bc + 1})`)
      if (m) return m
    }
  }

  return null
}
