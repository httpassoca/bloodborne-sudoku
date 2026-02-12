<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch, nextTick } from 'vue'
import { Volume2, Sun, Moon, Pencil, Eraser, Undo2, Clock, AlertOctagon } from 'lucide-vue-next'
import SudokuBoard from './components/SudokuBoard.vue'
import CustomSelect from './components/CustomSelect.vue'
import RemainingNumbers from './components/RemainingNumbers.vue'
import Tooltip from './components/Tooltip.vue'
import { DIFFICULTIES, computeConflicts, generatePuzzle, isSolved } from './lib/sudoku'
import { nextLogicalMove } from './lib/logicSolver'
import { makeClientId, makeRoomCode, makeSupabase, normalizeName } from './lib/multiplayer'
import { LANGS, t as tt } from './i18n'

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

// Multiplayer (Supabase Realtime)
const mpEnabled = ref(true)
const mpMode = ref('coop') // 'coop' | 'versus'
const mpRoom = ref('')
const mpName = ref(localStorage.getItem('bbs_name') || 'Hunter')
watch(mpName, () => localStorage.setItem('bbs_name', mpName.value), { immediate: true })

const mpClientId = makeClientId()

const PASTEL_COLORS = [
  { key: 'rose', label: 'Rose', value: '#f6a6b2' },
  { key: 'peach', label: 'Peach', value: '#f7c59f' },
  { key: 'lemon', label: 'Lemon', value: '#f6e58d' },
  { key: 'mint', label: 'Mint', value: '#b8f2e6' },
  { key: 'sky', label: 'Sky', value: '#a0c4ff' },
  { key: 'lilac', label: 'Lilac', value: '#cdb4db' },
]

function randomPastel() {
  return PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)].value
}

const mpColor = ref(localStorage.getItem('bbs_mp_color') || randomPastel())
watch(mpColor, () => localStorage.setItem('bbs_mp_color', mpColor.value), { immediate: true })

let supabase = null
let mpChannel = null
const mpConnected = ref(false)
const mpPlayers = ref([])
const mpError = ref('')

function initials(name) {
  const t = String(name || '').trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] || ''
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : ''
  return (a + b).toUpperCase().slice(0, 2) || '?'
}

const otherSelections = computed(() => {
  // map cellKey -> [{ color, label }]
  const map = new Map()
  for (const p of mpPlayers.value || []) {
    if (!p || p.id === mpClientId) continue
    const sel = p.sel
    if (!sel) continue
    const arr = map.get(sel) || []
    arr.push({ color: p.color || '#b8f2e6', label: initials(p.name), name: p.name || '' })
    map.set(sel, arr)
  }
  return map
})

function mpIsActive() {
  return mpEnabled.value && mpConnected.value && mpChannel && mpRoom.value
}

function mpBroadcast(payload) {
  if (!mpIsActive()) return
  mpChannel.send({ type: 'broadcast', event: 'msg', payload })
}

function coopExportState() {
  return {
    v: 1,
    puzzle: state.puzzle,
    solution: state.solution,
    cells: state.cells.map((row) =>
      row.map((c) => ({
        value: c.value || 0,
        cornerNotes: Array.from(c.cornerNotes || []),
        centerNotes: Array.from(c.centerNotes || []),
      }))
    ),
    startedAt: state.startedAt,
    at: Date.now(),
  }
}

function coopApplyState(s) {
  if (!s?.puzzle || !Array.isArray(s?.cells)) return
  state.puzzle = s.puzzle
  state.solution = s.solution || state.solution
  state.cells = s.cells.map((row, r) =>
    row.map((raw, c) => {
      const given = (s.puzzle?.[r]?.[c] || 0) !== 0
      const cell = makeCell(raw.value || 0, given)
      cell.cornerNotes = new Set(Array.isArray(raw.cornerNotes) ? raw.cornerNotes : [])
      cell.centerNotes = new Set(Array.isArray(raw.centerNotes) ? raw.centerNotes : [])
      return cell
    })
  )
  state.startedAt = Number(s.startedAt || Date.now())
  state.activePlayMs = 0
  lastActiveAt = null
  state.finished = false
  state.finishedAt = null
  state.victoryVisible = false
  state.score = 0
  state.errors = 0
  state.undoStack = []
  state.redoStack = []
  scheduleSaveGame()
}

async function mpDisconnect() {
  mpConnected.value = false
  mpPlayers.value = []
  mpError.value = ''
  if (mpChannel) {
    try {
      await mpChannel.unsubscribe()
    } catch {
      // ignore
    }
  }
  mpChannel = null
}

async function mpConnect(room, mode) {
  mpError.value = ''
  mpRoom.value = room
  mpMode.value = mode

  if (!supabase) {
    try {
      supabase = makeSupabase()
    } catch (e) {
      mpError.value = String(e?.message || e)
      return
    }
  }

  await mpDisconnect()

  const ch = supabase.channel(`room:${room}`, {
    config: {
      presence: { key: mpClientId },
      broadcast: { ack: false },
    },
  })

  ch.on('presence', { event: 'sync' }, () => {
    const state = ch.presenceState()
    const out = []
    for (const k of Object.keys(state)) {
      const arr = state[k] || []
      for (const p of arr) out.push({ id: k, ...(p || {}) })
    }
    mpPlayers.value = out
  })

  ch.on('broadcast', { event: 'msg' }, ({ payload }) => {
    const msg = payload
    if (!msg || msg.by === mpClientId) return

    if (msg.type === 'hello') {
      // if coop and we have a state, offer it
      if (mpMode.value === 'coop') {
        mpBroadcast({ type: 'state_response', by: mpClientId, to: msg.by, state: coopExportState(), at: Date.now() })
      }
    }

    if (msg.type === 'state_request' && mpMode.value === 'coop') {
      mpBroadcast({ type: 'state_response', by: mpClientId, to: msg.by, state: coopExportState(), at: Date.now() })
    }

    if (msg.type === 'state_response' && mpMode.value === 'coop') {
      if (msg.to !== mpClientId) return
      coopApplyState(msg.state)
    }

    if (msg.type === 'coop_patch' && mpMode.value === 'coop') {
      const p = msg.patch
      const cell = state.cells?.[p.r]?.[p.c]
      if (!cell || cell.given) return
      if (typeof p.value === 'number') cell.value = p.value
      if (Array.isArray(p.cornerNotes)) cell.cornerNotes = new Set(p.cornerNotes)
      if (Array.isArray(p.centerNotes)) cell.centerNotes = new Set(p.centerNotes)
      scheduleSaveGame()
    }

    if (msg.type === 'versus_stats' && mpMode.value === 'versus') {
      // store in presence? keep simple: rely on presence state
    }
  })

  const { error } = await ch.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      mpConnected.value = true
      ch.track({ name: normalizeName(mpName.value), color: mpColor.value, sel: keyOf(state.selected.row, state.selected.col), joinedAt: Date.now() })
      mpBroadcast({ type: 'hello', by: mpClientId, name: normalizeName(mpName.value), mode: mpMode.value, at: Date.now() })
      if (mpMode.value === 'coop') {
        // ask for state; if none replies, keep local
        mpBroadcast({ type: 'state_request', by: mpClientId, at: Date.now() })
      }
    }
  })

  if (error) mpError.value = String(error.message || error)
  mpChannel = ch
}

