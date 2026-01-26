<script setup>
import { computed } from 'vue'

const props = defineProps({
  grid: { type: Array, required: true }, // 9x9 numbers (0-9)
})

const counts = computed(() => {
  const c = Array(10).fill(0)
  for (let r = 0; r < 9; r++) {
    for (let col = 0; col < 9; col++) {
      const v = props.grid[r][col]
      if (v >= 1 && v <= 9) c[v]++
    }
  }
  return c
})

const leftByNumber = computed(() => {
  const out = Array(10).fill(0)
  for (let n = 1; n <= 9; n++) out[n] = Math.max(0, 9 - counts.value[n])
  return out
})

// Keep a square 3x3 grid by rendering 9 slots; hide completed numbers.
const slots = computed(() => {
  return Array.from({ length: 9 }, (_, i) => {
    const n = i + 1
    const left = leftByNumber.value[n]
    return { n, left, show: left > 0 }
  })
})

const anyRemaining = computed(() => slots.value.some((s) => s.show))
</script>

<template>
  <div class="rem" aria-label="Remaining numbers">
    <div class="title">Remaining</div>

    <div class="square">
      <div class="grid">
        <div
          v-for="s in slots"
          :key="s.n"
          class="pill"
          :class="{ hidden: !s.show }"
        >
          <div class="n">{{ s.n }}</div>
          <div class="left">×{{ s.left }}</div>
        </div>
      </div>
    </div>

    <div v-if="!anyRemaining" class="all">All numbers placed.</div>
  </div>
</template>

<style scoped>
.rem {
  display: grid;
  gap: 10px;
}

.title {
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 12px;
  opacity: 0.85;
}

.square {
  width: min(260px, 100%);
  aspect-ratio: 1 / 1;
}

.grid {
  height: 100%;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.pill {
  border-radius: 12px;
  padding: 10px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: color-mix(in oklab, var(--panel) 86%, transparent);
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 6px;
  aspect-ratio: 1 / 1;
}

.pill.hidden {
  opacity: 0;
  pointer-events: none;
}

.n {
  font-weight: 900;
  letter-spacing: 0.06em;
  font-size: 26px; /* bigger glyphs, same square size */
  line-height: 1;
  color: color-mix(in oklab, var(--bone) 85%, white);
}

.left {
  opacity: 0.75;
  font-size: 12px;
  color: color-mix(in oklab, var(--bone) 70%, var(--mist));
}

.all {
  opacity: 0.75;
}
</style>
