<script setup>
import SudokuCell from './SudokuCell.vue'

const props = defineProps({
  cells: { type: Array, required: true }, // 9x9 cell objects
  selected: { type: Object, required: true }, // {row,col}
  multiSelected: { type: Object, required: true }, // Set of "r,c"
  conflicts: { type: Object, required: true }, // Set of "r,c"
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
    // draw the 3x3 separators by thickening the top/left edges of each box
    'thick-left': c % 3 === 0,
    'thick-top': r % 3 === 0,

    // outer border
    'thick-right': c === 8,
    'thick-bottom': r === 8,
  }
}
</script>

<template>
  <div class="board" role="grid" aria-label="Sudoku board">
    <template v-for="(row, r) in cells" :key="r">
      <SudokuCell
        v-for="(cell, c) in row"
        :key="`${r}-${c}`"
        :cell="cell"
        :row="r"
        :col="c"
        :selected="selected.row === r && selected.col === c"
        :multi="multiSelected.has(`${r},${c}`)"
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
  padding: 10px;
  border-radius: 16px;
  background:
    radial-gradient(1000px 600px at 20% 10%, color-mix(in oklab, var(--blood) 18%, transparent), transparent 55%),
    radial-gradient(900px 600px at 90% 30%, color-mix(in oklab, var(--violet) 10%, transparent), transparent 60%),
    linear-gradient(
      180deg,
      color-mix(in oklab, var(--panel) 92%, transparent),
      color-mix(in oklab, var(--panel) 82%, black)
    );
  border: 1px solid color-mix(in oklab, var(--ink) 55%, transparent);
  box-shadow:
    0 18px 60px var(--shadow),
    0 0 0 1px rgba(255, 255, 255, 0.03) inset;
}

/* since each cell draws top/left borders, thickening those gives crisp 3x3 separators */
.board-cell.thick-left { border-left-width: 3px; }
.board-cell.thick-top { border-top-width: 3px; }

/* outer border */
.board-cell.thick-right { border-right-width: 3px; }
.board-cell.thick-bottom { border-bottom-width: 3px; }

@media (max-width: 520px) {
  .board { padding: 8px; }
}
</style>