const lang = ref(localStorage.getItem('bbs_lang') || 'en')
watch(
  lang,
  () => {
    localStorage.setItem('bbs_lang', lang.value)
  },
  { immediate: true }
)

function t(key, params) {
  return tt(lang.value, key, params)
}

const langOptions = LANGS

// theme
const theme = ref(localStorage.getItem('bbs_theme') || 'dark')
function applyTheme() {
  document.documentElement.dataset.theme = theme.value
  localStorage.setItem('bbs_theme', theme.value)
}
watch(theme, applyTheme, { immediate: true })

// Persist/restore game state (and user info already stored elsewhere)
const GAME_KEY = 'bbs_game_v3'
const BUILD_VERSION = '2026-02-12'

function serializeCell(cell) {
  return {
    value: cell.value || 0,
    given: !!cell.given,
    cornerNotes: Array.from(cell.cornerNotes || []),
    centerNotes: Array.from(cell.centerNotes || []),
  }
}

function deserializeCell(raw) {
  const value = Number(raw?.value || 0)
  const given = !!raw?.given
  const cell = makeCell(value, given)
  cell.cornerNotes = new Set(Array.isArray(raw?.cornerNotes) ? raw.cornerNotes : [])
  cell.centerNotes = new Set(Array.isArray(raw?.centerNotes) ? raw.centerNotes : [])
  return cell
}

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

