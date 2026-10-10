# BCMap_Editor — Future Additions (APPROVED for implementation)

APPROVED: all 4 items below. Each ships on its own branch off `main`
(never merged — personal review merges). Merge order recommendation:
`feature/vim-keyboard` first (owns the region buffer), then
`feature/fill-tools` (reuses it), `feature/help-button` anytime.

- F1 → `feature/fill-tools`: all tools (fill-rect, flood fill, line,
  drag-select + copy/paste).
- F2 → `feature/help-button`: `?` toolbar button after `btnToggleGrid`.
- F3+F4 → `feature/vim-keyboard` (combined branch): accessible picker
  + keyboard cursor/paint with full vim emulation — hjkl AND arrows
  everywhere, count prefixes (`3j`), `0`/`$` row bounds, `w`/`b`
  content jumps, `gg` top-left, `x` erase, `p` paint selection,
  `v` visual-select with `y`/`d`, `:` commands (`w`/`e`/`help`/`grid`),
  `/` focuses search, `u`/`Ctrl+R` undo/redo aliases, `Esc` cancels
  innermost state. Deliberate exception: `G` stays grid toggle
  (existing, tested); no vim goto-bottom.

## F1 — Fill / line tools + multi-select

- Tools: fill-rect, flood fill, line; drag-select region with copy/paste region buffer.
- Detail: new tool state in editor (not in shared render path); history integration = one undo entry per tool stroke (reuse stroke coalescing).
- Risk: medium. Value: high for large-map authoring.

## F2 — Help discoverability: `?` button, then maybe overlay

- Preferred cheap option: a `?` button (`btnHelp`, `bi-question-circle`)
  in the toolbar's right group after `btnToggleGrid`, wired to the
  existing `editor.toggleHelp()` — same as the `?` keybind. Makes the
  corner help card discoverable without knowing the shortcut.
- Optional follow-up (only if wanted): promote `#controlsHelp` to a
  proper overlay dialog (backdrop, `role="dialog"`, focus trap, `Esc`
  to close) with a complete cheatsheet (all keybinds incl. `Cmd`
  variants and `Ctrl+Shift+Z`); generate rows from a shared keybind
  registry so text can't drift from `init.ts`.
- Detail (button): one markup line + one listener in `init.ts` next to
  the other toolbar wiring; `title="Help (?)"`; e2e: click toggles the
  card.
- Risk: very low. Value: medium discoverability for zero new UI model.

## F3 — Accessible picker (aria + keyboard)

- Picker categories/nodes keyboard-navigable (arrow keys), search input labelled, modals with focus trap + aria roles.
- Detail: audit contrast of active tab (`#fff` on `#16213e` is fine; check inactive states).
- Risk: low-medium. Value: medium; required if this ever ships publicly.

## F4 — Keyboard nudge + cursor paint

- Arrow keys move a cursor cell; Space/Enter paints; Esc clears selection.
- Detail: visible cursor outline distinct from hover; interacts with undo stroke model (one entry per key-repeat burst — needs debounce rule).
- Risk: low. Value: medium for precision editing.

## Suggested order if any are approved

F2 → F4 → F3 → F1 (cheapest polish first, input-model changes last).

## Verification (when built)

One commit per feature, targeted playwright spec per feature, full suite green, README Controls table updated in the same commit.
