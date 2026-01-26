<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, nextTick } from 'vue'
import SudokuBoard from './components/SudokuBoard.vue'
import CustomSelect from './components/CustomSelect.vue'
import RemainingNumbers from './components/RemainingNumbers.vue'
import { DIFFICULTIES, computeConflicts, generatePuzzle, isSolved } from './lib/sudoku'
import { nextLogicalMove } from './lib/logicSolver'

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

// theme
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
  multiSelected: new Set(['0,0']),

  startedAt: Date.now(),
  finished: false,
  finishedAt: null,

  victoryVisible: false,
  score: 0,
  bestScore: 0,

  companion: {
    running: false,
    speedMs: 450,
    speedPreset: 'normal',
    highlightKey: '',
    message: 'The companion is quiet.',
    decision: { r: -1, c: -1, n: 0, kind: '' },
  },
})

// When the user starts navigating with arrows, we disable hover effects until the user uses the mouse again.
const keyboardNav = ref(false)

const speedPresets = [
  { key: 'funeral', label: 'Funeral (8.0s)', ms: 8000 },
  { key: 'ritual', label: 'Ritual (6.0s)', ms: 6000 },
  { key: 'slow', label: 'Slow (4.0s)', ms: 4000 },
  { key: 'steady', label: 'Steady (2.0s)', ms: 2000 },
  { key: 'normal', label: 'Normal (1.2s)', ms: 1200 },
  { key: 'fast', label: 'Fast (650ms)', ms: 650 },
  { key: 'blitz', label: 'Blitz (350ms)', ms: 350 },
  { key: 'frenzy', label: 'Frenzy (180ms)', ms: 180 },
]

function applySpeedPreset() {
  const p = speedPresets.find((x) => x.key === state.companion.speedPreset)
  if (p) state.companion.speedMs = p.ms
}
watch(
  () => state.companion.speedPreset,
  () => applySpeedPreset(),
  { immediate: true }
)


function bestKey(diffKey) {
  return `bbs_best_${diffKey}`
}

function loadBestScore() {
  const v = Number(localStorage.getItem(bestKey(difficultyKey.value)) || 0)
  state.bestScore = Number.isFinite(v) ? v : 0
}

function scoreFor(diffKey, seconds) {
  const mult =
    diffKey === 'easy'
      ? 1
      : diffKey === 'medium'
        ? 1.35
        : diffKey === 'hard'
          ? 1.9
          : diffKey === 'expert'
            ? 2.6
            : 3.3

  const base = Math.round(12000 * mult)
  const penalty = Math.round(seconds * 20 * mult)
  return Math.max(0, base - penalty)
}

function newHunt() {
  const { puzzle, solution } = generatePuzzle(difficultyKey.value)
  state.puzzle = puzzle
  state.solution = solution
  state.cells = gridToCells(puzzle)
  state.selected = { row: 0, col: 0 }
  state.multiSelected = new Set(['0,0'])

  state.startedAt = Date.now()
  state.finished = false
  state.finishedAt = null

  state.victoryVisible = false
  state.score = 0

  state.companion.running = false
  state.companion.highlightKey = ''
  state.companion.message = 'The companion is quiet.'

  loadBestScore()
}

