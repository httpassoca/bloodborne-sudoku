<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, nextTick } from 'vue'
import SudokuBoard from './components/SudokuBoard.vue'
import { DIFFICULTIES, computeConflicts, generatePuzzle, isSolved } from './lib/sudoku'

function makeCell(value, given) {
  return {
    value: value || 0,
    given: !!given,
    cornerNotes: new Set(),
    centerNotes: new Set(),
  }
}

function gridToCells(puzzleGrid) {
  return puzzleGrid.map((row) => row.map((v) => makeCell(v, v !== 0)))
}

const difficultyKey = ref('easy')

const theme = ref(localStorage.getItem('bbs_theme') || 'dark')
function applyTheme() {
  document.documentElement.dataset.theme = theme.value
  localStorage.setItem('bbs_theme', theme.value)
}
watch(theme, applyTheme, { immediate: true })

const state = reactive({
  puzzle: null,
  solution: null,
  cells: gridToCells(Array.from({ length: 9 }, () => Array(9).fill(0))),
  selected: { row: 0, col: 0 },
  startedAt: Date.now(),
  finished: false,
  finishedAt: null,
})

function newHunt() {
  const { puzzle, solution } = generatePuzzle(difficultyKey.value)
  state.puzzle = puzzle
  state.solution = solution
  state.cells = gridToCells(puzzle)
  state.selected = { row: 0, col: 0 }
  state.startedAt = Date.now()
  state.finished = false
  state.finishedAt = null
  victoryBurst.value++
}

onMounted(() => {
  newHunt()
})

watch(difficultyKey, () => newHunt())

const currentGrid = computed(() => state.cells.map((r) => r.map((c) => c.value)))
const conflicts = computed(() => computeConflicts(currentGrid.value))

// realtime timer tick
const nowTick = ref(Date.now())
let timerId = null
onMounted(() => {
  timerId = window.setInterval(() => (nowTick.value = Date.now()), 250)
})
onBeforeUnmount(() => {
  if (timerId) window.clearInterval(timerId)
})

const timeLabel = computed(() => {
  const end = state.finished ? state.finishedAt || nowTick.value : nowTick.value
  const ms = Math.max(0, end - state.startedAt)
  const sec = Math.floor(ms / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function selectCell({ row, col }) {
  state.selected.row = clamp(row, 0, 8)
  state.selected.col = clamp(col, 0, 8)
}

function cellAtSelected() {
  return state.cells[state.selected.row]?.[state.selected.col]
}

function clearNotes(cell) {
  cell.cornerNotes.clear()
  cell.centerNotes.clear()
}

function tryFinishCheck() {
  if (!state.solution) return
  if (isSolved(currentGrid.value, state.solution)) {
    state.finished = true
    state.finishedAt = Date.now()
    victoryBurst.value++
  }
}

function toggleNote(set, n) {
  if (set.has(n)) set.delete(n)
  else set.add(n)
}

// error animation state
const errorCellKey = ref('')
const errorActive = ref(false)
let errorTimeout = null
function pulseErrorAtSelected() {
  const key = `${state.selected.row},${state.selected.col}`
  errorCellKey.value = key

  // restart animation reliably
  errorActive.value = false
  if (errorTimeout) window.clearTimeout(errorTimeout)
  requestAnimationFrame(() => {
    errorActive.value = true
    errorTimeout = window.setTimeout(() => (errorActive.value = false), 220)
  })
}

// victory overlay burst counter (forces re-run of CSS animation)
const victoryBurst = ref(0)

function handleNumber(n, mode) {
  const cell = cellAtSelected()
  if (!cell || cell.given || state.finished) return

  if (mode === 'corner') {
    toggleNote(cell.cornerNotes, n)
    return
  }

  if (mode === 'center') {
    toggleNote(cell.centerNotes, n)
    return
  }

  // normal entry
  cell.value = cell.value === n ? 0 : n
  clearNotes(cell)

  // if this move creates a conflict affecting this cell, animate error
  nextTick(() => {
    if (conflicts.value.has(`${state.selected.row},${state.selected.col}`)) {
      pulseErrorAtSelected()
    }
    tryFinishCheck()
  })
}

function clearSelected() {
  const cell = cellAtSelected()
  if (!cell || cell.given || state.finished) return
  if (cell.value) {
    cell.value = 0
  } else {
    clearNotes(cell)
  }
}

function revealSolution() {
  if (!state.solution) return
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = state.cells[r][c]
      if (!cell.given) {
        cell.value = state.solution[r][c]
        clearNotes(cell)
      }
    }
  }
  state.finished = true
  state.finishedAt = Date.now()
  victoryBurst.value++
}

function moveSelection(dr, dc) {
  selectCell({ row: state.selected.row + dr, col: state.selected.col + dc })
}

// Robust key parsing across keyboard layouts:
// - use e.code Digit1..Digit9 / Numpad1..Numpad9
function keyToNumber(e) {
  const code = e.code || ''
  if (code.startsWith('Digit')) return Number(code.slice(5))
  if (code.startsWith('Numpad')) return Number(code.slice(6))

  // fallback (works when key is literally '1'..'9')
  const n = Number(e.key)
  if (Number.isInteger(n) && n >= 1 && n <= 9) return n
  return null
}

function onKeyDown(e) {
  const tag = (e.target?.tagName || '').toLowerCase()
  if (tag === 'select' || tag === 'option' || tag === 'input' || tag === 'textarea') return

  if (e.key === 'ArrowUp') return void (e.preventDefault(), moveSelection(-1, 0))
  if (e.key === 'ArrowDown') return void (e.preventDefault(), moveSelection(1, 0))
  if (e.key === 'ArrowLeft') return void (e.preventDefault(), moveSelection(0, -1))
  if (e.key === 'ArrowRight') return void (e.preventDefault(), moveSelection(0, 1))

  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    e.preventDefault()
    clearSelected()
    return
  }

  const n = keyToNumber(e)
  if (n) {
    e.preventDefault()

    // Requested:
    // - Shift + number => corner
    // - Ctrl + number => center
    // Note: on some layouts, Shift+1 makes e.key='!' etc, hence e.code parsing above.
    const isCorner = e.shiftKey
    const isCenter = e.ctrlKey || e.metaKey

    if (isCorner && isCenter) {
      handleNumber(n, 'center')
    } else if (isCorner) {
      handleNumber(n, 'corner')
    } else if (isCenter) {
      handleNumber(n, 'center')
    } else {
      handleNumber(n, 'value')
    }
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))

