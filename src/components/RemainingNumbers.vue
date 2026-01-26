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

const remaining = computed(() => {
  const out = []
  for (let n = 1; n <= 9; n++) {
    const left = 9 - counts.value[n]
    if (left > 0) out.push({ n, left })
  }
  return out
})
</script>

<template>
  <div class="rem" aria-label="Remaining numbers">
    <div class="title">Remaining</div>
    <div class="grid">
      <div v-for="item in remaining" :key="item.n" class="pill">
        <div class="n">{{ item.n }}</div>
        <div class="left">×{{ item.left }}</div>
      </div>
      <div v-if="remaining.length === 0" class="all">All numbers placed.</div>
    </div>
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

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.pill {
  border-radius: 12px;
  padding: 10px 10px;
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  background: color-mix(in oklab, var(--panel) 86%, transparent);
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.n {
  font-weight: 800;
  letter-spacing: 0.06em;
  color: color-mix(in oklab, var(--bone) 85%, white);
}

.left {
  opacity: 0.8;
  color: color-mix(in oklab, var(--bone) 70%, var(--mist));
}

.all {
  grid-column: 1 / -1;
  opacity: 0.75;
}
</style>
