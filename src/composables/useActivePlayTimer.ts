import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

type TimerState = {
  activePlayMs: number
  finished: boolean
}

export function useActivePlayTimer(opts: { state: TimerState; lastActiveAt: Ref<number | null> }) {
  const { state, lastActiveAt } = opts

  // realtime timer tick (only while tab is visible)
  const nowTick = ref(Date.now())
  let timerId: number | null = null

  function stopNowTick() {
    if (timerId) {
      window.clearInterval(timerId)
      timerId = null
    }
    if (lastActiveAt.value && !state.finished) {
      state.activePlayMs += Math.max(0, Date.now() - lastActiveAt.value)
    }
    lastActiveAt.value = null
  }

  function startNowTick() {
    if (timerId) return
    if (!state.finished) lastActiveAt.value = Date.now()
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

    const live = lastActiveAt.value ? now - lastActiveAt.value : 0
    return Math.max(0, Math.floor((state.activePlayMs + Math.max(0, live)) / 1000))
  })

  const timeLabel = computed(() => {
    const sec = elapsedSeconds.value
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  })

  return { elapsedSeconds, timeLabel, startNowTick, stopNowTick }
}
