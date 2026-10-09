# BCMap_Editor - Development Roadmap

## Phase 0: Project Setup
- [x] Create `BCMap_Editor/` folder
- [x] Initialize git repo
- [x] Create `MAP_EDITOR_ROADMAP.md` (track tasks, status, notes)
- [x] Set up Vitest + Playwright test configuration
- [x] Create basic `map-editor.html` skeleton with Bootstrap CDN
- [x] Set up TypeScript compilation pipeline (tsc) to output embedded JS
- [ ] Download all tile/object sprites from BC CDN to local `assets/` folder

## Phase 1: Core Data Structures & Utilities
- [ ] Implement internal map data structure (optimized for 40x40 read/write)
- [ ] Default map initialization: 40x40 grid filled with grass tiles (FloorExterior/Grass, ID 210)
- [ ] Implement LZString import/export (compression/decompression)
- [ ] Create tile/object catalog data structures from MAP_SYSTEM_DOCUMENTATION.md
- [ ] Unit tests for data structures and compression

## Phase 2: Map Rendering Engine
- [ ] Canvas-based 40x40 grid renderer
- [ ] Two-layer rendering (tiles → objects)
- [ ] Tile rendering: Load sprites from local `assets/tiles/{Type}/{Style}.png`
- [ ] Object rendering: Load sprites from local `assets/objects/{Type}/{Style}.png`; Blank objects render nothing
- [ ] Grid coordinate system (X + Y * 40)
- [ ] Unit tests for rendering logic

## Phase 3: Interaction & Painting
- [ ] Mouse click painting (tile layer + object layer toggle)
- [ ] Current tool/selection state management
- [ ] Visual cursor/preview
- [ ] E2E tests for painting workflow

## Phase 4: Tile/Object Picker UI
- [ ] Sidebar with foldable category sections
- [ ] Sprite thumbnails from local assets
- [ ] Search/filter functionality
- [ ] Tile categories: Use Type field (Floor, FloorExterior, Wall, Water) as main categories, Style as sub-items
- [ ] Object categories: Grouped categories (Floor Decorations, Floor Items, Floor Obstacles, Wall, Banners)
- [ ] Unit tests for filtering logic

## Phase 5: Zoom & Navigation
- [ ] Mouse wheel zoom implementation
- [ ] Zoom constraints (3x3 min, 40x40 max)
- [ ] Pan/drag at high zoom (if needed)
- [ ] E2E tests for zoom

## Phase 6: Import/Export UI
- [ ] Import dialog (paste map code)
- [ ] Export dialog (name + download .txt)
- [ ] Error handling for invalid codes
- [ ] Integration tests

## Phase 7: Polish & Finalization
- [ ] Dark mode Bootstrap theme
- [ ] Icon-based toolbar
- [ ] Responsive layout
- [ ] README.md with project documentation
- [ ] Final validation against MAP_SYSTEM_DOCUMENTATION.md

---

## Notes
- Tile catalog: 4 types (Floor, FloorExterior, Wall, Water) with ~60 total tiles
- Object catalog: 13 types, ~500+ objects (many with "Blank" for erasing)
- Asset download: Need to download ~600+ sprites from BC CDN
- Default tile: FloorExterior/Grass (ID 210) for new maps

## Commit Log
- Initial commit: Project setup with configs
