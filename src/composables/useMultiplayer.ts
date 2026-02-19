import { computed, ref, watch, type Ref } from 'vue'
import { makeClientId, makeRoomCode, makeSupabase, normalizeName } from '../lib/multiplayer'
import { makeCell, type Cell } from '../lib/cell'

type SudokuState = {
  puzzle: number[][] | null
  solution: number[][] | null
  cells: Cell[][]
  selected: { row: number; col: number }
  startedAt: number
  activePlayMs: number
  finished: boolean
  finishedAt: number | null
  victoryVisible: boolean
  score: number
  errors: number
  undoStack: any[]
  redoStack: any[]
  companion: { running: boolean }
}

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

function initials(name: string) {
  const t = String(name || '').trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  const a = parts[0]?.[0] || ''
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : ''
  return (a + b).toUpperCase().slice(0, 2) || '?'
}

export function useMultiplayer(opts: {
  state: SudokuState
  keyOf: (r: number, c: number) => string
  scheduleSaveGame: () => void
  stopCompanion: () => void
  lastActiveAt: Ref<number | null>
}) {
  const { state, keyOf, scheduleSaveGame, stopCompanion, lastActiveAt } = opts

  const mpEnabled = ref(true)
  const mpMode = ref<'coop' | 'versus'>('coop')
  const mpModeOptions = [
    { key: 'coop', label: 'Co-op (same board)' },
    { key: 'versus', label: 'Versus (race)' },
  ]
  const mpUiOpen = ref(true)
  const mpRoom = ref('')
  const mpName = ref(localStorage.getItem('bbs_name') || 'Hunter')
  watch(mpName, () => localStorage.setItem('bbs_name', mpName.value), { immediate: true })

  const mpClientId = makeClientId()

  const mpColor = ref(localStorage.getItem('bbs_mp_color') || randomPastel())
  watch(mpColor, () => localStorage.setItem('bbs_mp_color', mpColor.value), { immediate: true })

  const mpColorOpen = ref(false)

  let supabase: any = null
  let mpChannel: any = null
  const mpConnected = ref(false)
  const mpPlayers = ref<any[]>([])
  const mpError = ref('')

  function mpIsActive() {
    return mpEnabled.value && mpConnected.value && mpChannel && mpRoom.value
  }

  function mpBroadcast(payload: any) {
    if (!mpIsActive()) return
    mpChannel.send({ type: 'broadcast', event: 'msg', payload })
  }

  function mpTrack(selKey?: string) {
    if (!mpIsActive()) return
    mpChannel.track({
      name: normalizeName(mpName.value),
      color: mpColor.value,
      sel: selKey || keyOf(state.selected.row, state.selected.col),
      joinedAt: Date.now(),
    })
  }

  function setMpColor(c: string) {
    mpColor.value = c
    mpColorOpen.value = false
    mpTrack()
  }

  const otherSelections = computed(() => {
    // map cellKey -> [{ color, label }]
    const map = new Map<string, Array<{ color: string; label: string; name: string }>>()
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

  function coopApplyState(s: any) {
    if (!s?.puzzle || !Array.isArray(s?.cells)) return
    state.puzzle = s.puzzle
    state.solution = s.solution || state.solution
    state.cells = s.cells.map((row: any[], r: number) =>
      row.map((raw: any, c: number) => {
        const given = (s.puzzle?.[r]?.[c] || 0) !== 0
        const cell = makeCell(raw.value || 0, given)
        cell.cornerNotes = new Set(Array.isArray(raw.cornerNotes) ? raw.cornerNotes : [])
        cell.centerNotes = new Set(Array.isArray(raw.centerNotes) ? raw.centerNotes : [])
        return cell
      })
    )
    state.startedAt = Number(s.startedAt || Date.now())
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

  async function mpConnect(room: string, mode: 'coop' | 'versus') {
    mpError.value = ''
    mpRoom.value = room
    mpMode.value = mode

    if (!supabase) {
      try {
        supabase = makeSupabase()
      } catch (e: any) {
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
      const st = ch.presenceState()
      const out: any[] = []
      for (const k of Object.keys(st)) {
        const arr = st[k] || []
        for (const p of arr) out.push({ id: k, ...(p || {}) })
      }
      mpPlayers.value = out
    })

    ch.on('broadcast', { event: 'msg' }, ({ payload }: any) => {
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

    const { error } = await ch.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        mpConnected.value = true
        // multiplayer: disable companion
        if (state.companion.running) stopCompanion()
        state.companion.running = false

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

  // public helper for UI
  function makeNewRoomCode() {
    return makeRoomCode()
  }

  const makeRoomCodeFn = makeNewRoomCode

  return {
    PASTEL_COLORS,
    mpEnabled,
    mpMode,
    mpModeOptions,
    mpUiOpen,
    mpRoom,
    mpName,
    mpClientId,
    mpColor,
    mpColorOpen,
    mpConnected,
    mpPlayers,
    mpError,
    otherSelections,
    mpIsActive,
    mpBroadcast,
    mpConnect,
    mpDisconnect,
    mpTrack,
    setMpColor,
    makeNewRoomCode,
    makeRoomCode: makeRoomCodeFn,
  }
}