function restoreGame(raw) {
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

  state.cells = raw.cells.map((row) => (Array.isArray(row) ? row.map((c) => deserializeCell(c)) : []))
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

let saveTimer = null
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
    lastActiveAt = null
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

const state = reactive({
  puzzle: null,
  solution: null,
  cells: gridToCells(Array.from({ length: 9 }, () => Array(9).fill(0))),
  selected: { row: 0, col: 0 },
  multiSelected: new Set(['0,0']),

  startedAt: Date.now(),
  activePlayMs: 0,
  errors: 0,
  undoStack: [], // user move history for undo/companion correction
  redoStack: [],
  lastCompletes: { rows: new Set(), cols: new Set(), boxes: new Set() },
  flashKey: '',

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
    message: '',
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

const difficultiesLocalized = computed(() => {
  return DIFFICULTIES.map((d) => ({ key: d.key, label: t(`diff.${d.key}`) }))
})

// Mobile: on-screen number pad (sudoku.com style)
const entryMode = ref('value') // 'value' | 'corner' | 'center'

// Keyboard modifiers (desktop): reflect mode indicator when Shift/Ctrl/Meta is held
const heldShift = ref(false)
const heldCtrlMeta = ref(false)

const boardActive = ref(false)

const effectiveEntryMode = computed(() => {
  if (!boardActive.value) return entryMode.value
  if (heldCtrlMeta.value) return 'center'
  if (heldShift.value) return 'corner'
  return entryMode.value
})

const isMobile = ref(false)
function updateIsMobile() {
  isMobile.value = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 980px)').matches
}
onMounted(() => {
  updateIsMobile()
  window.addEventListener('resize', updateIsMobile)
})
onBeforeUnmount(() => window.removeEventListener('resize', updateIsMobile))

const isCenterDraft = computed(() => entryMode.value === 'center')
function toggleCenterDraft() {
  entryMode.value = entryMode.value === 'center' ? 'value' : 'center'
}

function mobilePress(n) {
  const m = effectiveEntryMode.value
  if (m === 'corner') handleNumber(n, 'corner', 'user')
  else if (m === 'center') handleNumber(n, 'center', 'user')
  else handleNumber(n, 'value', 'user')
}

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

function newHunt({ fromNetwork = false } = {}) {
  const { puzzle, solution } = generatePuzzle(difficultyKey.value)
  state.puzzle = puzzle
  state.solution = solution
  state.cells = gridToCells(puzzle)
  state.selected = { row: 0, col: 0 }
  state.multiSelected = new Set(['0,0'])

  state.startedAt = Date.now()
  state.activePlayMs = 0
  lastActiveAt = null
  state.finished = false
  state.finishedAt = null

  state.victoryVisible = false
  state.score = 0

  state.companion.running = false
  state.companion.highlightKey = ''
  state.companion.message = t('companion.quiet')

  state.errors = 0
  state.undoStack = []
  state.redoStack = []
  state.lastCompletes = { rows: new Set(), cols: new Set(), boxes: new Set() }
  state.flashKey = ''
  completeSfxCount = 0

  loadBestScore()
}

onMounted(() => {
  loadBestScore()
  const restored = loadSavedGame()
  if (!restored) newHunt()
})

watch(difficultyKey, () => {
  // changing difficulty is an explicit user action; start fresh
  newHunt()
  scheduleSaveGame()
})

watch(
  [
    difficultyKey,
    () => state.startedAt,
    () => state.finished,
    () => state.finishedAt,
    () => state.errors,
    () => state.score,
    () => state.puzzle,
    () => state.solution,
    () => state.selected,
    () => Array.from(state.multiSelected || []),
    () => state.undoStack,
    () => state.redoStack,
    () => state.cells,
  ],
  () => scheduleSaveGame(),
  { deep: true }
)

const currentGrid = computed(() => state.cells.map((r) => r.map((c) => c.value)))
const conflicts = computed(() => computeConflicts(currentGrid.value))

// realtime timer tick (only while tab is visible)
const nowTick = ref(Date.now())
let timerId = null

let lastActiveAt = null

function stopNowTick() {
  if (timerId) {
    window.clearInterval(timerId)
    timerId = null
  }
  if (lastActiveAt && !state.finished) {
    state.activePlayMs += Math.max(0, Date.now() - lastActiveAt)
  }
  lastActiveAt = null
}

function startNowTick() {
  if (timerId) return
  if (!state.finished) lastActiveAt = Date.now()
  timerId = window.setInterval(() => (nowTick.value = Date.now()), 250)
}

function syncNowTickActive() {
  if (typeof document === 'undefined') return
  // Do NOT gate on focus/blur: some browsers load unfocused and timer would stay at 0.
  if (document.visibilityState === 'visible') startNowTick()
  else stopNowTick()
}

onMounted(() => {
  // Start immediately if visible.
  syncNowTickActive()
  document.addEventListener('visibilitychange', syncNowTickActive)
})

onBeforeUnmount(() => {
  stopNowTick()
  document.removeEventListener('visibilitychange', syncNowTickActive)
})

const elapsedSeconds = computed(() => {
  // depend on nowTick so the UI updates while active
  const now = nowTick.value

  if (state.finished) {
    // if finished, activePlayMs is already finalized in stopNowTick() or on finish
    return Math.max(0, Math.floor(state.activePlayMs / 1000))
  }

  const live = lastActiveAt ? now - lastActiveAt : 0
  return Math.max(0, Math.floor((state.activePlayMs + Math.max(0, live)) / 1000))
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

function clearCompanionVisuals() {
  state.companion.highlightKey = ''
  state.companion.decision = { r: -1, c: -1, n: 0, kind: '' }
  state.flashKey = ''
}

function selectCell({ row, col, mode = 'replace', additive = false, source = 'user' }) {
  if (additive && mode === 'replace') mode = 'toggle'

  if (source === 'user') {
    // user took control back: stop companion + clear its visual overlays
    if (state.companion.running) stopCompanion()
    clearCompanionVisuals()
  }

  const r = clamp(row, 0, 8)
  const c = clamp(col, 0, 8)
  state.selected.row = r
  state.selected.col = c

  const k = keyOf(r, c)

  if (source === 'user' && mpIsActive()) {
    mpChannel.track({ name: normalizeName(mpName.value), color: mpColor.value, sel: k, joinedAt: Date.now() })
  }

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
    // finalize timer
    if (lastActiveAt) {
      state.activePlayMs += Math.max(0, Date.now() - lastActiveAt)
      lastActiveAt = null
    }

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
    playVictorySfx()

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

const victorySfxUrl = new URL('./assets/sfx/victory.mp3', import.meta.url).href
let victoryAudio = null
async function playVictorySfx() {
  try {
    if (!victoryAudio) victoryAudio = new Audio(victorySfxUrl)
    victoryAudio.currentTime = 0
    victoryAudio.volume = sound.volume
    await victoryAudio.play()
  } catch {
    // autoplay may be blocked on some browsers; ignore
  }
}

function snapshotNotes(cell) {
  return {
    corner: Array.from(cell.cornerNotes || []),
    center: Array.from(cell.centerNotes || []),
  }
}

function applyNotes(cell, snap) {
  cell.cornerNotes = new Set(Array.isArray(snap?.corner) ? snap.corner : [])
  cell.centerNotes = new Set(Array.isArray(snap?.center) ? snap.center : [])
}

function removeDraftFromPeers(r, c, n) {
  // removes a placed number from drafts in same row, col, and 3x3 box.
  // returns list of changes so undo/redo can restore.
  const changes = []
  const seen = new Set()

  function maybeRemove(rr, cc) {
    const key = `${rr},${cc}`
    if (seen.has(key)) return
    seen.add(key)
    const cell = state.cells[rr]?.[cc]
    if (!cell || cell.given) return

    const beforeNotes = snapshotNotes(cell)
    cell.cornerNotes.delete(n)
    cell.centerNotes.delete(n)
    const afterNotes = snapshotNotes(cell)
    if (beforeNotes.corner.length !== afterNotes.corner.length || beforeNotes.center.length !== afterNotes.center.length) {
      changes.push({ r: rr, c: cc, beforeNotes, afterNotes })
    }
  }

  for (let i = 0; i < 9; i++) {
    maybeRemove(r, i)
    maybeRemove(i, c)
  }

  const br = Math.floor(r / 3) * 3
  const bc = Math.floor(c / 3) * 3
  for (let rr = br; rr < br + 3; rr++) {
    for (let cc = bc; cc < bc + 3; cc++) {
      maybeRemove(rr, cc)
    }
  }

  return changes
}

function boxIndex(r, c) {
  return Math.floor(r / 3) * 3 + Math.floor(c / 3)
}

const completeSfxUrl = new URL('./assets/sfx/complete.mp3', import.meta.url).href
let completeAudio = null
async function playChime() {
  try {
    if (!completeAudio) completeAudio = new Audio(completeSfxUrl)
    completeAudio.currentTime = 0
    completeAudio.playbackRate = 1.5 // 50% faster
    completeAudio.volume = sound.volume * 0.6 // 40% lower than master
    await completeAudio.play()
  } catch {
    // ignore (autoplay restrictions etc.)
  }
}

let lastCompleteSfxAt = 0
let completeSfxCount = 0
const COMPLETE_SFX_MAX = 10
function checkCompletesAndSound() {
  const g = currentGrid.value
  // rows
  for (let r = 0; r < 9; r++) {
    const complete = g[r].every((v) => v >= 1 && v <= 9)
    if (complete && !state.lastCompletes.rows.has(r)) {
      state.lastCompletes.rows.add(r)
      const now = Date.now()
      if (completeSfxCount < COMPLETE_SFX_MAX && now - lastCompleteSfxAt > 120) {
        lastCompleteSfxAt = now
        completeSfxCount++
        playChime()
      }
    }
  }
  // cols
  for (let c = 0; c < 9; c++) {
    let complete = true
    for (let r = 0; r < 9; r++) if (!g[r][c]) complete = false
    if (complete && !state.lastCompletes.cols.has(c)) {
      state.lastCompletes.cols.add(c)
      const now = Date.now()
      if (completeSfxCount < COMPLETE_SFX_MAX && now - lastCompleteSfxAt > 120) {
        lastCompleteSfxAt = now
        completeSfxCount++
        playChime()
      }
    }
  }
  // boxes
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      let complete = true
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) if (!g[r][c]) complete = false
      }
      const bi = br * 3 + bc
      if (complete && !state.lastCompletes.boxes.has(bi)) {
        state.lastCompletes.boxes.add(bi)
        const now = Date.now()
        if (completeSfxCount < COMPLETE_SFX_MAX && now - lastCompleteSfxAt > 120) {
          lastCompleteSfxAt = now
          completeSfxCount++
          playChime()
        }
      }
    }
  }
}

function flashCell(r, c) {
  const k = `${r},${c}`
  state.flashKey = ''
  requestAnimationFrame(() => {
    state.flashKey = k
  })
}

function pushMove(move) {
  state.undoStack.push(move)
  state.redoStack = []

  // broadcast coop changes
  if (mpMode.value === 'coop' && mpIsActive()) {
    for (const ch of move.changes || []) {
      const cell = state.cells[ch.r]?.[ch.c]
      if (!cell || cell.given) continue
      mpBroadcast({
        type: 'coop_patch',
        by: mpClientId,
        patch: {
          r: ch.r,
          c: ch.c,
          value: cell.value,
          cornerNotes: Array.from(cell.cornerNotes || []),
          centerNotes: Array.from(cell.centerNotes || []),
          at: Date.now(),
          by: mpClientId,
        },
        at: Date.now(),
      })
    }
  }
}

function applyMove(move, dir) {
  const isUndo = dir === 'undo'
  for (const ch of move.changes || []) {
    const cell = state.cells[ch.r]?.[ch.c]
    if (!cell || cell.given) continue

    if ('beforeValue' in ch && 'afterValue' in ch) {
      cell.value = isUndo ? ch.beforeValue : ch.afterValue
    }

    if (ch.beforeNotes || ch.afterNotes) {
      applyNotes(cell, isUndo ? ch.beforeNotes : ch.afterNotes)
    }
  }
}

function undo() {
  if (state.finished) return
  const m = state.undoStack.pop()
  if (!m) return
  applyMove(m, 'undo')
  state.redoStack.push(m)
  if (m.primary) {
    selectCell({ row: m.primary.r, col: m.primary.c, mode: 'replace', source: 'user' })
    flashCell(m.primary.r, m.primary.c)
  }
  checkCompletesAndSound()
}

function redo() {
  if (state.finished) return
  const m = state.redoStack.pop()
  if (!m) return
  applyMove(m, 'redo')
  state.undoStack.push(m)
  if (m.primary) {
    selectCell({ row: m.primary.r, col: m.primary.c, mode: 'replace', source: 'user' })
    flashCell(m.primary.r, m.primary.c)
  }
  checkCompletesAndSound()
  tryFinishCheck()
}

function handleNumber(n, mode, source = 'user') {
  if (state.finished) return
  if (source === 'user') {
    if (state.companion.running) stopCompanion()
    clearCompanionVisuals()
  }

  // Drafting can apply to multiple selected cells.
  if (mode === 'corner' || mode === 'center') {
    const list = iterSelectedCells()
    const changes = []
    for (const { r, c, cell } of list) {
      if (!cell || cell.given) continue
      const beforeNotes = snapshotNotes(cell)
      toggleNote(mode === 'corner' ? cell.cornerNotes : cell.centerNotes, n)
      const afterNotes = snapshotNotes(cell)
      changes.push({ r, c, beforeNotes, afterNotes })
    }

    if (source === 'user' && changes.length) {
      pushMove({ kind: 'notes', at: Date.now(), primary: { r: state.selected.row, c: state.selected.col }, changes })
    }
    return
  }

  // Normal entry applies to the primary cell only.
  const cell = cellAtSelected()
  if (!cell || cell.given) return

  const r = state.selected.row
  const c = state.selected.col
  const beforeValue = cell.value
  const beforeNotes = snapshotNotes(cell)

  const afterValue = beforeValue === n ? 0 : n

  cell.value = afterValue
  clearNotes(cell)

  const changes = [{ r, c, beforeValue, afterValue, beforeNotes, afterNotes: snapshotNotes(cell) }]

  if (afterValue) {
    const peerChanges = removeDraftFromPeers(r, c, afterValue)
    for (const ch of peerChanges) changes.push(ch)
  }

  if (source === 'user') {
    pushMove({ kind: 'value', at: Date.now(), primary: { r, c }, changes })
    if (afterValue && state.solution && afterValue !== state.solution[r][c]) {
      state.errors += 1
      flashCell(r, c)
    }
  }

  nextTick(() => {
    if (conflicts.value.has(`${r},${c}`)) {
      pulseError()
    }
    checkCompletesAndSound()
    tryFinishCheck()
  })
}

function clearSelected(source = 'user') {
  if (state.finished) return
  const list = iterSelectedCells()
  const changes = []
  for (const { r, c, cell } of list) {
    if (!cell || cell.given) continue
    const beforeValue = cell.value
    const beforeNotes = snapshotNotes(cell)
    if (cell.value) cell.value = 0
    clearNotes(cell)
    changes.push({ r, c, beforeValue, afterValue: cell.value, beforeNotes, afterNotes: snapshotNotes(cell) })
  }

  if (source === 'user' && changes.length) {
    pushMove({ kind: 'clear', at: Date.now(), primary: { r: state.selected.row, c: state.selected.col }, changes })
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
  state.score = scoreFor(difficultyKey.value, elapsedSeconds.value)
  state.victoryVisible = true
  victoryBurst.value++
  playVictorySfx()
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
  selectCell({ row: r, col: c, mode: 'replace', source: 'companion' })
}

function applyStep(r, c, n) {
  const cell = cellAt(r, c)
  if (!cell || cell.given || state.finished) return false
  cell.value = n
  clearNotes(cell)
  if (n) removeDraftFromPeers(r, c, n)
  checkCompletesAndSound()
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
      // Localized companion explanation
      let msg = ''
      if (move.kind === 'naked-single') {
        msg = t('companion.nakedSingle', { r: move.r, c: move.c, n: move.n })
      } else if (move.kind === 'hidden-single') {
        const u = move.unit
        if (u?.type === 'row') msg = t('companion.hiddenRow', { r: move.r, c: move.c, n: move.n, idx: u.index })
        else if (u?.type === 'col') msg = t('companion.hiddenCol', { r: move.r, c: move.c, n: move.n, idx: u.index })
        else if (u?.type === 'box') msg = t('companion.hiddenBox', { r: move.r, c: move.c, n: move.n, br: u.br, bc: u.bc })
        else msg = t('companion.nakedSingle', { r: move.r, c: move.c, n: move.n })
      } else {
        msg = t('companion.nakedSingle', { r: move.r, c: move.c, n: move.n })
      }

      highlightStep(move.r, move.c, msg, move.n, move.kind)
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
    highlightStep(empty.r, empty.c, t('companion.fallback', { r: empty.r, c: empty.c, n }), n, 'reveal')
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
    state.companion.message = t('companion.nothing')
    stopCompanion()
    return
  }

  companionTimer = window.setTimeout(runCompanionLoop, state.companion.speedMs)
}

function hasUserErrors() {
  if (!state.solution) return false
  const g = currentGrid.value
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = g[r][c]
      if (v && v !== state.solution[r][c]) return true
    }
  }
  return false
}

