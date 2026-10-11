# Spec: Vim-inspired keyboard editing + accessible picker (`feature/vim-keyboard`)

Phase: **SPECIFY** (approval gate). Covers approved plan items **F3 + F4** from
`IMPROVEMENT_PLAN_FUTURE.md`. Branch: `feature/vim-keyboard`, base `main` (`c04626f`).

## Objective

Make the map editor fully editable **from the keyboard** and give the picker a
keyboard- and screen-reader-navigable surface:

- **F4 — input model:** a cursor on the canvas; `hjkl`/arrows motions with count
  prefixes, `0`/`$`/`gg`; `x` erase, `p` paste, `v` visual-select with `y`/`d`;
  `u`/`Ctrl+R` undo/redo aliases; `:` command line; `/` search focus.
- **F3 — accessibility:** picker navigable by arrows (headers + sprites),
  collapsible categories via left/right, labeled search, modal focus trap,
  real buttons with aria state, contrast verified.

Success = a keyboard-only user completes the full edit loop (move → paint →
erase → yank → paste → select region → delete region → save/import → toggle
grid/help) without touching the mouse, and a screen reader announces modes,
picker items, and selection.

## Decisions (locked with the maintainer)

| # | Decision |
|---|---|
| D1 | Space **and** Enter paint at the cursor (map surface); activate the focused picker item (sidebar surface) |
| D2 | Picker arrows traverse category headers **and** sprites in DOM order; Up from a category's first sprite → its header, Down from its last sprite → next header, no wrap; **left collapses / right expands** the focused node's category; Enter/Space on a header toggles it |
| D3 | `y` yanks **both layers** of the cell/region; `Y` is an alias; `d`/`x` erase (grass / blank object) and **never touch the yank buffer**; undo is the way back |
| D4 | Visual mode = **rectangles only**; lines move to a `:line x1,y1 x2,y2` command (shared pure Bresenham module, reusable by F1) |
| D5 | Auto-pan: a keyboard motion that moves the cursor outside the viewport nudges `panX/panY` by whole `tileSize` steps to reveal it |
| D6 | Cursor lifecycle: `newMap()`/`importMap()` clear the cursor; `resetView()` keeps it; first vim key initializes it at **last hovered cell** (map center `20,20` if never hovered) |
| D7 | `:` commands: `:w`/`:write [name]` export (existing export path, default name `my-map`), `:e` open Import modal, `:help` toggle help card, `:grid` toggle grid; unknown → transient `E492: Not an editor command: <cmd>`; `p` with empty buffer → transient `E353: Nothing in register`; Up/Down history (session, 15) |
| D8 | Status bar: **left** mode slot (`-- NORMAL --`, `-- VISUAL -- 3x2`; pending count renders as bare digits, pending `g` as `g`), **replaced by the `:` input** in command mode; **middle** selection (existing `statusSelection`); **right** position (existing `statusPosition`, follows the **last input device**) |
| D9 | Three input surfaces with one dispatcher: **map surface** (body/canvas, `tabindex=0`) owns all vim keys — letters are never search; **sidebar surface** owns arrows + collapse, any printable character focuses the search input; **input surface** (search/command) owns text editing; Esc returns focus to the map surface |
| D10 | `hjkl` always act on the canvas cursor, even when the sidebar has focus; only arrows are context-routed |
| D11 | Yank buffer `{ width, height, tiles, objects }` always both layers; `p` pastes **exactly those layers** regardless of active layer, clipped at map edges, ignores counts; `y`/`d` exit visual mode |
| D12 | Key-repeat burst coalescing: **400 ms** idle, or immediate close on verb change, mode change, or Esc → **one undo entry per burst** |
| D13 | Keybind registry (`keys`, description, scope) is the single source that renders the help card and README Controls table |

## Capability map (Phase 0)

| Module id | Responsibility | Depends on |
|---|---|---|
| keybinds | One window keydown dispatcher, focus routing, keybind registry, help/README render | — |
| vim-input | Cursor, motions, verbs, visual mode, auto-pan, status mode slot | keybinds |
| edit-session | 400 ms stroke coalescing shared by mouse + vim (one undo entry per gesture/burst) | vim-input |
| vim-commands | `:` command line (`w/e/help/grid/line`), errors, history | keybinds, line |
| picker-a11y | Arrow navigation of headers+sprites, collapse/expand, buttons + aria, search labeling, modal focus trap | keybinds |
| line | Pure Bresenham grid line (shared with F1 fill-tools) | — |

Build order: `keybinds → vim-input → edit-session → vim-commands → line/:line → picker-a11y → docs/registry`.

## Commands

```bash
eval "$(fnm env)" && fnm use 22      # required: repo needs Node ≥ 20

npm run build          # tsc + embed JS into map-editor.html (rebuild every slice)
npx tsc --noEmit       # typecheck gate
npx vitest run         # unit gate (node env) — baseline on main: 201 passing
npx prettier --check . # format gate (4-space indent)

# e2e (deps note: `http-server` is NOT installed; serve first, then reuse)
python3 -m http.server 8080 --bind 127.0.0.1 &
npx playwright test --output /tmp/opencode/pw --reporter line   # baseline: 17 passing
```

