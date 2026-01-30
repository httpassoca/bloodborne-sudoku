<script setup>
const props = defineProps({
  cell: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  multi: { type: Boolean, default: false },
  disableHover: { type: Boolean, default: false },
  highlighted: { type: Boolean, default: false },
  decisionFlags: { type: Object, default: () => ({ decisionFocus: false, decisionRow: false, decisionCol: false, decisionBox: false }) },
  flashed: { type: Boolean, default: false },
  related: { type: Boolean, default: false },
  sameNumber: { type: Boolean, default: false },
  conflicted: { type: Boolean, default: false },
  row: { type: Number, required: true },
  col: { type: Number, required: true },
})

const emit = defineEmits(['select'])

function onClick(e) {
  // shift-click toggles multi-selection (mobile-friendly)
  emit('select', { row: props.row, col: props.col, additive: e?.shiftKey })
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
    :class="{
      selected,
      multi: multi && !selected,
      related,
      'same-number': sameNumber,
      given: cell.given,
      conflicted,
      highlighted,
      'no-hover': disableHover,
      'dec-row': decisionFlags.decisionRow,
      'dec-col': decisionFlags.decisionCol,
      'dec-box': decisionFlags.decisionBox,
      'dec-focus': decisionFlags.decisionFocus,
      flashed,
    }"
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
  border-width: 1px 0 0 1px; /* draw only top/left borders to avoid per-row gaps */
  background: color-mix(in oklab, var(--panel) 80%, transparent);
  color: var(--bone);
  padding: 0;
  border-radius: 0px;
  cursor: pointer;
  transition: background 160ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .cell:hover {
    background: color-mix(in oklab, var(--panel) 74%, var(--blood) 8%);
  }
}

.cell.no-hover:hover {
  background: color-mix(in oklab, var(--panel) 80%, transparent);
}

.cell.selected {
  outline: 2px solid color-mix(in oklab, var(--blood) 70%, white);
  outline-offset: -2px;
  background: color-mix(in oklab, var(--panel) 70%, var(--blood) 10%);
  z-index: 2;
}

.cell.related:not(.selected) {
  background: color-mix(in oklab, var(--panel) 70%, var(--blood) 6%);
}

/* When same number is selected elsewhere, outline instead of background */
.cell.same-number:not(.selected) {
  outline: 2px solid color-mix(in oklab, var(--blood) 55%, transparent);
  outline-offset: -2px;
  background: color-mix(in oklab, var(--panel) 80%, transparent);
}

/* Companion decision highlighting (row/col/box overlay tints) */
.cell.dec-row:not(.selected) {
  background: color-mix(in oklab, var(--panel) 72%, var(--blood) 10%);
}

.cell.dec-col:not(.selected) {
  background: color-mix(in oklab, var(--panel) 72%, var(--inkblue) 11%);
}

.cell.dec-box:not(.selected) {
  background: color-mix(in oklab, var(--panel) 72%, var(--ember) 10%);
}

/* focus cell: stronger, and stacks nicely */
.cell.dec-focus:not(.selected) {
  background: color-mix(in oklab, var(--panel) 62%, var(--gold) 16%);
  box-shadow:
    0 0 0 1px color-mix(in oklab, var(--gold) 55%, transparent) inset,
    0 0 20px color-mix(in oklab, var(--gold) 28%, transparent);
}

.cell.multi {
  background: color-mix(in oklab, var(--panel) 68%, var(--mist) 10%);
  outline: 2px solid color-mix(in oklab, var(--mist) 45%, transparent);
  outline-offset: -2px;
  z-index: 1;
}

/* grid line helpers (from SudokuBoard) */
.cell.no-top { border-top-width: 0; }
.cell.no-left { border-left-width: 0; }
.cell.thick-top { border-top-width: 3px; }
.cell.thick-left { border-left-width: 3px; }

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

.cell.highlighted {
  position: relative;
  animation: companion-mark 520ms ease;
  box-shadow:
    0 0 0 1px color-mix(in oklab, var(--gold) 55%, transparent) inset,
    0 0 22px color-mix(in oklab, var(--gold) 35%, transparent);
}

.cell.flashed {
  animation: mistake-flash 420ms ease;
  box-shadow:
    0 0 0 1px color-mix(in oklab, var(--blood) 70%, transparent) inset,
    0 0 18px color-mix(in oklab, var(--blood) 35%, transparent);
}

@keyframes mistake-flash {
  0% { filter: brightness(1); }
  35% { filter: brightness(1.25); }
  100% { filter: brightness(1); }
}

@keyframes companion-mark {
  0% { transform: scale(0.98); filter: brightness(1); }
  40% { transform: scale(1.02); filter: brightness(1.12); }
  100% { transform: scale(1); filter: brightness(1); }
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
  opacity: 0.65; /* lower */
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
  letter-spacing: 0.01em; /* minimal */
  color: color-mix(in oklab, var(--bone) 82%, white);
  /* add readability like stroke/shadow */
  text-shadow:
    0 1px 0 rgba(0, 0, 0, 0.55),
    0 0 10px rgba(0, 0, 0, 0.35);
}

@supports (-webkit-text-stroke: 1px black) {
  .center-notes {
    -webkit-text-stroke: 0.35px rgba(0, 0, 0, 0.55);
    paint-order: stroke fill;
  }
}
</style>