function undoLastUserValueMove() {
  // Companion only cares about reverting value placements.
  let safety = 400
  while (safety-- > 0) {
    const m = state.undoStack.pop()
    if (!m) return false
    applyMove(m, 'undo')
    // don't push to redo stack for companion; it is an auto-correction
    if (m.kind === 'value' || m.kind === 'clear') {
      if (m.primary) {
        flashCell(m.primary.r, m.primary.c)
        selectCell({ row: m.primary.r, col: m.primary.c, mode: 'replace', source: 'companion' })
      }
      checkCompletesAndSound()
      return true
    }
    // if it was only notes, keep rewinding silently
  }
  return false
}

function companionCorrectErrorsStep() {
  if (!hasUserErrors()) return false

  // Undo moves until board has no incorrect values.
  let safety = 300
  while (hasUserErrors() && safety-- > 0) {
    const ok = undoLastUserValueMove()
    if (!ok) break
    state.companion.message = t('companion.reverting')
    return true
  }

  return hasUserErrors()
}

function toggleCompanionKill() {
  if (state.companion.running) {
    stopCompanion()
    return
  }

  // If user has mistakes, companion first rewinds to a consistent state.
  if (hasUserErrors()) {
    state.companion.running = true
    state.companion.message = t('companion.undoing')

    const loop = () => {
      if (!state.companion.running) return
      const didUndo = companionCorrectErrorsStep()
      if (didUndo) {
        companionTimer = window.setTimeout(loop, Math.max(180, state.companion.speedMs))
        return
      }
      // now proceed normally
      state.companion.message = t('companion.begin')
      runCompanionLoop()
    }

    loop()
    return
  }

  state.companion.running = true
  state.companion.message = t('companion.begin')
  runCompanionLoop()
}

