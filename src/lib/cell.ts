export type Cell = {
  value: number
  given: boolean
  cornerNotes: Set<number>
  centerNotes: Set<number>
}

export function makeCell(value?: number, given?: boolean): Cell {
  return {
    value: value || 0,
    given: !!given,
    cornerNotes: new Set(),
    centerNotes: new Set(),
  }
}

export function gridToCells(puzzleGrid: number[][]): Cell[][] {
  return puzzleGrid.map((row) => row.map((v) => makeCell(v, v !== 0)))
}

export function serializeCell(cell: Cell) {
  return {
    value: cell.value || 0,
    given: !!cell.given,
    cornerNotes: Array.from(cell.cornerNotes || []),
    centerNotes: Array.from(cell.centerNotes || []),
  }
}

export function deserializeCell(raw: any): Cell {
  const value = Number(raw?.value || 0)
  const given = !!raw?.given
  const cell = makeCell(value, given)
  cell.cornerNotes = new Set(Array.isArray(raw?.cornerNotes) ? raw.cornerNotes : [])
  cell.centerNotes = new Set(Array.isArray(raw?.centerNotes) ? raw.centerNotes : [])
  return cell
}
