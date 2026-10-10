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

| Action            | Input                                    |
| ----------------- | ---------------------------------------- |
| Paint tile/object | Left click or left-drag                  |
| Pan               | Right-drag                               |
| Zoom              | Mouse wheel                              |
| Undo              | Ctrl+Z / Cmd+Z or the Undo button        |
| Redo              | Ctrl+Y / Ctrl+Shift+Z or the Redo button |
| Erase object      | Select a `Blank` object and paint        |

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