function syncHeldModifiers(e) {
  heldShift.value = !!e.shiftKey
  heldCtrlMeta.value = !!(e.ctrlKey || e.metaKey)
}

function onKeyDown(e) {
  syncHeldModifiers(e)

  // only reflect modifier-based mode when the game is being played
  const tag = (e.target?.tagName || '').toLowerCase()
  const isForm = tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'option'
  if (!isForm) boardActive.value = true

  // dismiss victory on any key
  if (state.victoryVisible) dismissVictoryIfVisible()

  if (isForm) return

  // Ctrl+Shift+Z / Cmd+Shift+Z => redo
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault()
    redo()
    return
  }

  // Ctrl+Z / Cmd+Z => undo
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault()
    undo()
    return
  }

  // Arrow navigation => disable hover until mouse is used again
  if (e.key.startsWith('Arrow')) keyboardNav.value = true

  if (e.key === 'ArrowUp') return void (e.preventDefault(), moveSelection(-1, 0, e.shiftKey))
  if (e.key === 'ArrowDown') return void (e.preventDefault(), moveSelection(1, 0, e.shiftKey))
  if (e.key === 'ArrowLeft') return void (e.preventDefault(), moveSelection(0, -1, e.shiftKey))
  if (e.key === 'ArrowRight') return void (e.preventDefault(), moveSelection(0, 1, e.shiftKey))

  if (e.key === 'Escape') {
    e.preventDefault()
    // clear multi-select back to the single active cell
    state.multiSelected = new Set([keyOf(state.selected.row, state.selected.col)])
    return
  }

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

    if (isCorner && isCenter) handleNumber(n, 'center', 'user')
    else if (isCorner) handleNumber(n, 'corner', 'user')
    else if (isCenter) handleNumber(n, 'center', 'user')
    else handleNumber(n, 'value', 'user')
  }
}

function onPointerDown(e) {
  dismissVictoryIfVisible()
  keyboardNav.value = false

  // Set active only when interacting with the board area
  const t = e?.target
  boardActive.value = !!t?.closest?.('.board, .board-wrap')
}

function onPointerMove() {
  keyboardNav.value = false
}

function onKeyUp(e) {
  syncHeldModifiers(e)
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('pointerdown', onPointerDown)
  window.removeEventListener('pointermove', onPointerMove)
  stopCompanion()
})

const conflictList = computed(() => Array.from(conflicts.value).map((k) => {
  const [r, c] = k.split(',').map((x) => Number(x))
  return { r, c, k }
}).filter((x) => Number.isFinite(x.r) && Number.isFinite(x.c)))

const conflictIndex = ref(0)

const statusText = computed(() => {
  if (state.finished) return t('statusSolved', state.score)
  if (conflicts.value.size) return t('statusConflicts', conflicts.value.size)
  return t('statusIdle')
})

function cycleConflict() {
  const list = conflictList.value
  if (!list.length) return
  conflictIndex.value = (conflictIndex.value + 1) % list.length
  const { r, c } = list[conflictIndex.value]
  selectCell({ row: r, col: c, mode: 'replace', source: 'user' })
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

// theme icon handled via lucide components

const sound = reactive({
  open: false,
  volume: Number(localStorage.getItem('bbs_volume') || 0.2),
  x: 0,
  y: 0,
})

const soundWrapEl = ref(null)
const soundBtnEl = ref(null)

function positionSoundPop() {
  const r = soundBtnEl.value?.getBoundingClientRect()
  if (!r) return

  const pad = 10
  const isMobilePop = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 560px)').matches
  const w = isMobilePop ? 220 : 52
  const h = isMobilePop ? 70 : 200

  const cx = r.left + r.width / 2
  const desiredLeft = cx
  const top = Math.min(window.innerHeight - h - pad, r.bottom + 10)

  // keep it on-screen (sound-pop is translateX(-50%))
  const minCenter = pad + w / 2
  const maxCenter = window.innerWidth - pad - w / 2
  sound.x = Math.max(minCenter, Math.min(maxCenter, desiredLeft))
  sound.y = Math.max(pad, top)
}

function toggleSound() {
  sound.open = !sound.open
  if (sound.open) {
    nextTick(() => positionSoundPop())
  }
}

function closeSound() {
  sound.open = false
}

function onDocPointerDown(e) {
  if (!sound.open) return
  const el = soundWrapEl.value
  if (!el) return
  if (!el.contains(e.target)) closeSound()
}

function onResize() {
  if (sound.open) positionSoundPop()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onResize, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('scroll', onResize, true)
})


const companionImgUrl = new URL('./assets/img/companion.png', import.meta.url).href


watch(
  () => sound.volume,
  () => {
    localStorage.setItem('bbs_volume', String(sound.volume))
    if (victoryAudio) victoryAudio.volume = sound.volume
    if (completeAudio) completeAudio.volume = sound.volume * 0.6
  }
)

</script>

