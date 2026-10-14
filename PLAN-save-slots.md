# Plan: Browser Save Slots + Menu Shell + Unsaved-Work Guards

BCMap Editor (`BCMap_Editor`) — static GitHub Pages app, no server, no login.
Today persistence is zero: `:w` downloads a `.txt`, `:e` opens a paste-import modal.

## Goal

Best-effort browser save slots (scratch space for quick work on recent maps)
while the exported `.txt` file remains the user's long-term archive. All toolbar
actions consolidate into Map / Edit / View menus. Tab close and in-app swaps
guard against losing unsaved work.

## Locked decisions

- Slot = `{ name, code, savedAt (epoch ms), thumbnail }`. Max **30 slots**
  (`MAX_SLOTS = 30`): worst-case slot ≈ 40K chars, full house ≈ 1.2 MB, under
  a quarter of the 5 MiB localStorage origin budget — headroom reserved for
  settings and future additions. The 31st save is refused with
  `Slot list full (30/30) — delete a saved map or export one to a file first`.
  No auto-eviction, ever: explicit refusal beats surprise deletion.
- Thumbnail = whole-map mini (240px JPEG q0.7, ~10–25 KB), rendered from the
  editor's own sprite caches — not a viewport screenshot.
- Timestamps stored as epoch ms only; display is relative ("3d ago") +
  absolute local time in `title`. Sort by epoch.
- Import (paste a code) stays exactly as-is: own menu item, own modal,
  untouched. Load window is slots-only.
- Delete is UI-only: `×` per row in the Load window with confirmation.
  No `:bd` command.
- Names: `[A-Za-z0-9 -]`, max 40 chars, case-insensitive collision, casing
  preserved as typed. UI filters as-you-type; store re-sanitizes (backstop);
  commands reject invalid names with the rule (`E486`), never silently mutate.
- Guards cover tab close AND in-app swaps (slot load, New, paste-import).
- Status-bar revamp: lualine-style mode pill (gray normal / cyan visual) +
  current-slot name with dirty mark (see §5).

## Command surface (final)

| Command                | Behavior                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `:w [name]`            | Save to slot; bare `:w` uses current slot name (`E32: No file name` if none; `E13: File exists (add ! to override)` on collision) |
| `:w! [name]`           | Save, overwriting                                                                                                                 |
| `:e`                   | Open Load Saved Map window                                                                                                        |
| `:e name` / `:e! name` | Load slot directly; `E37: No write since last change (add ! to override)` when dirty                                              |
| `:enew` / `:enew!`     | New map; same `E37` behavior (button keeps its existing checkbox modal)                                                           |
| `:export [name]`       | Download `.txt` of current map / named slot                                                                                       |
| `:import`              | Open the existing import modal (preserves old `:e` behavior for command users)                                                    |

Behavior changes, flagged: `:w` becomes slot-save (was download); bare `:e`
opens slots (was import modal). Old paths survive one step away (`:export`,
`:import`). `COMMANDS` registry → README/helpCard tables regenerate in build.

## Architecture

- **`src/slots.ts` (new, DOM-free):** `sanitizeName()`, versioned single-key
  store (`bcmap.v1.slots` → `{version, slots: {name: {code, savedAt,
thumbnail}}}` — single blob = atomic saves), CRUD + recency listing,
  per-slot corruption isolation, pure time formatters (`now` injected),
  baseline snapshot + dirty compare on raw `{Type, Tiles, Objects}`.
- **`src/editor.ts` (+1 method):** `captureMapThumbnail(maxPx = 240)` →
  JPEG dataURL, reusing sprite caches, expandable/railroad/wall-effect
  resolution and the missing-image color fallback. No render-path changes.
- **`map-editor.html`:** 9-button toolbar row → 3 Bootstrap dropdowns
  (bundle already vendored); new Save modal (prefill), Saved Maps modal
  (rows: thumbnail, name, relative time, Load / Export / ×; header `n / 30`),
  one generic confirm modal (overwrite, delete, load-over-dirty). Import and
  New-Map modals untouched.
- **`src/init.ts`:** menu wiring; `currentSlotName` state machine (set on
  save/load, cleared on `newMap()`/paste-import); baseline updates on
  save/load/import/new; `beforeunload` handler (fires only when dirty);
  status-bar name + `[+]`; transient save/load feedback; one
  `navigator.storage.persist()`; storage-availability probe (Save/Load
  disabled with reason if unavailable — private mode, some `file://`).
- **`scripts/embed-js.js`:** add `slots.js` to the embed list.
- **Import modal:** gains a dirty warning banner; Confirm still proceeds
  (informed consent, one click).

## Status bar (map-editor.html:117-129 invariant: three equal, non-shifting thirds)

- `#statusVimMode` becomes a pill: `updateVimMode` toggles
  `mode-normal`/`mode-visual` from `vim.getMode()` (not the text, which can be
  a pending `g`/count). CSS chevron clip-path, gray + light text (normal),
  cyan + dark text (visual). Strings unchanged
  (`-- NORMAL --` / `-- VISUAL -- WxH`).
- New `#statusSlotName` after the pill: `garage-wip [+]`, own max-width +
  ellipsis inside the left third so the pill never shifts center/right.

## Build slices (each independently verifiable)

1. Store + sanitizer (`slots.ts`, `tests/unit/slots.test.ts`).
2. Menu shell (Map/Edit/View; retarget New/Import/Export/Undo/Redo/Grid/Zoom
   incl. disabled/active sync; Shortcuts item). Zero behavior change.
3. Thumbnail (`captureMapThumbnail`; e2e asserts dataURL + sane size).
4. Save flow (modal, prefill, overwrite confirm, `:w`/`:w!`, feedback,
   status-bar revamp).
5. Load window (list, Load/Export/× + delete confirm, `:e`/`:e name`,
   `:export`, `:import`).
6. Unsaved-work guards (baseline, `beforeunload`, `E37`/`!`, import banner;
   unit + e2e incl. Playwright dialog event on close).

## Risks / non-goals

Safari 7-day wipe, private mode, `file://` quirks: mitigated (probe, persist,
export nudges), not solved — unsolvable on a static host. Non-goals: autosave,
settings persistence, sync, multi-tab live sync.

:::question
Where should the current-slot name indicator live?

The thirds must never shift; both options keep that invariant.

- [x] Left third, after the mode pill (vim statusline style: `-- NORMAL --  garage-wip [+]`)
- [ ] Center third, before the selection text

Recommended: Left third, after the mode pill

Settled (review): left third, after the mode pill.
:::

:::question
Which cyan for the visual-mode pill?

The selection tint is Bootstrap primary blue (rgba(13,110,253,.25)), not cyan.

- [x] Bootstrap info cyan (#0dcaf0) + dark text — reads unmistakably "cyan"
- [ ] Solid selection blue (#0d6efd family) — exact match to the tint

Recommended: Bootstrap info cyan (#0dcaf0) + dark text

Settled (review): Bootstrap info cyan (#0dcaf0) + dark text.
:::