onMounted(() => {
  loadBestScore()
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

const elapsedSeconds = computed(() => {
  const end = state.finished ? state.finishedAt || nowTick.value : nowTick.value
  return Math.max(0, Math.floor((end - state.startedAt) / 1000))
})

const timeLabel = computed(() => {
  const sec = elapsedSeconds.value
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

function keyOf(r, c) {
  return `${r},${c}`
}

function selectCell({ row, col, mode = 'replace', additive = false }) {
  if (additive && mode === 'replace') mode = 'toggle'

  const r = clamp(row, 0, 8)
  const c = clamp(col, 0, 8)
  state.selected.row = r
  state.selected.col = c

  const k = keyOf(r, c)
  if (mode === 'toggle') {
    if (state.multiSelected.has(k)) state.multiSelected.delete(k)
    else state.multiSelected.add(k)
    if (state.multiSelected.size === 0) state.multiSelected = new Set([k])
    return
  }

  if (mode === 'extend') {
    state.multiSelected.add(k)
    return
  }

  state.multiSelected = new Set([k])
}

function cellAt(r, c) {
  return state.cells[r]?.[c]
}

function cellAtSelected() {
  return state.cells[state.selected.row]?.[state.selected.col]
}

function iterSelectedCells() {
  const out = []
  for (const k of state.multiSelected) {
    const [rS, cS] = k.split(',')
    const r = Number(rS)
    const c = Number(cS)
    if (Number.isFinite(r) && Number.isFinite(c)) out.push({ r, c, cell: state.cells[r][c] })
  }
  out.sort((a, b) => (a.r - b.r) || (a.c - b.c))
  return out
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

    const score = scoreFor(difficultyKey.value, elapsedSeconds.value)
    state.score = score

    const best = Number(localStorage.getItem(bestKey(difficultyKey.value)) || 0)
    if (!Number.isFinite(best) || score > best) {
      localStorage.setItem(bestKey(difficultyKey.value), String(score))
      state.bestScore = score
    } else {
      state.bestScore = best
    }

    state.victoryVisible = true
    victoryBurst.value++

    state.companion.running = false
  }
}

function toggleNote(set, n) {
  if (set.has(n)) set.delete(n)
  else set.add(n)
}

// error animation state
const errorActive = ref(false)
let errorTimeout = null
function pulseError() {
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
  if (state.finished) return

  // Drafting can apply to multiple selected cells.
  if (mode === 'corner' || mode === 'center') {
    const list = iterSelectedCells()
    for (const { cell } of list) {
      if (!cell || cell.given) continue
      toggleNote(mode === 'corner' ? cell.cornerNotes : cell.centerNotes, n)
    }
    return
  }

  // Normal entry applies to the primary cell only.
  const cell = cellAtSelected()
  if (!cell || cell.given) return

  cell.value = cell.value === n ? 0 : n
  clearNotes(cell)

  nextTick(() => {
    if (conflicts.value.has(`${state.selected.row},${state.selected.col}`)) {
      pulseError()
    }
    tryFinishCheck()
  })
}

function clearSelected() {
  const cell = cellAtSelected()
  if (!cell || cell.given || state.finished) return
  if (cell.value) cell.value = 0
  else clearNotes(cell)
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
  state.score = scoreFor(difficultyKey.value, elapsedSeconds.value)
  state.victoryVisible = true
  victoryBurst.value++
  state.companion.running = false
}

function moveSelection(dr, dc, extend = false) {
  selectCell({
    row: state.selected.row + dr,
    col: state.selected.col + dc,
    mode: extend ? 'extend' : 'replace',
  })
}

function keyToNumber(e) {
  const code = e.code || ''
  if (code.startsWith('Digit')) return Number(code.slice(5))
  if (code.startsWith('Numpad')) return Number(code.slice(6))
  const n = Number(e.key)
  if (Number.isInteger(n) && n >= 1 && n <= 9) return n
  return null
}

function dismissVictoryIfVisible() {
  if (state.victoryVisible) state.victoryVisible = false
}

// Companion kill (auto-solver)
let companionTimer = null

function setDecision(r, c, n, kind) {
  state.companion.decision = { r, c, n, kind }
}

function highlightStep(r, c, message, n = 0, kind = '') {
  const k = `${r},${c}`
  state.companion.highlightKey = ''
  requestAnimationFrame(() => {
    state.companion.highlightKey = k
  })
  state.companion.message = message
  if (n) setDecision(r, c, n, kind)
  selectCell({ row: r, col: c, mode: 'replace' })
}

function applyStep(r, c, n) {
  const cell = cellAt(r, c)
  if (!cell || cell.given || state.finished) return false
  cell.value = n
  clearNotes(cell)
  return true
}

function findFirstEmpty() {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (currentGrid.value[r][c] === 0) return { r, c }
    }
  }
  return null
}

function companionStep() {
  if (state.finished) return false

  const grid = currentGrid.value
  const move = nextLogicalMove(grid)

  if (move) {
    const ok = applyStep(move.r, move.c, move.n)
    if (ok) {
      highlightStep(move.r, move.c, `Companion: ${move.detail}`, move.n, move.kind)
      tryFinishCheck()
      return true
    }
    return false
  }

  // Fallback: reveal correct value (uses the precomputed solution)
  const empty = findFirstEmpty()
  if (!empty || !state.solution) return false
  const n = state.solution[empty.r][empty.c]
  const ok = applyStep(empty.r, empty.c, n)
  if (ok) {
    highlightStep(
      empty.r,
      empty.c,
      `Companion: No simple single found. Revealing the next correct value: ${n}.`,
      n,
      'reveal'
    )
    tryFinishCheck()
    return true
  }
  return false
}

function stopCompanion() {
  state.companion.running = false
  if (companionTimer) {
    window.clearTimeout(companionTimer)
    companionTimer = null
  }
}

function runCompanionLoop() {
  if (!state.companion.running) return
  const did = companionStep()
  if (!did) {
    state.companion.message = 'Companion: Nothing to do.'
    stopCompanion()
    return
  }

  companionTimer = window.setTimeout(runCompanionLoop, state.companion.speedMs)
}

function toggleCompanionKill() {
  if (state.companion.running) {
    stopCompanion()
    return
  }
  state.companion.running = true
  state.companion.message = 'Companion: Beginning the kill…'
  runCompanionLoop()
}

function onKeyDown(e) {
  // dismiss victory on any key
  if (state.victoryVisible) dismissVictoryIfVisible()

  const tag = (e.target?.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea') return

  // Arrow navigation => disable hover until mouse is used again
  if (e.key.startsWith('Arrow')) keyboardNav.value = true

  if (e.key === 'ArrowUp') return void (e.preventDefault(), moveSelection(-1, 0, e.ctrlKey || e.metaKey))
  if (e.key === 'ArrowDown') return void (e.preventDefault(), moveSelection(1, 0, e.ctrlKey || e.metaKey))
  if (e.key === 'ArrowLeft') return void (e.preventDefault(), moveSelection(0, -1, e.ctrlKey || e.metaKey))
  if (e.key === 'ArrowRight') return void (e.preventDefault(), moveSelection(0, 1, e.ctrlKey || e.metaKey))

  if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
    e.preventDefault()
    clearSelected()
    return
  }

  const n = keyToNumber(e)
  if (n) {
    e.preventDefault()
    const isCorner = e.shiftKey
    const isCenter = e.ctrlKey || e.metaKey

    if (isCorner && isCenter) handleNumber(n, 'center')
    else if (isCorner) handleNumber(n, 'corner')
    else if (isCenter) handleNumber(n, 'center')
    else handleNumber(n, 'value')
  }
}

function onPointerDown() {
  dismissVictoryIfVisible()
  keyboardNav.value = false
}

function onPointerMove() {
  keyboardNav.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointermove', onPointerMove)
  stopCompanion()
})

