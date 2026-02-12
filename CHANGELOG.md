# Changelog

All notable changes to **bloodborne-sudoku** will be documented in this file.

## Unreleased

- Tooltips (custom component, focus + hover)
- Insert-mode indicator improvements
- A11y improvements

## 2026-02-12

- Migrated project to TypeScript.
- Added Vitest unit tests for sudoku generation/conflicts and logic solver.
- Undo/redo improvements (including drafts), redo shortcut.
- Draft cleanup now removes placed number from row/col/box drafts.
- Timer accuracy fixes (active play time, visibility-aware).
- UI refinements (status placement/colors, select hover transitions).
- CI workflow added (typecheck + tests + build on push).

## 2026-01-30

- Mobile keypad redesign (icon tools + 1–9 row), draft toggle behavior.
- Responsive layout improvements and grid max-width tweaks.
- Favicon + cursor customization.
- Companion panel moved below the board.