<template>
  <div class="app">
    <!-- Victory overlay (dismisses on ANY key or click) -->
    <div class="victory" :class="{ show: state.victoryVisible }" :data-burst="victoryBurst" aria-hidden="true">
      <div class="victory-inner">
        <div class="victory-title">{{ t('victoryTitle') }}</div>
        <div class="victory-sub">{{ t('score') }}: <b>{{ state.score }}</b> · {{ t('best') }}: <b>{{ state.bestScore }}</b></div>
        <div class="victory-hint">{{ t('victoryHint') }}</div>
      </div>
    </div>

    <header class="top">
      <div class="top-row">
        <div class="brand">
          <div class="sigil" aria-hidden="true" />
          <div>
            <h1>{{ t('appTitle') }}</h1>
            <p class="subtitle">{{ t('subtitle') }}</p>
          </div>
        </div>

        <div class="header-actions">
          <CustomSelect v-model="lang" :options="langOptions" label="" />

          <div ref="soundWrapEl" class="sound-wrap">
            <Tooltip text="Sound" placement="bottom">
              <button
                ref="soundBtnEl"
                class="icon-btn"
                type="button"
                aria-label="Sound"
                @click="toggleSound"
              >
                <Volume2 class="vol" aria-hidden="true" />
              </button>
            </Tooltip>

            <div
              v-if="sound.open"
              class="sound-pop"
              :style="{ left: sound.x + 'px', top: sound.y + 'px' }"
            >
              <input
                class="sound-slider"
                type="range"
                min="0"
                max="1"
                step="0.05"
                v-model.number="sound.volume"
                aria-label="Volume"
              />
            </div>
          </div>

          <Tooltip v-if="!isMobile" :text="theme === 'dark' ? 'Light mode' : 'Dark mode'" placement="bottom">
            <button
              class="icon-btn"
              type="button"
              :aria-label="theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
              @click="toggleTheme"
            >
              <component :is="theme === 'dark' ? Sun : Moon" class="vol" aria-hidden="true" />
            </button>
          </Tooltip>

          <Tooltip v-else text="Draft (center marks)" placement="bottom">
            <button
              class="icon-btn draft-toggle"
              type="button"
              aria-label="Toggle draft (center marks)"
              @click="toggleCenterDraft"
            >
              <Pencil class="vol" aria-hidden="true" />
              <span v-if="!isCenterDraft" class="draft-badge" aria-hidden="true">OFF</span>
            </button>
          </Tooltip>
        </div>
      </div>

      <div class="hud" aria-label="HUD">
        <div class="hud-group" aria-label="Score">
          <div class="hud-item">
            <span class="hud-k">{{ t('score') }}</span>
            <span class="hud-v">{{ state.score }}</span>
          </div>
          <div class="hud-item">
            <span class="hud-k">{{ t('best') }}</span>
            <span class="hud-v">{{ state.bestScore }}</span>
          </div>
          <div v-if="state.multiSelected.size > 1" class="hud-item" aria-label="Selected cells">
            <span class="hud-k">Sel</span>
            <span class="hud-v hud-v-mono">{{ state.multiSelected.size }}</span>
          </div>
        </div>

        <div class="hud-group" aria-label="Timer and errors">
          <Tooltip text="Timer" placement="bottom">
            <div class="hud-item hud-item-icon" aria-label="Timer" tabindex="0">
              <Clock class="hud-ico" aria-hidden="true" />
              <span class="hud-v hud-v-mono">{{ timeLabel }}</span>
            </div>
          </Tooltip>

          <Tooltip text="Errors" placement="bottom">
            <div class="hud-item hud-item-icon" aria-label="Errors" tabindex="0">
              <AlertOctagon class="hud-ico" aria-hidden="true" />
              <span class="hud-v hud-v-mono">{{ state.errors }}</span>
            </div>
          </Tooltip>
        </div>
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
            :disable-same-number="state.companion.running"
            :highlight-key="state.companion.highlightKey"
            :decision="state.companion.decision"
            :flash-key="state.flashKey"
            :other-selections="otherSelections"
            :class="{ 'error-shake': errorActive }"
            @select="(pos) => selectCell(pos)"
          />

          <!-- mode indicator moved under Status -->

          <!-- Mobile number pad (match screenshot vibe) -->
          <section v-if="isMobile" class="pad" aria-label="Number pad">
            <div class="pad-tools" aria-label="Pad tools">
              <Tooltip text="Undo" placement="top">
                <button class="pad-icon" type="button" aria-label="Undo" @click="undo">
                  <Undo2 aria-hidden="true" />
                </button>
              </Tooltip>

              <Tooltip text="Erase" placement="top">
                <button class="pad-icon" type="button" aria-label="Erase" @click="clearSelected">
                  <Eraser aria-hidden="true" />
                </button>
              </Tooltip>

              <Tooltip text="Draft (center marks)" placement="top">
                <button
                  class="pad-icon pad-draft"
                  type="button"
                  aria-label="Draft (center marks)"
                  @click="toggleCenterDraft"
                >
                  <Pencil aria-hidden="true" />
                  <span v-if="!isCenterDraft" class="draft-badge" aria-hidden="true">OFF</span>
                </button>
              </Tooltip>
            </div>

            <div class="pad-nums" aria-label="Numbers">
              <button v-for="n in 9" :key="n" class="num" type="button" @click="mobilePress(n)">{{ n }}</button>
            </div>
          </section>

          <!-- Companion (moved below game) -->
          <section class="sidepanel-section companion-panel" aria-label="Companion">
            <div class="companion-head">
              <img class="companion-img" :src="companionImgUrl" alt="Companion" />
              <div>
                <div class="sidepanel-title" style="margin:0">{{ t('companionTitle') }}</div>
                <div class="companion-sub">{{ t('companion.decisionHint') }}</div>
              </div>
            </div>

            <div class="btn-row companion-row">
              <button class="btn" type="button" @click="toggleCompanionKill">
                {{ state.companion.running ? t('stopCompanion') : t('companionKill') }}
              </button>
            </div>

            <div class="speed">
              <div class="speed-head">
                <span class="speed-label">{{ t('companionSpeed') }}</span>
                <span class="speed-value">{{ (state.companion.speedMs / 1000).toFixed(2) }}s</span>
              </div>

              <select v-model="state.companion.speedPreset" class="speed-select">
                <option v-for="p in speedPresets" :key="p.key" :value="p.key">{{ p.label }}</option>
              </select>
            </div>

            <div class="companion-log" :class="{ active: state.companion.running }">
              <div class="companion-title">{{ t('companionLog') }}</div>
              <div class="companion-text">{{ state.companion.message }}</div>
              <div class="companion-hint">{{ t('companion.decisionHint') }}</div>
            </div>
          </section>

          <!-- Instructions (not a dropdown): subtle until hover -->
          <section class="instructions" aria-label="Instructions">
            <div class="instructions-title">{{ t('controlsTitle') }}</div>
            <ul class="help">
              <li><kbd>1</kbd>–<kbd>9</kbd> {{ t('c_place') }}</li>
              <li><kbd>Shift</kbd> + <kbd>1</kbd>–<kbd>9</kbd> {{ t('c_corner') }}</li>
              <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>1</kbd>–<kbd>9</kbd> {{ t('c_center') }}</li>
              <li><kbd>Backspace</kbd>/<kbd>Del</kbd> {{ t('c_clear') }}</li>
              <li>{{ t('c_move') }}</li>
              <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> {{ t('c_multi') }}</li>
            </ul>
          </section>
        </section>

        <aside class="sidepanel">
          <div class="sidepanel-section">
            <div class="sidepanel-title">Multiplayer</div>

            <div class="setup-row">
              <label class="field">
                <span class="field-label">Name</span>
                <input v-model="mpName" class="text" type="text" autocomplete="nickname" />
              </label>

              <label class="field">
                <span class="field-label">Color</span>
                <select v-model="mpColor" class="speed-select">
                  <option v-for="c in PASTEL_COLORS" :key="c.key" :value="c.value">{{ c.label }}</option>
                </select>
              </label>

              <label class="field">
                <span class="field-label">Mode</span>
                <select v-model="mpMode" class="speed-select">
                  <option value="coop">Co-op (same board)</option>
                  <option value="versus">Versus (race)</option>
                </select>
              </label>

              <div class="btn-row" style="grid-template-columns: 1fr 1fr">
                <button class="btn" type="button" @click="mpConnect(makeRoomCode(), mpMode)">Create</button>
                <button class="btn ghost" type="button" @click="mpDisconnect">Leave</button>
              </div>

              <label class="field">
                <span class="field-label">Join code</span>
                <div class="join-row">
                  <input v-model="mpRoom" class="text" type="text" placeholder="ABC1234" />
                  <button class="btn" type="button" @click="mpConnect(mpRoom.trim().toUpperCase(), mpMode)">Join</button>
                </div>
              </label>

              <div class="mp-meta">
                <div><b>Room:</b> {{ mpConnected ? mpRoom : '—' }}</div>
                <div v-if="mpError" class="mp-err">{{ mpError }}</div>
              </div>

              <div class="mp-meta" v-if="mpConnected">
                <div><b>Players:</b> {{ mpPlayers.length }}</div>
              </div>
            </div>
          </div>

          <div class="sidepanel-section">
            <div class="sidepanel-title">{{ t('huntSetup') }}</div>

            <div class="setup-row">
              <CustomSelect v-model="difficultyKey" :options="difficultiesLocalized" :label="t('difficulty')" />
            </div>

            <div class="btn-row">
              <button class="btn" type="button" @click="newHunt">{{ t('newHunt') }}</button>
              <button class="btn ghost" type="button" @click="undo">Undo</button>
            </div>

            <div class="btn-row">
              <button class="btn danger" type="button" @click="revealSolution">{{ t('reveal') }}</button>
              <button class="btn ghost" type="button" @click="resetSavedGame">Reset</button>
            </div>
          </div>

          <div class="sidepanel-section">
            <div class="remaining-row">
              <RemainingNumbers :grid="currentGrid" :title="t('remaining')" :all-text="t('allNumbersPlaced')" />

              <button
                class="status-inline"
                type="button"
                :class="{ clickable: conflictList.length }"
                :title="conflictList.length ? 'Jump to next conflict' : 'Status'"
                @click="conflictList.length ? cycleConflict() : null"
              >
                <div class="sidepanel-title" style="margin:0">{{ t('status') }}</div>
                <div class="status-text" :class="{ ok: state.finished, warn: conflictList.length && !state.finished }">{{ statusText }}</div>

                <div class="mode-ind mode-ind-inline" aria-label="Entry mode">
                  <span class="mode-chip" :class="{ on: effectiveEntryMode === 'value' }">Value</span>
                  <span class="mode-chip" :class="{ on: effectiveEntryMode === 'corner' }">Corner</span>
                  <span class="mode-chip" :class="{ on: effectiveEntryMode === 'center' }">Center</span>
                </div>
              </button>
            </div>
          </div>

          <!-- companion moved below board on purpose -->
        </aside>
      </div>
    </main>

    <footer class="footer">
      <span>Made for the Hunt. No bells were rung.</span>
    </footer>
  </div>
