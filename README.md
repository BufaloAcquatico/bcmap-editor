# BCMap Editor

A browser-based map editor for Bondage Club room maps. Create, edit,
import, and export 40x40 tile-based maps, using the same map-code format
the game itself uses (sometimes called the "ropeybot" format, after the
project it originated in).

## Features

- **40x40 Grid**: Classic grid-based map editing
- **Two-Layer System**: Separate tile (background) and object (foreground) layers
- **Full Game Catalog**: The complete in-game tile and object catalogs in the pickers, kept verbatim
- **BC Asset Sprites**: Loads actual game sprites from downloaded BC assets
- **Categorized Picker**: Tile and object pickers organized by category with search
- **Zoom & Pan**: Mouse wheel zoom anchored at the cursor, pan with right-drag
- **On-canvas Controls**: Quick reference shown in the bottom-right corner of the map
- **Import/Export**: LZString compressed map codes, compatible with game room maps
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
| **Mouse** |  |
| Paint tiles or objects | Left click or left-drag |
| Move the view | Right drag |
| Zoom | Mouse wheel |
| **Cursor** |  |
| Move around the map | `hjkl` / `arrows` |
| **Paint** |  |
| Paint tiles on the map | `Space` / `Enter` |
| Select an area | `v` |
| **Clipboard** |  |
| Copy the selected area | `y` / `Y` |
| Paste what you copied | `p` |
| Undo the last change | `u` |
| **Navigate** |  |
| Search for tiles and objects | `/` |
| Move through the tile list | `arrows` |
| Switch between the map and the sidebar | `Tab` |
| Pick the tile | `Enter` |
| Show or hide the grid | `G` |
| Zoom in | `+` / `=` |
| Zoom out | `-` |
| Switch the sidebar to tiles | `[` |
| Switch the sidebar to objects | `]` |
| **Command** |  |
| Type a command | `:` |
| **System** |  |
| Cancel | `Esc` |
| Show or hide this help | `?` |
| Undo the last change | `Ctrl+Z` |
| Redo | `Ctrl+Y` / `Ctrl+Shift+Z` / `Ctrl+R` |
<!-- KEYBINDS:END -->

### Commands

Press `:` and type one of these commands:

<!-- COMMANDS:START -->
| Command | What it does |
| --- | --- |
| `:w [name]` | Save the map to a browser slot (add ! to overwrite) |
| `:write [name]` | Same as :w |
| `:e [name]` | Open a saved map (add ! to discard changes) |
| `:enew` | Start a new map (add ! to discard changes) |
| `:export [name]` | Download the map as a .txt file |
| `:import` | Import a map code |
| `:help` | Show or hide this help |
| `:grid` | Show or hide the grid |
| `:line x1,y1 x2,y2` | Draw a straight line of tiles |
<!-- COMMANDS:END -->

The keyboard cursor starts where your mouse last hovered and auto-pans to
stay visible when zoomed in. The status bar shows the vim mode
(`-- NORMAL --`) on the left, the selection in the middle, and the
cursor/pointer position on the right. Painting in one stroke — a
click-drag or a quick burst of key presses — undoes as a single step.

## Map Format

This editor uses the same LZString-compressed map codes as the game:

- Map data is compressed with lz-string and base64 encoded
- Export saves as `<mapname>.txt` containing the map code
- Import accepts any valid room-map code

## Contributing

Developer setup, asset downloads, motion tuning, and testing are covered
in [CONTRIBUTING.md](CONTRIBUTING.md):

```bash
pnpm install
npm run build
npm test
```
