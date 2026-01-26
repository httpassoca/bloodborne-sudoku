<script setup>
const props = defineProps({
  cell: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  related: { type: Boolean, default: false },
  conflicted: { type: Boolean, default: false },
  row: { type: Number, required: true },
  col: { type: Number, required: true },
})

const emit = defineEmits(['select'])

function onClick() {
  emit('select', { row: props.row, col: props.col })
}

function hasCorner() {
  return props.cell.cornerNotes && props.cell.cornerNotes.size > 0
}

function hasCenter() {
  return props.cell.centerNotes && props.cell.centerNotes.size > 0
}

function cornerAt(n) {
  return props.cell.cornerNotes?.has(n)
}

const cornerSlots = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
]
</script>

<template>
  <button
    class="cell"
    :class="{ selected, related, given: cell.given, conflicted }"
    type="button"
    @click="onClick"
  >
    <div v-if="cell.value" class="value">{{ cell.value }}</div>

    <div v-else class="notes">
      <div v-if="hasCorner()" class="corner-grid" aria-hidden="true">
        <div v-for="(rowNums, ri) in cornerSlots" :key="ri" class="corner-row">
          <span
            v-for="n in rowNums"
            :key="n"
            class="corner"
            :class="{ on: cornerAt(n) }"
          >
            {{ cornerAt(n) ? n : '' }}
          </span>
        </div>
      </div>

      <div v-if="hasCenter()" class="center-notes" aria-hidden="true">
        {{ Array.from(cell.centerNotes).sort((a, b) => a - b).join(' ') }}
      </div>
    </div>
  </button>
</template>

<style scoped>
.cell {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-style: solid;
  border-color: color-mix(in oklab, var(--ink) 70%, transparent);
  border-width: 1px 0 0 1px; /* draw grid using top/left to avoid double-thick lines */
  background: color-mix(in oklab, var(--panel) 80%, transparent);
  color: var(--bone);
  padding: 0;
  border-radius: 0px;
  cursor: pointer;
  transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
}

.cell:hover {
  transform: translateY(-1px);
  border-color: color-mix(in oklab, var(--blood) 55%, var(--ink));
}

.cell.selected {
  outline: 2px solid color-mix(in oklab, var(--blood) 70%, white);
  outline-offset: -2px;
  background: color-mix(in oklab, var(--panel) 70%, var(--blood) 10%);
}

.cell.related:not(.selected) {
  background: color-mix(in oklab, var(--panel) 70%, var(--blood) 6%);
}

.cell.given {
  background: color-mix(in oklab, var(--panel) 85%, transparent);
}

.cell.conflicted {
  border-color: color-mix(in oklab, var(--blood) 75%, var(--ink));
  box-shadow:
    0 0 0 1px color-mix(in oklab, var(--blood) 70%, transparent) inset,
    0 0 18px color-mix(in oklab, var(--blood) 25%, transparent);
  animation: conflict-pulse 260ms ease;
}

@keyframes conflict-pulse {
  0% { background: color-mix(in oklab, var(--panel) 60%, var(--blood) 0%); }
  40% { background: color-mix(in oklab, var(--panel) 55%, var(--blood) 14%); }
  100% { background: color-mix(in oklab, var(--panel) 80%, transparent); }
}

.value {
  display: grid;
  place-items: center;
  height: 100%;
  font-size: clamp(18px, 2.8vw, 34px);
  font-weight: 700;
  letter-spacing: 0.02em;
}

.cell.given .value {
  color: color-mix(in oklab, var(--bone) 80%, var(--ink));
}

.notes {
  position: absolute;
  inset: 0;
}

.corner-grid {
  position: absolute;
  inset: 8% 8% auto 8%;
  display: grid;
  gap: 2px;
}

.corner-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.corner {
  display: grid;
  place-items: center;
  min-height: 0;
  font-size: clamp(8px, 1.2vw, 11px);
  opacity: 0.95;
  color: color-mix(in oklab, var(--bone) 65%, var(--ink));
}

.corner.on {
  color: color-mix(in oklab, var(--bone) 85%, white);
}

.center-notes {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding-top: 2px;
  font-size: clamp(10px, 1.5vw, 14px);
  letter-spacing: 0.08em;
  color: color-mix(in oklab, var(--bone) 75%, var(--ink));
}
</style>