## Project structure (new/changed)

```
src/vim/motions.ts      PURE grid math: step/line-bounds/gg/region normalize+clip/iterate
src/vim/vimController.ts  state machine: normal|visual, pending count/g, visual anchor; emits intents
src/vim/keybinds.ts     single dispatcher: surface routing (D9/D10) + registry (D13)
src/vim/commands.ts     `:` registry: {name, run, help}; E492/E353 feedback; history
src/vim/yank.ts         YankBuffer {width,height,tiles,objects} (D11)
src/vim/editSession.ts  open/extend/close-by-timer-or-mode-change (D12)
src/line.ts             PURE Bresenham between two cells (D4; F1 reuses)
src/editor.ts           integrates controller+session; draws cursor/region; status slots (D8)
src/init.ts             removes ad-hoc window keydown listeners → keybinds dispatcher
map-editor.html         status bar restructure: mode slot [+ `:` input], selection, position (D8)
tests/unit/vim/*.test.ts   pure modules + controller dispatch with a fake editor
tests/e2e/vim-*.spec.ts    keyboard-only flows per slice
SPEC-vim-keyboard.md    this file
```

## Code style conventions (match repo)

- 4-space indent, Prettier-enforced; classes for state (`MapHistory`, `MapPicker`,
  `BCMapEditor` precedent), **pure functions in dependency-free modules** with
  direct unit tests (the one good idea in the discarded attempt was
  `vimkeys.ts` — this spec completes that pattern).
- `src/vim/vimController.ts` **never mutates map data**; it emits intents
  (`paintCell`, `eraseCell`, `yankRegion`, `deleteRegion`, `undo`, `redo`,
  `moveCursor`) that the editor applies — history/undo stays in one place.
- Mode/status updates flow through a controller subscription, **never from mouse
  handlers** (root cause of the old attempt's fake visual mode).

## Testing strategy

- **Pure modules** (`motions`, `line`, `yank`, `commands`, controller-vs-fake):
  direct unit tests, TDD per slice, no DOM mocks.
- **Integration** (editor + controller + session): extend the existing
  `tests/unit/*.test.ts` mock-DOM harness; assert state and render-call counts.
- **E2E per slice**: keyboard-only motion/paint/erase/yank/paste/visual/delete,
  picker arrow navigation + collapse, `:` commands incl. `:w` export, `/` focus,
  status-bar labels, `role`/`aria` presence.
- **Gates per slice**: `tsc` + full unit (≥201) + full e2e (≥17) + prettier,
  one commit per slice with README/help updates in the same commit (per plan).

## Boundaries

- **Always:** run the four gates before each commit; pure modules stay DOM-free;
  one commit per slice; update the help card + README from the registry in the
  same commit; keep `tests/unit/perf-regressions.test.ts` green (no new render
  loops, no new full-map renders on key events).
- **Ask first:** changing `MapHistory` semantics; adding dependencies; touching
  the mouse-paint path (session refactor is shared); anything that would also
  change `feature/fill-tools` scope (`line` is intentionally shared, not moved).
- **Never:** reintroduce global letter→search outside the sidebar surface;
  mutate map data from the controller; commit without the suite green; edit the
  embedded `map-editor.html` by hand (it is build output).

## Success criteria (testable)

1. E2E: keyboard-only loop — `gg`, `3j`, `x`, paint with Space, `v`+`2l`+`d`,
   `y`+`G`-safe `p`, `u`, `:`/`:grid`, `/search` — all pass without mouse input.
2. E2E: sidebar arrows traverse headers+sprites, left/right collapse/expand,
   focus stays visible; typing a character focuses search; Esc returns to map surface.
3. Unit: 100-cell key-repeat burst → exactly **1** undo entry (400 ms rule);
  single verbs/paste → 1 entry each; yank is not undoable.
4. Status bar asserts: mode labels, pending count, `-- VISUAL -- 3x2`, command
   slot replacing mode, transient E492/E353, position follows last input device.
5. Regression: tsc + 201+ unit + 17+ e2e + prettier green; probe confirms **0**
   idle renders after zoom and no per-event full-map render growth.
6. Help card + README Controls table render from the keybind registry (no
   hand-maintained duplicate text).

## Open questions

None blocking. Deferred deliberately: `V` line-visual (not in v1), `dd`-style
operator composition (visual covers it), count-on-paste (ignored per D11),
`:e!`-style force variants, F1's drag-select UI (separate branch).

## Assumptions

Vanilla TS + canvas 2D, no framework; e2e served via `python3 -m http.server`
(Playwright's configured `http-server` dep is absent in this environment); vim
emulation is **vim-inspired**, not keybinding-complete (`G` stays grid toggle per
plan); branches are never auto-merged, so `line` reuse with F1 is a manual
coordination the next agent picks up.