const statusText = computed(() => {
  if (state.finished) return `PREY SLAUGHTERED — Score ${state.score}`
  if (conflicts.value.size) return `${conflicts.value.size} conflicts — your blood sings.`
  return 'Seek paleblood, to transcend the hunt.'
})

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

const themeIcon = computed(() => (theme.value === 'dark' ? '☾' : '☀'))

// (candidate grid removed)

</script>

<template>
  <div class="app">
    <!-- Victory overlay (dismisses on ANY key or click) -->
    <div class="victory" :class="{ show: state.victoryVisible }" :data-burst="victoryBurst" aria-hidden="true">
      <div class="victory-inner">
        <div class="victory-title">PREY SLAUGHTERED</div>
        <div class="victory-sub">Score: <b>{{ state.score }}</b> · Best: <b>{{ state.bestScore }}</b></div>
        <div class="victory-hint">Press any key or click anywhere to continue.</div>
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
        <div class="pill"><span class="pill-label">Score</span><span class="pill-value">{{ state.score || '—' }}</span></div>
        <div class="pill"><span class="pill-label">Best</span><span class="pill-value">{{ state.bestScore || '—' }}</span></div>
      </div>
    </header>

    <main class="main">
      <div class="layout">
        <section class="board-wrap" aria-label="Sudoku">
          <SudokuBoard
            :cells="state.cells"
            :selected="state.selected"
            :multi-selected="state.multiSelected"
            :conflicts="conflicts"
            :disable-hover="keyboardNav"
            :highlight-key="state.companion.highlightKey"
            :decision="state.companion.decision"
            :class="{ 'error-shake': errorActive }"
            @select="(pos) => selectCell(pos)"
          />

          <!-- Companion explanation (text) -->
          <section class="companion-explain" aria-label="Companion explanation">
            <div class="companion-explain-title">Companion</div>
            <div class="companion-explain-text">{{ state.companion.message }}</div>
          </section>

          <!-- Instructions (not a dropdown): subtle until hover -->
          <section class="instructions" aria-label="Instructions">
            <div class="instructions-title">Controls</div>
            <ul class="help">
              <li><kbd>1</kbd>–<kbd>9</kbd> place number</li>
              <li><kbd>Shift</kbd> + <kbd>1</kbd>–<kbd>9</kbd> corner draft</li>
              <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>1</kbd>–<kbd>9</kbd> center draft</li>
              <li><kbd>Backspace</kbd>/<kbd>Del</kbd> clear</li>
              <li>Arrow keys move selection</li>
              <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + arrows extend selection (multi-draft)</li>
            </ul>
          </section>
        </section>

        <aside class="sidepanel">
          <div class="sidepanel-section">
            <div class="sidepanel-title">Hunt Setup</div>

            <div class="setup-row">
              <CustomSelect v-model="difficultyKey" :options="DIFFICULTIES" label="Difficulty" />
              <button
                class="icon-btn"
                type="button"
                :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
                title="Toggle theme"
                @click="toggleTheme"
              >
                {{ themeIcon }}
              </button>
            </div>

            <div class="btn-row">
              <button class="btn" type="button" @click="newHunt">New Hunt</button>
              <button class="btn ghost" type="button" @click="clearSelected">Clear</button>
            </div>

            <div class="btn-row">
              <button class="btn danger" type="button" @click="revealSolution">Reveal</button>
              <button class="btn" type="button" @click="toggleCompanionKill">
                {{ state.companion.running ? 'Stop Companion' : 'Companion Kill' }}
              </button>
            </div>

            <div class="speed">
              <div class="speed-head">
                <span class="speed-label">Companion speed</span>
                <span class="speed-value">{{ (state.companion.speedMs / 1000).toFixed(2) }}s</span>
              </div>

              <select v-model="state.companion.speedPreset" class="speed-select">
                <option v-for="p in speedPresets" :key="p.key" :value="p.key">{{ p.label }}</option>
              </select>

              <!-- slider removed: presets only -->
            </div>

            <div class="companion-log" :class="{ active: state.companion.running }">
              <div class="companion-title">Companion Log</div>
              <div class="companion-text">{{ state.companion.message }}</div>
              <div class="companion-hint">Decision is highlighted on the board.</div>
            </div>
          </div>

          <div class="sidepanel-section">
            <div class="remaining-row">
              <RemainingNumbers :grid="currentGrid" />

              <div class="mini-hud">
                <div class="pill">
                  <span class="pill-label">Time</span>
                  <span class="pill-value">{{ timeLabel }}</span>
                </div>
                <div class="pill">
                  <span class="pill-label">Status</span>
                  <span class="pill-value">{{ statusText }}</span>
                </div>
              </div>
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
.app {
  min-height: 100vh;
  padding: 18px 14px 18px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 14px;
}