</template>

<style scoped>
.pad {
  display: grid;
  gap: 12px;
  margin-top: 10px;
}

/* top tool row like the screenshot */
.pad-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.pad-icon {
  width: 44px;
  height: 40px;
  padding: 0;
  border: 0;
  background: transparent;
  color: color-mix(in oklab, var(--bone) 78%, var(--mist));
  cursor: pointer;
  display: grid;
  place-items: center;
  position: relative;
}

.pad-icon :deep(svg) {
  width: 22px;
  height: 22px;
}

.pad-draft {
  margin: 0 auto; /* center draft button */
}

.draft-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 3px 6px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--panel) 84%, transparent);
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  color: color-mix(in oklab, var(--bone) 70%, var(--mist));
}

.pad-icon:hover {
  color: color-mix(in oklab, var(--bone) 86%, var(--gold));
}

/* 1..9 in a single row */
.pad-nums {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 6px;
}

.num {
  height: 52px;
  border: 0;
  background: transparent;
  color: color-mix(in oklab, var(--bone) 88%, white);
  font-weight: 900;
  font-size: 28px;
  font-family: 'Cinzel', ui-serif, Georgia, 'Times New Roman', Times, serif;
  cursor: pointer;
}

.num:hover {
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 8px;
  text-decoration-color: var(--gold);
}

@media (max-width: 560px) {
  .num {
    height: 50px;
    font-size: 26px;
  }
}

.tool {
  height: 44px;
  border-radius: 14px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: color-mix(in oklab, var(--panel) 78%, transparent);
  color: var(--bone);
  font-weight: 900;
  letter-spacing: 0.06em;
}

.tool.on {
  border-color: color-mix(in oklab, var(--gold) 55%, var(--ink));
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--gold) 35%, transparent) inset;
}

.tool.danger {
  border-color: color-mix(in oklab, var(--blood) 55%, var(--ink));
}

/* --- existing styles below (kept from previous file) --- */

