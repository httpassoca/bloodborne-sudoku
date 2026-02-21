# Changelog

All notable changes to **bloodborne-sudoku** will be documented in this file.

## Unreleased

- Fixing mobile board width
- UI: replace Sudoku board CSS grid layout with flexbox (no CSS Grid for the board).
- Refactor App.vue: extract cell helpers into `src/lib/cell.ts`, move theme/lang/multiplayer logic into composables, and extract persistence/timer/scoring into dedicated modules.
- Mobile fix: restore theme toggle on mobile and adjust layout alignment/overflow to avoid clipped board.
- Mobile UX: add compact HUD bar above the grid (score/errors/time) and switch some mobile sizing to `rem`.
- Add `.mise.toml` to pin engine versions (Node) and refresh README dev instructions.
- Add Husky pre-commit hook to run tests/typecheck and require CHANGELOG.md updates for code changes (and keep Husky v10 compatibility).

## 2026-02-17

- Added a “works forever” puzzle share code that encodes the starting grid (`BBSG1-...`).
- Added a puzzle code load/copy UI in Hunt Setup.
- Added Google login (Supabase Auth OAuth).
- Added cloud game history (games, scores, dates, duration) with RLS policies and a history modal.
- History UX polish: duration formatting, click-to-copy puzzle codes.

## 2026-02-12

- Added custom Tooltip component (smooth, works on focus + hover) and removed most `title` attributes.
- Improved insert-mode indicator behavior (reacts to keyboard modifiers only when playing).
- Improved a11y (select ARIA wiring, focus behavior, icon labeling).
- Added CI workflow to run typecheck + unit tests + build on push.
- Added Supabase serverless multiplayer scaffold (co-op/versus).
- Multiplayer UX: accordion panel, CustomSelect for mode, player selection highlighting with pastel colors.
- Draft/undo/redo improvements (includes drafts; Ctrl/Cmd+Shift+Z redo) and draft cleanup now covers row/col/box.
- Timer fixes (visibility-aware active play time + UI update).

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
