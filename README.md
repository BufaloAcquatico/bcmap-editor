# BCMap Editor

A browser-based map editor for the ropeybot map system. This editor allows you to create, edit, import, and export 40x40 tile-based maps for Bondage Club using the same format as the ropeybot map system.

## Features

- **40x40 Grid**: Classic grid-based map editing
- **Two-Layer System**: Separate tile (background) and object (foreground) layers
- **Full Game Catalog**: 148 tiles and 121 objects in the pickers, with import/render support for the full 165 tiles and 158 objects from Bondage Club's ChatRoomMap data (R132), kept verbatim
- **BC Asset Sprites**: Loads actual game sprites from downloaded BC assets
- **Categorized Picker**: Tile and object pickers organized by category with search
- **Zoom & Pan**: Mouse wheel zoom (3x3 min to 40x40 max), pan with right-drag
- **On-canvas Controls**: Quick reference shown in the bottom-right corner of the map
- **Import/Export**: LZString compressed map codes (same format as ropeybot)
- **Dark Mode UI**: Clean dark theme with Bootstrap 5
- **Local Assets**: All sprites stored locally for offline use
- **No CDN Dependency**: Bootstrap, Bootstrap Icons, and LZString are vendored under `assets/vendor/` with SRI hashes — the editor works with all network blocked

## Getting Started

### Option 1: Run with Docker (Recommended)

```bash
# Build and run the editor
docker compose up -d

# Open in your browser
# http://localhost:6969/map-editor.html
```

### Option 2: Open directly in browser

1. Open `map-editor.html` in a web browser
2. Select a tile from the left sidebar (tile layer is selected by default)
3. Click on the map to paint (hold and drag to paint multiple tiles)
4. Switch to object layer to paint objects/decoration
5. Pan with right-drag, zoom with the mouse wheel

## Controls

<!-- KEYBINDS:START -->
| Action | Input |
| --- | --- |
| Paint tile/object | Left click or left-drag |
| Pan | Right drag |
| Zoom | Mouse wheel |
| Move cursor (counts, 0, $, gg) | `hjkl` / `arrows` |
| Paint selection at cursor | `Space` / `Enter` |
| Erase cursor cell | `x` |
| Visual mode (select region) | `v` |
| Yank region (both layers) | `y` / `Y` |
| Delete visual region | `d` |
| Paste yank at cursor | `p` |
| Undo (vim alias) | `u` |
| Cancel selection / pending state | `Esc` |
| Command line (w/e/help/grid/line) | `:` |
| Focus the picker search | `/` |
| Navigate picker (groups: collapse/expand) | `arrows` |
| Toggle grid | `G` |
| Toggle help overlay | `?` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` / `Ctrl+Shift+Z` / `Ctrl+R` |
<!-- KEYBINDS:END -->

The keyboard cursor boots under the last hovered cell (map center if the
mouse never visited) and auto-pans to stay visible when zoomed in. The
status bar shows the vim mode (`-- NORMAL --`) on the left, the selection
in the middle, and the cursor/pointer position on the right. Consecutive
edits of the same verb within 400 ms coalesce into a single undo entry;
switching verb, `Esc`-style state changes, and mouse drags each start
their own entry.

## Map Format

This editor uses the same LZString-compressed format as ropeybot:

- Map data is compressed with lz-string and base64 encoded
- Export saves as `<mapname>.txt` containing the map code
- Import accepts any valid map code from ropeybot maps

## Development

```bash
# Install dependencies
pnpm install

# Build
npm run build

# Download assets (drive from the shared catalog, with throttling)
npm run download-assets

# Options: skip existing files by default; add --force to re-download
#   --force            re-download every asset
#   --concurrency=N    parallel requests (default 2)
#   --delay=MS         delay between requests (default 150)
#   --retries=N        retries per asset (default 3)

# Format / verify formatting (Prettier, 4-space indent)
npm run format
npm run format:check

# Run unit tests
npm test

# Run E2E tests (requires Playwright browsers)
npm run test:e2e

# Run E2E tests in Docker (no local browser install needed)
npm run test:e2e:docker

# Run unit tests in Docker
npm run test:e2e:docker:unit
```

### Docker Testing (Recommended for Fedora/Linux)

The project includes Docker configuration for running Playwright E2E tests without installing browsers locally.

**Requirements:** Docker and Docker Compose installed

```bash
# Build and run E2E tests
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit test

# Or use npm script
npm run test:e2e:docker

# Run unit tests in Docker
npm run test:e2e:docker:unit
```

**Files:**

- `Dockerfile.test` - Test image based on `mcr.microsoft.com/playwright:v1.64.0-jammy`
- `docker-compose.test.yml` - Compose file with volume mounts for fast iteration

## Technical Details

- TypeScript → compiled and embedded in HTML
- Canvas 2D rendering with image caching
- Bootstrap 5 for UI
- LZString for compression
- Vitest + Playwright for testing
