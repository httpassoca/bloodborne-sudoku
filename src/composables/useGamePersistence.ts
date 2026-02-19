import { ref, type Ref } from 'vue'
import { cloneGrid, solveDeterministic } from '../lib/sudoku'
import { decodePuzzle, encodePuzzle } from '../lib/puzzleCode'
import { deserializeCell, gridToCells, serializeCell, type Cell } from '../lib/cell'

type DifficultyKeyRef = Ref<string>

type SudokuState = {
  puzzle: number[][] | null
  solution: number[][] | null
  cells: Cell[][]
  selected: { row: number; col: number }
  multiSelected: Set<string>

  startedAt: number
  activePlayMs: number
  finished: boolean
  finishedAt: number | null

  victoryVisible: boolean
  score: number
  errors: number
  undoStack: any[]
  redoStack: any[]
  lastCompletes: { rows: Set<any>; cols: Set<any>; boxes: Set<any> }
  flashKey: string

  companion: { running: boolean; highlightKey: string; message: string }
}

// Persist/restore game state (and user info already stored elsewhere)
const GAME_KEY = 'bbs_game_v3'
const BUILD_VERSION = '2026-02-12'

export function useGamePersistence(opts: {
  state: SudokuState
  difficultyKey: DifficultyKeyRef
  lastActiveAt: Ref<number | null>
  t: (key: string) => string
  newHunt: () => void
}) {
  const { state, difficultyKey, lastActiveAt, t, newHunt } = opts

  function serializeGame() {
    // limit stack sizes to keep storage small
    const UNDO_MAX = 250
    const undoStack = Array.isArray(state.undoStack) ? state.undoStack.slice(-UNDO_MAX) : []
    const redoStack = Array.isArray(state.redoStack) ? state.redoStack.slice(-UNDO_MAX) : []

    return {
      v: 3,
      build: BUILD_VERSION,
      at: Date.now(),
      difficultyKey: difficultyKey.value,
      startedAt: state.startedAt,
      activePlayMs: state.activePlayMs,
      finished: state.finished,
      finishedAt: state.finishedAt,
      errors: state.errors,
      score: state.score,
      puzzle: state.puzzle,
      solution: state.solution,
      cells: state.cells.map((row) => row.map((c) => serializeCell(c))),
      selected: state.selected,
      multiSelected: Array.from(state.multiSelected || []),
      undoStack,
      redoStack,
    }
  }

  function restoreGame(raw: any) {
    if (!raw || raw.v !== 3) return false
    if (!Array.isArray(raw.cells) || raw.cells.length !== 9) return false

    difficultyKey.value = raw.difficultyKey || difficultyKey.value

    state.startedAt = Number(raw.startedAt || Date.now())
    state.activePlayMs = Number(raw.activePlayMs || 0)
    state.finished = !!raw.finished
    state.finishedAt = raw.finishedAt ? Number(raw.finishedAt) : null
    state.errors = Number(raw.errors || 0)
    state.score = Number(raw.score || 0)

    state.puzzle = raw.puzzle || null
    state.solution = raw.solution || null

    state.cells = raw.cells.map((row: any) => (Array.isArray(row) ? row.map((c: any) => deserializeCell(c)) : []))
    // ensure 9x9
    if (state.cells.length !== 9 || state.cells.some((r) => r.length !== 9)) return false

    state.selected = raw.selected && Number.isInteger(raw.selected.row) ? raw.selected : { row: 0, col: 0 }
    state.multiSelected = new Set(Array.isArray(raw.multiSelected) ? raw.multiSelected : ['0,0'])

    state.undoStack = Array.isArray(raw.undoStack) ? raw.undoStack : []
    state.redoStack = Array.isArray(raw.redoStack) ? raw.redoStack : []
    state.lastCompletes = { rows: new Set(), cols: new Set(), boxes: new Set() }
    state.flashKey = ''

    // hide overlays on restore
    state.victoryVisible = false
    state.companion.running = false
    state.companion.highlightKey = ''
    state.companion.message = t('companion.quiet')

    return true
  }

  let saveTimer: number | null = null
  function scheduleSaveGame() {
    try {
      if (saveTimer) window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        localStorage.setItem(GAME_KEY, JSON.stringify(serializeGame()))
      }, 180)
    } catch {
      // ignore storage errors
    }
  }

  function loadSavedGame() {
    try {
      const raw = localStorage.getItem(GAME_KEY)
      if (!raw) return false
      const ok = restoreGame(JSON.parse(raw))
      // reset tick baseline on restore
      lastActiveAt.value = null
      return ok
    } catch {
      return false
    }
  }

  function resetSavedGame() {
    try {
      localStorage.removeItem(GAME_KEY)
    } catch {
      // ignore
    }
    newHunt()
    scheduleSaveGame()
  }

  // Puzzle codes
  const puzzleCodeInput = ref('')
  const puzzleCodeError = ref('')

  function currentPuzzleCode() {
    try {
      if (!state.puzzle) return ''
      return encodePuzzle(state.puzzle)
    } catch {
      return ''
    }
  }

  async function copyPuzzleCode() {
    const code = currentPuzzleCode()
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // ignore
    }
  }

  function loadPuzzleFromCode() {
    puzzleCodeError.value = ''
    try {
      const puzzle = decodePuzzle(puzzleCodeInput.value)

      const sol = cloneGrid(puzzle)
      const ok = solveDeterministic(sol)
      if (!ok) throw new Error('No solution')

      state.puzzle = puzzle
      state.solution = sol
      state.cells = gridToCells(puzzle)

      state.selected = { row: 0, col: 0 }
      state.multiSelected = new Set(['0,0'])

      state.startedAt = Date.now()
      state.activePlayMs = 0
      lastActiveAt.value = null
      state.finished = false
      state.finishedAt = null

      state.victoryVisible = false
      state.score = 0
      state.errors = 0
      state.undoStack = []
      state.redoStack = []

      scheduleSaveGame()
    } catch (e: any) {
      puzzleCodeError.value = String(e?.message || e)
    }
  }

  return {
    scheduleSaveGame,
    loadSavedGame,
    resetSavedGame,
    puzzleCodeInput,
    puzzleCodeError,
    currentPuzzleCode,
    copyPuzzleCode,
    loadPuzzleFromCode,
  }
}
