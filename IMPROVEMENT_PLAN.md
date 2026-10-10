# BCMap_Editor Improvements — Slices 1–5 (Active Plan)

Scope: correctness, DX, security, architecture, performance. No new features, no fidelity upgrades. Full suite stays green after each slice. Committed bundle strategy for `map-editor.html` stays as-is.

## Slice 1 — Docs + hygiene quick wins (30 min, zero risk)

- Fix README Controls table (pan = right-drag; contradicts Ctrl/Cmd+left-drag row), catalog counts (153/225 vs FULL ~170/280 + R132 source), add undo/redo keybinds + buttons, correct Dockerfile.test playwright version comment (v1.40 vs v1.64-jammy base).
- Extract WallEffect index ranges + railroad direction list into one shared constant (removes duplication `src/editor.ts` ↔ `scripts/download-assets.ts`).
- Acceptance: docs match code; no behavior change; `prettier --check` green.

## Slice 2 — DX brittleness (small, high leverage)

- Replace hardcoded `lz-string` pnpm-store alias in `vitest.config.ts` with a plain package import.
- Pin playwright consistently (`package.json` ↔ `Dockerfile.test` ↔ `docker-compose.test.yml`).
- Add unit tests for `scripts/embed-js.js` transform (CJS→globals regexes) and `scripts/download-assets.ts` variant-list builder (stub fetch/fs, no network).
- Acceptance: clean `node_modules` reinstall still passes vitest; version mismatch gone; 2 new test files green.

## Slice 3 — Security hardening (small, review-worthy)

- Add SRI hashes for the 4 CDN deps (bootstrap css/js, bootstrap-icons, lz-string); add a documented offline fallback (vendor under `assets/vendor/` or graceful-degrade note).
- Tighten import boundary: schema-validate decompressed map (dims 40x40, known IDs, string lengths) before applying; replace `innerHTML = \"\"` clears with `textContent`/removeChild (editor.ts:1249,1289) or add an eslint guard + comment.
- Acceptance: page works offline with CDN blocked (e2e); malformed import corpus rejected with a message; no new runtime deps.

## Slice 4 — Architecture: decompose `src/editor.ts` (stacked, one sub-slice per commit)

- 4a: extract history (`beginStroke`/`endStroke`/undo/redo/caps) → `src/history.ts`; move existing undo-redo tests over.
- 4b: extract picker build/search/fold → `src/picker.ts`; import/export + validation → `src/mapdata.ts` (reuse in tests).
- 4c: extract renderer (tile/wall-effect/object/neighbor-variant resolution) → `src/render.ts` with pure `BuildImageName` functions unit-testable without canvas mocks.
- Acceptance per sub-slice: `editor.ts` shrinks toward <800 lines, tests moved not rewritten, suite green, no behavior change. Prefer deleting branches over moving them.

## Slice 5 — Performance (measure first)

- Add a drag-stroke benchmark (40-cell stroke ms budget) alongside existing `perf-regressions.test.ts`.
- Then, only if over budget: array-backed map buffer during stroke (join once on `endStroke`) instead of per-cell string splice; dirty-rect redraw during drag; lazy-load variant sprites on first paint instead of all-upfront.
- Acceptance: benchmark shows ≥2x stroke-time improvement or we revert; 1000-deep undo cap stays (~3MB worst case, documented).

## Verification per slice

`pnpm vitest run`, `npx tsc --noEmit`, `prettier --check`, plus the targeted playwright file for the touched area. One commit per slice; push nothing (no remote on BCMap_Editor).

## Explicitly out of scope here

No catalog renumbering (verbatim rule stays), no ropeybot changes, no CI/CD setup, no fidelity upgrades, no new features — those live in `IMPROVEMENT_PLAN_FUTURE.md`.
