<script setup>
import SudokuCell from './SudokuCell.vue'

const props = defineProps({
  cells: { type: Array, required: true }, // 9x9 cell objects
  selected: { type: Object, required: true }, // {row,col}
  multiSelected: { type: Object, required: true }, // Set of "r,c"
  conflicts: { type: Object, required: true }, // Set of "r,c"
  disableHover: { type: Boolean, default: false },
  highlightKey: { type: String, default: '' }, // "r,c" for companion kill animation
  decision: { type: Object, default: () => ({ r: -1, c: -1, n: 0, kind: '' }) },
  flashKey: { type: String, default: '' },
})

const emit = defineEmits(['select'])

function onSelect(pos) {
  emit('select', pos)
}

function isRelated(r, c) {
  const sr = props.selected.row
  const sc = props.selected.col
  if (sr === -1 || sc === -1) return false

  if (r === sr || c === sc) return true
  const br = Math.floor(r / 3)
  const bc = Math.floor(c / 3)
  const sbr = Math.floor(sr / 3)
  const sbc = Math.floor(sc / 3)
  if (br === sbr && bc === sbc) return true

  const selectedVal = props.cells?.[sr]?.[sc]?.value
  if (selectedVal && props.cells[r][c].value === selectedVal) return true

  return false
}

function boxClass(r, c) {
  return {
    'thick-left': c % 3 === 0,
    'thick-top': r % 3 === 0,
  }
}

function decisionFlags(r, c) {
  const d = props.decision
  if (!d || d.r === -1 || d.c === -1) {
    return { decisionFocus: false, decisionRow: false, decisionCol: false, decisionBox: false }
  }
  const sameRow = r === d.r
  const sameCol = c === d.c
  const sameBox = Math.floor(r / 3) === Math.floor(d.r / 3) && Math.floor(c / 3) === Math.floor(d.c / 3)
  return {
    decisionFocus: r === d.r && c === d.c,
    decisionRow: sameRow,
    decisionCol: sameCol,
    decisionBox: sameBox,
  }
}
</script>

<template>
  <div class="board" :class="{ 'no-hover': disableHover }" role="grid" aria-label="Sudoku board">
    <template v-for="(row, r) in cells" :key="r">
      <SudokuCell
        v-for="(cell, c) in row"
        :key="`${r}-${c}`"
        :cell="cell"
        :row="r"
        :col="c"
        :selected="selected.row === r && selected.col === c"
        :multi="multiSelected.has(`${r},${c}`)"
        :disable-hover="disableHover"
        :highlighted="highlightKey === `${r},${c}`"
        :flashed="flashKey === `${r},${c}`"
        :decision-flags="decisionFlags(r, c)"
        :related="isRelated(r, c)"
        :conflicted="conflicts.has(`${r},${c}`)"
        class="board-cell"
        :class="boxClass(r, c)"
        @select="onSelect"
      />
    </template>
  </div>
</template>

<style scoped>
.board {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 0;
  padding: 0;
  border-radius: 0;
  background: transparent;
  border: 0;
}

/* Thick separators without affecting layout width */
.board-cell.thick-left { box-shadow: inset 3px 0 0 color-mix(in oklab, var(--ink) 70%, transparent); }
.board-cell.thick-top { box-shadow: inset 0 3px 0 color-mix(in oklab, var(--ink) 70%, transparent); }

.board-cell.thick-left.thick-top {
  box-shadow:
    inset 3px 0 0 color-mix(in oklab, var(--ink) 70%, transparent),
    inset 0 3px 0 color-mix(in oklab, var(--ink) 70%, transparent);
}
</style>