const statusText = computed(() => {
  if (state.finished) return 'PREY SLAUGHTERED'
  if (conflicts.value.size) return `${conflicts.value.size} conflicts — your blood sings.`
  return 'Seek paleblood, to transcend the hunt.'
})

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <div class="app">
    <!-- Victory overlay -->
    <div
      class="victory"
      :class="{ show: state.finished }"
      :data-burst="victoryBurst"
      aria-hidden="true"
    >
      <div class="victory-inner">
        <div class="victory-title">PREY SLAUGHTERED</div>
        <div class="victory-sub">The night, and the dream, were long…</div>
      </div>
    </div>

    <header class="top">
      <div class="brand">
        <div class="sigil" aria-hidden="true" />
        <div>
          <h1>Bloodborne Sudoku</h1>
          <p class="subtitle">A small hunt of numbers. A large hunt of patience.</p>
        </div>
      </div>

      <div class="hud">
        <div class="pill">
          <span class="pill-label">Time</span>
          <span class="pill-value">{{ timeLabel }}</span>
        </div>
        <div class="pill">
          <span class="pill-label">Status</span>
          <span class="pill-value">{{ statusText }}</span>
        </div>
      </div>
    </header>

    <main class="main">
      <div class="layout">
        <section class="board-wrap" aria-label="Sudoku">
          <SudokuBoard
            :cells="state.cells"
            :selected="state.selected"
            :conflicts="conflicts"
            :class="{ 'error-shake': errorActive }"
            @select="selectCell"
          />

          <!-- hidden marker used to target error animation in CSS -->
          <div class="sr-only" :data-error-cell="errorCellKey" />
        </section>

        <aside class="sidepanel">
          <div class="sidepanel-section">
            <div class="sidepanel-title">Hunt Setup</div>
            <label class="control">
              <span class="control-label">Difficulty</span>
              <select v-model="difficultyKey" class="select">
                <option v-for="d in DIFFICULTIES" :key="d.key" :value="d.key">{{ d.label }}</option>
              </select>
            </label>

            <div class="btn-row">
              <button class="btn" type="button" @click="newHunt">New Hunt</button>
              <button class="btn ghost" type="button" @click="clearSelected">Clear</button>
            </div>

            <div class="btn-row">
              <button class="btn danger" type="button" @click="revealSolution">Reveal</button>
              <button class="btn ghost" type="button" @click="toggleTheme">
                {{ theme === 'dark' ? 'Light Mode' : 'Dark Mode' }}
              </button>
            </div>
          </div>

          <div class="sidepanel-section">
            <div class="sidepanel-title">Controls</div>
            <ul class="help">
              <li><kbd>1</kbd>–<kbd>9</kbd> place number</li>
              <li><kbd>Shift</kbd> + <kbd>1</kbd>–<kbd>9</kbd> toggle <b>corner</b> draft</li>
              <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>1</kbd>–<kbd>9</kbd> toggle <b>center</b> draft</li>
              <li><kbd>Backspace</kbd>/<kbd>Del</kbd> clear</li>
              <li>Arrow keys move selection</li>
            </ul>
          </div>

          <div class="sidepanel-section tip">
            <div class="sidepanel-title">Note</div>
            <div class="muted">
              Shift-drafting now uses <b>key codes</b> (Digit1…Digit9 / Numpad1…Numpad9), so it works even on
              keyboard layouts where Shift+number produces symbols.
            </div>
          </div>
        </aside>
      </div>
    </main>

    <footer class="footer">
      <span>Made for the Hunt. No bells were rung.</span>
    </footer>
  </div>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.app {
  min-height: 100vh;
  padding: 22px 16px 18px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 18px;
}

