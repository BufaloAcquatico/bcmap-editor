# BCMap_Editor — Future Additions (Parked, Not Approved for Implementation)

Candidates only. Pick max 2 after slices 1–5 land. One feature per commit + e2e; no scope creep into shared modules.

## F1 — Touch paint + pinch-zoom

- Pointer-events unification (paint via touch drag, pinch to zoom, two-finger pan); prevent scroll-interference on canvas.
- Detail: reuse wheel-zoom anchor math; add `touch-action: none` on canvas; e2e via Playwright touch context.
- Risk: medium (input-path entanglement with right-drag pan). Value: high for tablet users.

## F2 — Fill / line tools + multi-select

- Tools: fill-rect, flood fill, line; drag-select region with copy/paste region buffer.
- Detail: new tool state in editor (not in shared render path); history integration = one undo entry per tool stroke (reuse stroke coalescing).
- Risk: medium. Value: high for large-map authoring.

## F3 — Minimap + viewport indicator

- Small offscreen-canvas minimap (e.g. 120px), click-to-jump, viewport rect overlay.
- Detail: render at low frequency (on stroke end + pan/zoom end, not per mousemove).
- Risk: low. Value: medium navigation QoL on 40x40 maps.

## F4 — Status-bar texture swatch (revived PLAN item)

- 1em live swatch of selected tile/object in `#statusSelection`.
- Detail: reuse picker thumbnail URL builder; trivial DOM addition.
- Risk: very low. Value: small polish.

## F5 — `?` help overlay + shortcut cheatsheet

- `?` toggles `#controlsHelp` as a proper overlay; first entry documents itself; list all keybinds (undo/redo, pan, zoom).
- Detail: focus trap + Esc to close; aria attributes.
- Risk: low. Value: medium discoverability.

## F6 — Accessible picker (aria + keyboard)

- Picker categories/nodes keyboard-navigable (arrow keys), search input labelled, modals with focus trap + aria roles.
- Detail: audit contrast of active tab (`#fff` on `#16213e` is fine; check inactive states).
- Risk: low-medium. Value: medium; required if this ever ships publicly.

## F7 — Keyboard nudge + cursor paint

- Arrow keys move a cursor cell; Space/Enter paints; Esc clears selection.
- Detail: visible cursor outline distinct from hover; interacts with undo stroke model (one entry per key-repeat burst — needs debounce rule).
- Risk: low. Value: medium for precision editing.

## Suggested order if any are approved

F4 → F5 → F7 → F3 → F6 → F1 → F2 (cheapest polish first, input-model changes last).

## Verification (when built)

One commit per feature, targeted playwright spec per feature, full suite green, README Controls table updated in the same commit.
