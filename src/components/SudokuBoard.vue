<script setup>
import SudokuCell from './SudokuCell.vue'

const props = defineProps({
  cells: { type: Array, required: true },
  selected: { type: Object, required: true },
  multiSelected: { type: Object, required: true },
  conflicts: { type: Object, required: true },
  disableHover: { type: Boolean, default: false },
  disableSameNumber: { type: Boolean, default: false },
  highlightKey: { type: String, default: '' },
  decision: { type: Object, default: () => ({ r: -1, c: -1, n: 0, kind: '' }) },
  flashKey: { type: String, default: '' },
  otherSelections: { type: Object, default: () => new Map() },
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

  return false
}

function isSameNumber(r, c) {
  if (props.disableSameNumber) return false
  const sr = props.selected.row
  const sc = props.selected.col
  if (sr === -1 || sc === -1) return false
  const v = props.cells?.[sr]?.[sc]?.value
  if (!v) return false
  return props.cells[r][c].value === v
}

function gridLineClass(r, c) {
  return {
    // avoid double borders: we draw only TOP/LEFT borders on cells
    'no-top': r === 0,
    'no-left': c === 0,

    // 3x3 separators
    'thick-top': r === 3 || r === 6,
    'thick-left': c === 3 || c === 6,
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
        :same-number="isSameNumber(r, c)"
        :conflicted="conflicts.has(`${r},${c}`)"
        :others="otherSelections.get(`${r},${c}`) || []"
        class="board-cell"
        :class="gridLineClass(r, c)"
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
  border: 2px solid color-mix(in oklab, var(--ink) 70%, transparent);
}
</style>