.top {
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
  display: grid;
  gap: 14px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.sigil {
  width: 54px;
  height: 54px;
  border-radius: 14px;
  background:
    radial-gradient(circle at 30% 30%, color-mix(in oklab, var(--blood) 65%, transparent), transparent 55%),
    radial-gradient(circle at 70% 70%, color-mix(in oklab, var(--ember) 35%, transparent), transparent 60%),
    linear-gradient(180deg, color-mix(in oklab, var(--panel) 80%, transparent), color-mix(in oklab, var(--ink) 55%, transparent));
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  position: relative;
  overflow: hidden;
}

.sigil::before {
  content: '';
  position: absolute;
  inset: -40% -40% auto -40%;
  height: 120%;
  transform: rotate(-15deg);
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in oklab, var(--blood) 35%, transparent),
    transparent
  );
  opacity: 0.35;
}

h1 {
  margin: 0;
  font-size: clamp(22px, 3.2vw, 34px);
  letter-spacing: 0.06em;
}

.subtitle {
  margin: 6px 0 0;
  opacity: 0.78;
}

.hud {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.pill {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in oklab, var(--panel) 86%, transparent);
  border: 1px solid color-mix(in oklab, var(--ink) 50%, transparent);
}

.pill-label {
  opacity: 0.72;
}

.pill-value {
  font-weight: 700;
  letter-spacing: 0.06em;
}

.main {
  display: grid;
  place-items: start center;
}

.layout {
  max-width: 1100px;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(320px, 560px) 1fr;
  gap: 14px;
  align-items: start;
}

.board-wrap {
  width: 100%;
  max-width: 560px;
}

/* smaller board feel */
.board-wrap :deep(.board) {
  max-width: 560px;
}

/* error shake */
.board-wrap :deep(.board.error-shake) {
  animation: board-shake 220ms ease;
}

@keyframes board-shake {
  0% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  55% { transform: translateX(4px); }
  100% { transform: translateX(0); }
}

.sidepanel {
  position: sticky;
  top: 16px;
  display: grid;
  gap: 12px;
}

.sidepanel-section {
  padding: 14px 14px;
  border-radius: 16px;
  background: color-mix(in oklab, var(--panel) 84%, transparent);
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
}

.sidepanel-title {
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
  opacity: 0.85;
  margin-bottom: 10px;
}

.control {
  display: grid;
  gap: 8px;
}

.control-label {
  opacity: 0.78;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
}

.select {
  appearance: none;
  width: 100%;
  padding: 12px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: color-mix(in oklab, var(--panel) 90%, transparent);
  color: var(--bone);
  outline: none;
}

.btn-row {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.btn {
  padding: 12px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: linear-gradient(180deg, color-mix(in oklab, var(--panel) 86%, transparent), color-mix(in oklab, var(--ink) 35%, transparent));
  color: var(--bone);
  cursor: pointer;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}

.btn:hover {
  transform: translateY(-1px);
  border-color: color-mix(in oklab, var(--blood) 55%, var(--ink));
}

.btn.ghost {
  background: color-mix(in oklab, var(--panel) 78%, transparent);
  font-weight: 600;
}

.btn.danger {
  border-color: color-mix(in oklab, var(--blood) 55%, var(--ink));
  background: linear-gradient(180deg, color-mix(in oklab, var(--blood) 22%, var(--panel)), color-mix(in oklab, var(--ink) 35%, transparent));
}

.help {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 6px;
}

kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 8px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: color-mix(in oklab, var(--panel) 92%, transparent);
}

.tip .muted {
  opacity: 0.8;
  line-height: 1.35;
}

.footer {
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
  opacity: 0.65;
  font-size: 12px;
  letter-spacing: 0.06em;
}

/* victory overlay */
.victory {
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 240ms ease;
  display: grid;
  place-items: center;
  z-index: 50;
  background:
    radial-gradient(800px 500px at 50% 45%, color-mix(in oklab, var(--blood) 25%, transparent), transparent 60%),
    radial-gradient(1200px 800px at 50% 110%, color-mix(in oklab, var(--mist) 12%, transparent), transparent 60%),
    rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(3px);
}

.victory.show {
  opacity: 1;
}

.victory-inner {
  padding: 18px 18px;
  border-radius: 18px;
  background: color-mix(in oklab, var(--panel) 80%, transparent);
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.65);
  text-align: center;
  animation: victory-rise 560ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.victory-title {
  font-family: 'Cinzel', ui-serif;
  letter-spacing: 0.12em;
  font-weight: 800;
  font-size: clamp(20px, 4vw, 40px);
  color: color-mix(in oklab, var(--bone) 86%, white);
  text-shadow: 0 0 18px color-mix(in oklab, var(--blood) 35%, transparent);
}

.victory-sub {
  margin-top: 8px;
  opacity: 0.85;
}

@keyframes victory-rise {
  0% { transform: translateY(10px) scale(0.98); filter: blur(2px); }
  100% { transform: translateY(0) scale(1); filter: blur(0); }
}

@media (max-width: 920px) {
  .layout {
    grid-template-columns: 1fr;
  }

  .sidepanel {
    position: static;
  }
}
</style>