.app {
  min-height: 100vh;
  min-height: 100dvh;
  padding:
    calc(18px + env(safe-area-inset-top))
    calc(14px + env(safe-area-inset-right))
    calc(18px + env(safe-area-inset-bottom))
    calc(14px + env(safe-area-inset-left));
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 14px;
  width: 100%;
  max-width: 100%;
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

.hud-group {
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in oklab, var(--panel) 86%, transparent);
  border: 1px solid color-mix(in oklab, var(--ink) 50%, transparent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hud-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.hud-item-icon {
  align-items: center;
}

.hud-k {
  opacity: 0.72;
  white-space: nowrap;
}

.hud-v {
  font-weight: 800;
  letter-spacing: 0.06em;
  text-align: right;
}

.hud-v-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  letter-spacing: 0.04em;
}

.hud-ico {
  width: 16px;
  height: 16px;
  opacity: 0.85;
}

.main {
  display: grid;
  place-items: center;
  width: 100%;
  overflow-x: clip;
}

.layout {
  max-width: 1100px;
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(320px, 560px) 1fr;
  grid-template-areas: 'board side';
  gap: 14px;
  align-items: start;
}

.board-wrap {
  grid-area: board;
  width: 100%;
  max-width: min(560px, 90vw);
  min-width: 0;
  display: grid;
  gap: 10px;
  overflow: hidden;
}

.mode-ind {
  display: flex;
  justify-content: center;
  gap: 8px;
  padding: 6px 0;
}

.mode-ind-inline {
  justify-content: flex-start;
  padding: 10px 0 0;
  opacity: 0.95;
}

.mode-chip {
  font-size: 12px;
  letter-spacing: 0.06em;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: color-mix(in oklab, var(--panel) 82%, transparent);
  color: color-mix(in oklab, var(--bone) 80%, var(--mist));
  opacity: 0.7;
}

.mode-chip.on {
  opacity: 1;
  border-color: color-mix(in oklab, var(--blood) 55%, var(--ink));
  background: color-mix(in oklab, var(--panel) 70%, var(--blood) 10%);
  color: color-mix(in oklab, var(--bone) 90%, white);
}

.sidepanel {
  grid-area: side;
  min-width: 0;
  position: sticky;
  top: 16px;
  display: grid;
  gap: 12px;
}

.board-wrap :deep(.board) {
  width: 100%;
  max-width: 100%;
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

/* sidepanel definition moved up (grid-area aware) */

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

.top-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.header-actions {
  display: grid;
  grid-auto-flow: column;
  gap: 10px;
  align-items: start;
}

.header-actions :deep(.trigger) {
  height: 44px;
  padding: 10px 12px;
  min-width: 170px;
}

.sound-wrap {
  position: relative;
  display: grid;
  align-items: center;
}

.vol {
  width: 22px;
  height: 22px;
}

.sound-pop {
  position: fixed;
  z-index: 2000;
  transform: translateX(-50%);
  width: 52px;
  height: 200px;
  padding: 10px 10px;
  border-radius: 14px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: color-mix(in oklab, var(--panel) 88%, black);
  box-shadow: 0 22px 80px rgba(0, 0, 0, 0.65);
  display: grid;
  place-items: center;
}

.sound-slider {
  width: 180px; /* becomes vertical after rotate */
  height: 26px;
  transform: rotate(-90deg);
  transform-origin: center;
  accent-color: var(--blood);
  background: transparent;
}

@media (max-width: 560px) {
  .sound-pop {
    width: 220px;
    height: auto;
    transform: translateX(-50%);
  }

  .sound-slider {
    width: 200px;
    height: 26px;
    transform: none;
  }
}

.companion-head {
  display: flex;
  gap: 12px;
  align-items: center;
}

.companion-img {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  object-fit: cover;
  background: color-mix(in oklab, var(--panel) 80%, transparent);
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  box-shadow: 0 14px 40px var(--shadow);
  filter: drop-shadow(0 0 18px color-mix(in oklab, var(--blood) 20%, transparent)) contrast(1.12) saturate(1.05);
}

:root[data-theme='light'] .companion-img {
  filter: drop-shadow(0 0 18px color-mix(in oklab, var(--blood) 18%, transparent)) contrast(1.1) saturate(1.0);
}

.companion-sub {
  opacity: 0.8;
  font-size: 12px;
  line-height: 1.2;
}

.setup-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  align-items: end;
}

.field {
  display: grid;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.8;
}

.text {
  width: 100%;
  height: 44px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: color-mix(in oklab, var(--panel) 90%, transparent);
  color: var(--bone);
}

.text:focus-visible {
  outline: 2px solid color-mix(in oklab, var(--blood) 60%, white);
  outline-offset: 2px;
}

.join-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
}

.mp-meta {
  opacity: 0.85;
  font-size: 12px;
  display: grid;
  gap: 6px;
}

.mp-err {
  color: color-mix(in oklab, var(--blood) 75%, var(--bone));
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
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

/* companion panel: keep primary action bigger */
.companion-row {
  grid-template-columns: 1.4fr 0.8fr 0.8fr;
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

.companion-hint {
  margin-top: 8px;
  opacity: 0.72;
  font-size: 12px;
}

.remaining-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: start;
}

.status-inline {
  padding: 10px 12px;
  border-radius: 12px;
  background: color-mix(in oklab, var(--panel) 86%, transparent);
  border: 1px solid color-mix(in oklab, var(--ink) 50%, transparent);
  text-align: left;
  color: var(--bone);
}

.status-inline.clickable {
  cursor: pointer;
}

.status-inline.clickable:hover {
  border-color: color-mix(in oklab, var(--gold) 45%, var(--ink));
}

.status-text {
  font-weight: 800;
  letter-spacing: 0.04em;
  color: color-mix(in oklab, var(--bone) 80%, var(--mist));
}

.status-text.ok {
  color: color-mix(in oklab, var(--sage) 70%, var(--bone));
}

.status-text.warn {
  color: color-mix(in oklab, var(--blood) 75%, var(--bone));
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
  transition: opacity 600ms ease;
  display: grid;
  place-items: center;
  z-index: 50;
  background:
    radial-gradient(900px 600px at 50% 40%, color-mix(in oklab, var(--blood) 28%, transparent), transparent 62%),
    radial-gradient(1400px 900px at 50% 120%, color-mix(in oklab, var(--mist) 14%, transparent), transparent 65%),
    rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(6px);
}

.victory.show {
  opacity: 1;
}

.victory-inner {
  padding: 18px;
  border-radius: 18px;
  background: color-mix(in oklab, var(--panel) 76%, black);
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  box-shadow: 0 28px 110px rgba(0, 0, 0, 0.75);
  text-align: center;
  animation: victory-rise 1400ms cubic-bezier(0.15, 0.85, 0.2, 1);
}

.victory-title {
  font-family: 'Cinzel', ui-serif;
  letter-spacing: 0.12em;
  font-weight: 900;
  font-size: clamp(28px, 6vw, 56px);
  color: color-mix(in oklab, var(--bone) 90%, white);
  text-shadow: 0 0 22px color-mix(in oklab, var(--blood) 40%, transparent);
}

.victory-sub {
  margin-top: 12px;
  opacity: 0.92;
  font-size: clamp(16px, 2.6vw, 20px);
}

.victory-hint {
  margin-top: 12px;
  opacity: 0.8;
  font-size: 14px;
  letter-spacing: 0.06em;
}

@keyframes victory-rise {
  0% { transform: translateY(18px) scale(0.96); filter: blur(4px); opacity: 0.85; }
  60% { transform: translateY(0) scale(1.01); filter: blur(0); opacity: 1; }
  100% { transform: translateY(0) scale(1); filter: blur(0); opacity: 1; }
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
  /* On mobile/tablet: Hunt setup below header */
  .layout {
    grid-template-columns: 1fr;
    grid-template-areas:
      'side'
      'board';
  }

  .sidepanel {
    position: static;
  }

  .board-wrap {
    max-width: 100%;
  }

  .remaining-row {
    grid-template-columns: 1fr;
  }

  .status-inline {
    margin-top: 10px;
  }
}

@media (max-width: 980px) {
  .hud {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 450px) {
  .board-wrap {
    max-width: 320px;
    margin: 0 auto;
  }
}

@media (max-width: 560px) {
  .app {
    padding:
      calc(14px + env(safe-area-inset-top))
      calc(10px + env(safe-area-inset-right))
      calc(16px + env(safe-area-inset-bottom))
      calc(10px + env(safe-area-inset-left));
    gap: 12px;
  }

  /* remove header flex container on mobile */
  .top-row {
    display: block;
  }

  .header-actions {
    margin-top: 10px;
    justify-content: space-between;
  }

  .header-actions :deep(.trigger) {
    min-width: 0;
  }

  .board-wrap {
    max-width: 408px;
    margin: 0 auto;
  }

  .hud {
    grid-template-columns: 1fr;
  }

  .pill { padding: 9px 10px; }

  .sidepanel-section {
    padding: 12px 12px;
  }
}
</style>