.top {
  max-width: 1100px;
  margin: 0 auto;
  width: 100%;
  display: grid;
  gap: 12px;
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
  box-shadow: 0 10px 30px var(--shadow);
  position: relative;
  overflow: hidden;
}

.sigil::before {
  content: '';
  position: absolute;
  inset: -40% -40% auto -40%;
  height: 120%;
  transform: rotate(-15deg);
  background: linear-gradient(90deg, transparent, color-mix(in oklab, var(--blood) 35%, transparent), transparent);
  opacity: 0.35;
}

h1 {
  margin: 0;
  font-size: clamp(20px, 3.2vw, 34px);
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
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in oklab, var(--panel) 86%, transparent);
  border: 1px solid color-mix(in oklab, var(--ink) 50%, transparent);
}

.pill-label {
  opacity: 0.72;
  white-space: nowrap;
}

.pill-value {
  font-weight: 800;
  letter-spacing: 0.06em;
  text-align: right;
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
  display: grid;
  gap: 10px;
}

.companion-explain {
  border-radius: 18px;
  padding: 12px 12px;
  background: color-mix(in oklab, var(--panel) 70%, transparent);
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  opacity: 0.8;
}

.companion-explain-title {
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
  opacity: 0.85;
  margin-bottom: 6px;
}

