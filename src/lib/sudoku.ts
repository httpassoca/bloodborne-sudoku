/** Sudoku generator/solver with uniqueness checks.
 * Grid is a 9x9 array of numbers 0-9 (0 = empty).
 */

export type Grid = number[][] // 9x9

export type DifficultyKey = 'easy' | 'medium' | 'hard' | 'expert' | 'nightmare'

export type Difficulty = {
  key: DifficultyKey
  label: string
  blanks: number
}

export const DIFFICULTIES: Difficulty[] = [
  { key: 'easy', label: 'Easy (Yharnam Street)', blanks: 36 },
  { key: 'medium', label: 'Medium (Cathedral Ward)', blanks: 45 },
  { key: 'hard', label: 'Hard (Forbidden Woods)', blanks: 51 },
  { key: 'expert', label: 'Expert (Nightmare Frontier)', blanks: 56 },
  { key: 'nightmare', label: 'Nightmare (Mensis)', blanks: 60 },
]

export function emptyGrid(): Grid {
  return Array.from({ length: 9 }, () => Array(9).fill(0))
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((r) => r.slice())
}

function shuffled<T>(arr: readonly T[]): T[] {
  const a = arr.slice() as T[]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function isValidPlacement(grid: Grid, row: number, col: number, n: number): boolean {
  // row/col
  for (let i = 0; i < 9; i++) {
    if (grid[row][i] === n) return false
    if (grid[i][col] === n) return false
  }
  // box
  const br = Math.floor(row / 3) * 3
  const bc = Math.floor(col / 3) * 3
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (grid[r][c] === n) return false
    }
  }
  return true
}

function findEmpty(grid: Grid): [number, number] | null {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) return [r, c]
    }
  }
  return null
}

export function solve(grid: Grid): boolean {
  const pos = findEmpty(grid)
  if (!pos) return true
  const [r, c] = pos
  for (const n of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9] as const)) {
    if (isValidPlacement(grid, r, c, n)) {
      grid[r][c] = n
      if (solve(grid)) return true
      grid[r][c] = 0
    }
  }
  return false
}

// Deterministic solver (stable for share codes)
export function solveDeterministic(grid: Grid): boolean {
  const pos = findEmpty(grid)
  if (!pos) return true
  const [r, c] = pos
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
    if (isValidPlacement(grid, r, c, n)) {
      grid[r][c] = n
      if (solveDeterministic(grid)) return true
      grid[r][c] = 0
    }
  }
  return false
}

// Count solutions up to `limit` (for uniqueness testing)
export function countSolutions(grid: Grid, limit = 2): number {
  const pos = findEmpty(grid)
  if (!pos) return 1
  const [r, c] = pos

  let count = 0
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
    if (isValidPlacement(grid, r, c, n)) {
      grid[r][c] = n
      count += countSolutions(grid, limit)
      grid[r][c] = 0
      if (count >= limit) return count
    }
  }
  return count
}

export function generateSolvedGrid(): Grid {
  const grid = emptyGrid()
  // Seed diagonal boxes for faster generation
  for (let box = 0; box < 3; box++) {
    const nums = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9] as const)
    let k = 0
    for (let r = box * 3; r < box * 3 + 3; r++) {
      for (let c = box * 3; c < box * 3 + 3; c++) {
        grid[r][c] = nums[k++]!
      }
    }
  }
  solve(grid)
  return grid
}

export function generatePuzzle(difficultyKey: DifficultyKey = 'easy'): {
  puzzle: Grid
  solution: Grid
  difficulty: Difficulty
} {
  const diff = DIFFICULTIES.find((d) => d.key === difficultyKey) || DIFFICULTIES[0]
  const solution = generateSolvedGrid()
  const puzzle = cloneGrid(solution)

  // list all cell coordinates, remove in random order
  const coords = shuffled(Array.from({ length: 81 }, (_, i) => [Math.floor(i / 9), i % 9] as const))

  let removed = 0
  for (const [r, c] of coords) {
    if (removed >= diff.blanks) break

    const backup = puzzle[r][c]
    if (backup === 0) continue

    puzzle[r][c] = 0

    // Uniqueness check
    const test = cloneGrid(puzzle)
    const solutions = countSolutions(test, 2)
    if (solutions !== 1) {
      puzzle[r][c] = backup
      continue
    }

    removed++
  }

  return { puzzle, solution, difficulty: diff }
}

export function isSolved(current: Grid, solution: Grid): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (current[r][c] !== solution[r][c]) return false
    }
  }
  return true
}

export function computeConflicts(grid: Grid): Set<string> {
  // returns Set of "r,c" strings that are in conflict (duplicates) among filled cells
  const bad = new Set<string>()

  // rows
  for (let r = 0; r < 9; r++) {
    const seen = new Map<number, Array<[number, number]>>()
    for (let c = 0; c < 9; c++) {
      const v = grid[r][c]
      if (!v) continue
      if (!seen.has(v)) seen.set(v, [])
      seen.get(v)!.push([r, c])
    }
    for (const coords of seen.values()) {
      if (coords.length > 1) coords.forEach(([rr, cc]) => bad.add(`${rr},${cc}`))
    }
  }

  // cols
  for (let c = 0; c < 9; c++) {
    const seen = new Map<number, Array<[number, number]>>()
    for (let r = 0; r < 9; r++) {
      const v = grid[r][c]
      if (!v) continue
      if (!seen.has(v)) seen.set(v, [])
      seen.get(v)!.push([r, c])
    }
    for (const coords of seen.values()) {
      if (coords.length > 1) coords.forEach(([rr, cc]) => bad.add(`${rr},${cc}`))
    }
  }

  // boxes
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const seen = new Map<number, Array<[number, number]>>()
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) {
          const v = grid[r][c]
          if (!v) continue
          if (!seen.has(v)) seen.set(v, [])
          seen.get(v)!.push([r, c])
        }
      }
      for (const coords of seen.values()) {
        if (coords.length > 1) coords.forEach(([rr, cc]) => bad.add(`${rr},${cc}`))
      }
    }
  }

  return bad
}
