// Human-ish step solver: naked singles + hidden singles (row/col/box)
// Returns structured move:
//  - { r, c, n, kind: 'naked-single' }
//  - { r, c, n, kind: 'hidden-single', unit: { type:'row'|'col'|'box', index?:number, br?:number, bc?:number } }

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
        return { r, c, n, kind: 'naked-single' }
      }
    }
  }

  // Helpers for hidden singles
  const checkUnit = (cells) => {
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
        return { r, c, n }
      }
    }
    return null
  }

  // 2) Hidden single in rows
  for (let r = 0; r < 9; r++) {
    const cells = Array.from({ length: 9 }, (_, c) => ({ r, c }))
    const m = checkUnit(cells)
    if (m) return { ...m, kind: 'hidden-single', unit: { type: 'row', index: r } }
  }

  // 3) Hidden single in cols
  for (let c = 0; c < 9; c++) {
    const cells = Array.from({ length: 9 }, (_, r) => ({ r, c }))
    const m = checkUnit(cells)
    if (m) return { ...m, kind: 'hidden-single', unit: { type: 'col', index: c } }
  }

  // 4) Hidden single in boxes
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const cells = []
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) cells.push({ r, c })
      }
      const m = checkUnit(cells)
      if (m) return { ...m, kind: 'hidden-single', unit: { type: 'box', br, bc } }
    }
  }

  return null
}