.companion-explain-text {
  opacity: 0.92;
  line-height: 1.35;
}

.instructions {
  border-radius: 18px;
  padding: 12px 12px;
  background: color-mix(in oklab, var(--panel) 70%, transparent);
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  opacity: 0.62;
  transition: opacity 160ms ease, background 160ms ease;
}

.instructions:hover {
  opacity: 1;
  background: color-mix(in oklab, var(--panel) 84%, transparent);
}

.instructions-title {
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
  opacity: 0.85;
  margin-bottom: 8px;
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

.setup-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: end;
}

.icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: color-mix(in oklab, var(--panel) 78%, transparent);
  color: color-mix(in oklab, var(--bone) 90%, white);
  cursor: pointer;
  font-size: 18px;
  display: grid;
  place-items: center;
}

.icon-btn:hover {
  border-color: color-mix(in oklab, var(--gold) 45%, var(--ink));
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
  font-weight: 800;
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
  font-weight: 700;
}

.btn.danger {
  border-color: color-mix(in oklab, var(--blood) 55%, var(--ink));
  background: linear-gradient(180deg, color-mix(in oklab, var(--blood) 22%, var(--panel)), color-mix(in oklab, var(--ink) 35%, transparent));
}

.speed {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in oklab, var(--ink) 50%, transparent);
  display: grid;
  gap: 8px;
}

.speed-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.speed-label {
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 12px;
}

.speed-value {
  opacity: 0.85;
  font-weight: 800;
}

.speed-select {
  width: 100%;
  padding: 10px 10px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: color-mix(in oklab, var(--panel) 90%, transparent);
  color: var(--bone);
  outline: none;
}

/* speed preset only (no slider), candidate grid removed */

.companion-log {
  margin-top: 12px;
  padding: 10px 10px;
  border-radius: 14px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: color-mix(in oklab, var(--panel) 80%, transparent);
}

.companion-title {
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
  opacity: 0.85;
  margin-bottom: 6px;
}

.companion-text {
  opacity: 0.9;
  line-height: 1.35;
}

.remaining-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: start;
}

.mini-hud {
  display: grid;
  gap: 10px;
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
  padding: 18px;
  border-radius: 18px;
  background: color-mix(in oklab, var(--panel) 80%, transparent);
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  box-shadow: 0 24px 80px var(--shadow);
  text-align: center;
  animation: victory-rise 560ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.victory-title {
  font-family: 'Cinzel', ui-serif;
  letter-spacing: 0.12em;
  font-weight: 900;
  font-size: clamp(20px, 4vw, 40px);
  color: color-mix(in oklab, var(--bone) 86%, white);
  text-shadow: 0 0 18px color-mix(in oklab, var(--blood) 35%, transparent);
}

.victory-sub {
  margin-top: 10px;
  opacity: 0.9;
}

.victory-hint {
  margin-top: 10px;
  opacity: 0.75;
  font-size: 12px;
  letter-spacing: 0.06em;
}

@keyframes victory-rise {
  0% { transform: translateY(10px) scale(0.98); filter: blur(2px); }
  100% { transform: translateY(0) scale(1); filter: blur(0); }
}

/* board error shake */
:deep(.board.error-shake) {
  animation: board-shake 220ms ease;
}

@keyframes board-shake {
  0% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  55% { transform: translateX(4px); }
  100% { transform: translateX(0); }
}

/* Mobile */
@media (max-width: 980px) {
  .layout { grid-template-columns: 1fr; }
  .sidepanel { position: static; }
  .remaining-row { grid-template-columns: 1fr; }
}

@media (max-width: 560px) {
  .app { padding: 14px 10px 16px; gap: 12px; }
  .pill { padding: 9px 10px; }
}
</style>
