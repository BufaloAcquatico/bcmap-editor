// BCMap Editor - TypeScript Source

import {
    BLANK_OBJECT_ID,
    FULL_OBJECT_CATALOG,
    FULL_TILE_CATALOG,
    OBJECT_CATALOG,
    TILE_CATALOG,
    type ObjectDef,
    type TileDef,
} from "./catalog";
import { RAILROAD_DIRECTIONS, WALL_EFFECT_INDICES } from "./constants";
import { MapHistory } from "./history";
import {
    createDefaultMap,
    GRASS_TILE_ID,
    MAP_HEIGHT,
    MAP_WIDTH,
    type MapData,
    parseMapData,
    serializeMap,
} from "./mapdata";
import { MapPicker } from "./picker";
import { VimController } from "./vim/vimController";
import { EditSession } from "./vim/editSession";
import { captureRegion, type YankBuffer } from "./vim/yank";
import { regionCells, type Region } from "./vim/motions";
import {
    EXPANDABLE_LEFT_RIGHT,
    findFloorWallEffect,
    findWallEffectTile,
    RAILROAD_PREVIEW_ID,
    railroadStyleName,
    resolveExpandableVariant,
} from "./render";

export type { ObjectDef, TileDef } from "./catalog";

export interface Point {
    X: number;
    Y: number;
}

export interface MapRegion {
    TopLeft: Point;
    BottomRight: Point;
}

const WHEEL_ZOOM_FACTOR = 1.08;
const ZOOM_ANIMATION_EASE = 0.25;
const ZOOM_ANIMATION_EPSILON = 0.001;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3.0;

const OBJECT_DRAW_MARGIN = 0.2;
const OBJECT_DRAW_SIZE = 0.6;
const GRID_COLOR = "rgba(30, 30, 40, 0.45)";
const GRID_LINE_WIDTH = 0.5;
const HOVER_OUTLINE_COLOR = "rgba(255, 255, 255, 0.9)";
const HOVER_OUTLINE_WIDTH = 2;
const CURSOR_OUTLINE_COLOR = "rgba(255, 215, 0, 0.95)";
const CURSOR_OUTLINE_WIDTH = 2;
const CURSOR_DASH_PATTERN = [4, 4];
const REGION_TINT_COLOR = "rgba(13, 110, 253, 0.25)";
const REGION_BORDER_COLOR = "rgba(13, 110, 253, 0.9)";
const REGION_BORDER_WIDTH = 2;
const PAN_OVERSCROLL_TILES = 15;

export class BCMapEditor {
    private mapData: MapData;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private zoom = 1.0;
    private maxZoom = MAX_ZOOM;
    private minZoom = MIN_ZOOM; // min zoom
    private currentLayer: "tile" | "object" = "tile";
    private selectedTile: TileDef | null = null;
    private selectedObject: ObjectDef | null = null;
    private isDragging = false;
    private lastMousePos = { x: 0, y: 0 };
    private hoveredTile: Point | null = null;
    private panX = 0;
    private panY = 0;
    private isPanning = false;
    private isPainting = false;
    private tileCatalog: TileDef[] = [];
    private objectCatalog: ObjectDef[] = [];
    private tileImageCache: Map<string, HTMLImageElement> = new Map();
    private objectImageCache: Map<string, HTMLImageElement> = new Map();
    private wallEffectImageCache: Map<number, HTMLImageElement> = new Map();
    private tileMap = new Map<number, TileDef>();
    private objectMap = new Map<number, ObjectDef>();
    private fullTileMap = new Map<number, TileDef>();
    private fullObjectMap = new Map<number, ObjectDef>();
    private showGrid = true;
    private showHelp = true;
    private renderRequested = false;
    private history = new MapHistory();
    /** One entry per gesture (mouse) or key-repeat burst (vim), D12. */
    private session = new EditSession({
        begin: () =>
            this.history.beginStroke(this.mapData.Tiles, this.mapData.Objects),
        markDirty: () => this.history.markDirty(),
        end: () => this.history.endStroke(),
    });
    private sessionVerb: "paint" | "erase" | null = null;
    /** Copy buffer from `y`, holding both layers; `p` pastes it. */
    private yankBuffer: YankBuffer | null = null;
    private picker = new MapPicker({
        onSelectTile: (tile) => this.setSelectedTile(tile),
        onSelectObject: (obj) => this.setSelectedObject(obj),
    });
    private objectMarginTiles = 0;
    private vim = new VimController({
        setCursor: (pos) => this.applyVimCursor(pos),
        bootCursor: () => this.vimBootPosition(),
        paintAt: (at) => this.vimPaintAt(at),
        eraseAt: (at) => this.vimEraseAt(at),
        yankRegion: (region) => this.captureYankRegion(region),
        deleteRegion: (region) => this.deleteRegion(region),
        pasteYank: (at) => this.pasteYank(at),
        flushEdits: () => this.session.flush(),
        undo: () => this.undo(),
    });
    private zoomTarget = 1.0;
    private zoomAnchor: { x: number; y: number } | null = null;
    private zoomAnimating = false;

    constructor(canvasId: string) {
        const canvasElement = document.getElementById(canvasId);
        if (!canvasElement)
            throw new Error(`Canvas element #${canvasId} not found`);
        this.canvas = canvasElement as HTMLCanvasElement;
        const ctx = this.canvas.getContext("2d");
        if (!ctx) throw new Error("Failed to get canvas context");
        this.ctx = ctx;
        this.history.onChange = () => this.notifyHistoryChange();
        this.mapData = createDefaultMap();
        this.initCatalogs();
        this.applyDefaultSelection();
        this.init();
        this.preloadImages();
        this.vim.onStateChange = () => this.updateVimMode();
        this.updateVimMode();
    }

    private preloadImages(): void {
        this.tileCatalog.forEach((tile) => {
            const key = tile.Type + "/" + tile.Style;
            if (!this.tileImageCache.has(key)) {
                const img = new Image();
                img.onerror = () => {
                    // Keep cached to avoid retrying; image will show as empty and render falls back
                };
                img.src = "assets/tiles/" + key + ".png";
                this.tileImageCache.set(key, img);
            }
        });
        this.objectCatalog.forEach((obj) => {
            if (obj.Style === "Blank") return;
            const key = obj.Type + "/" + obj.Style;
            if (!this.objectImageCache.has(key)) {
                const img = new Image();
                img.onerror = () => {};
                img.src = "assets/objects/" + key + ".png";
                this.objectImageCache.set(key, img);
            }
        });
        // Preload neighbor-variant textures for expanding objects. Variants
        // live next to the base sprite (assets/objects/<Type>/<Variant>.png).
        // Missing files simply fail to load and the renderer falls back to
        // the base sprite, so this list can name every BC variant.
        const variantJobs: Array<[string, string]> = [];
        EXPANDABLE_LEFT_RIGHT.forEach(({ prefix, single }, id) => {
            const folder =
                this.fullObjectMap.get(id)?.Type ?? "FloorDecorationExpanding";
            variantJobs.push(
                [folder, single],
                [folder, prefix + "Left"],
                [folder, prefix + "Middle"],
                [folder, prefix + "Right"],
            );
        });
        {
            const folder =
                this.fullObjectMap.get(RAILROAD_PREVIEW_ID)?.Type ??
                "FloorDecorationExpanding";
            for (let mask = 0; mask < 16; mask++) {
                let suffix = "";
                RAILROAD_DIRECTIONS.forEach((dir, b) => {
                    if (mask & (1 << b)) suffix += dir;
                });
                variantJobs.push([folder, "Railroad" + suffix]);
            }
        }
        for (const [folder, style] of variantJobs) {
            const key = folder + "/" + style;
            if (!this.objectImageCache.has(key)) {
                const img = new Image();
                img.onerror = () => {};
                img.src = "assets/objects/" + key + ".png";
                this.objectImageCache.set(key, img);
            }
        }
        // Preload WallEffect sprites (indices 0-21, 50-53)
        for (const i of WALL_EFFECT_INDICES) {
            if (!this.wallEffectImageCache.has(i)) {
                const img = new Image();
                img.onerror = () => {};
                img.src = `assets/tiles/WallEffect/${i}.png`;
                this.wallEffectImageCache.set(i, img);
            }
        }
    }

    private initCatalogs(): void {
        // The display catalogs live in ./catalog.ts and mirror the game data.
        // They keep the picker order. Entries are preserved verbatim - styles
        // are intentionally NOT de-duplicated.
        this.tileCatalog = [...TILE_CATALOG];
        this.objectCatalog = [...OBJECT_CATALOG];

        // Build lookup maps for performance
        this.tileMap.clear();
        this.tileCatalog.forEach((t) => this.tileMap.set(t.ID, t));
        this.objectMap.clear();
        this.objectCatalog.forEach((o) => this.objectMap.set(o.ID, o));

        // The FULL catalogs mirror the official in-game catalog exactly. They
        // are the fallback for validation and rendering so that any object or
        // tile that exists in the real game maps into the editor even when it
        // is not (yet) present in the display pickers.
        this.fullTileMap.clear();
        FULL_TILE_CATALOG.forEach((t) => this.fullTileMap.set(t.ID, t));
        this.fullObjectMap.clear();
        FULL_OBJECT_CATALOG.forEach((o) => this.fullObjectMap.set(o.ID, o));

        let margin = 0;
        this.objectCatalog.forEach((o) => {
            const left = o.Left ?? 0;
            const top = o.Top ?? 0;
            const width = o.Width ?? 1;
            const height = o.Height ?? 1;
            margin = Math.max(margin, -left, -top, width - 1, height - 1);
        });
        FULL_OBJECT_CATALOG.forEach((o) => {
            const left = o.Left ?? 0;
            const top = o.Top ?? 0;
            const width = o.Width ?? 1;
            const height = o.Height ?? 1;
            margin = Math.max(margin, -left, -top, width - 1, height - 1);
        });
        // The margin must stay a whole number of tiles: the object render
        // loop below iterates grid cells, and a fractional margin would make
        // the loop variable fractional, shifting every object sprite by half
        // a tile whenever the map is zoomed past ~100% (firstTile > 0).
        this.objectMarginTiles = Math.max(1, Math.ceil(margin));
    }

    private init(): void {
        this.resizeCanvas();
        this.render();
        this.canvas.addEventListener("wheel", this.onCanvasWheel.bind(this));
        // Suppress the browser context menu so the right button can pan.
        this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
        this.canvas.addEventListener(
            "mousedown",
            this.onCanvasMouseDown.bind(this),
        );
        this.canvas.addEventListener(
            "mousemove",
            this.onCanvasMouseMove.bind(this),
        );
        this.canvas.addEventListener(
            "mouseup",
            this.onCanvasMouseUp.bind(this),
        );
        this.canvas.addEventListener(
            "mouseleave",
            this.onCanvasMouseLeave.bind(this),
        );
        window.addEventListener("resize", this.resizeCanvas.bind(this));
    }

    private resizeCanvas(): void {
        const rect = this.canvas.parentElement?.getBoundingClientRect();
        if (rect) {
            const dpr = window.devicePixelRatio || 1;
            this.canvas.style.width = rect.width + "px";
            this.canvas.style.height = rect.height + "px";
            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            this.render();
        }
    }

    private getTilePosFromMouse(e: MouseEvent): Point {
        const rect = this.canvas.getBoundingClientRect();
        // getDrawBox works in device pixels, so convert the CSS-pixel pointer
        // position to device pixels before comparing.
        const dpr = window.devicePixelRatio || 1;
        const mouseX = (e.clientX - rect.left) * dpr;
        const mouseY = (e.clientY - rect.top) * dpr;
        const { startX, startY, tileSize } = this.getDrawBox();
        const tileX = Math.floor((mouseX - startX) / tileSize);
        const tileY = Math.floor((mouseY - startY) / tileSize);
        return { X: tileX, Y: tileY };
    }

    private notifyHistoryChange(): void {
        this.onHistoryChange?.();
    }

    public onHistoryChange: (() => void) | null = null;

    public canUndo(): boolean {
        return this.history.canUndo();
    }

    public canRedo(): boolean {
        return this.history.canRedo();
    }

    /**
     * Route an edit into the coalesced session. A verb change closes the
     * open burst so consecutive different verbs get separate undo entries;
     * repeats of the same verb share one entry until the quiet window ends.
     */
    private applySessionEdit(
        verb: "paint" | "erase",
        mutate: () => boolean,
    ): void {
        if (this.sessionVerb !== verb) {
            this.session.flush();
            this.sessionVerb = verb;
        }
        this.session.runEdit(mutate);
    }

    /**
     * Write one cell of the active layer. `eraseChar` erases (grass / blank
     * object); otherwise the current picker selection is painted. Returns
     * whether the map changed, so no-op edits cost no undo entry.
     */
    private writeCell(pos: Point, eraseChar?: string): boolean {
        if (pos.X < 0 || pos.X >= MAP_WIDTH || pos.Y < 0 || pos.Y >= MAP_HEIGHT)
            return false;
        const index = pos.X + pos.Y * MAP_WIDTH;
        if (this.currentLayer === "object") {
            const ch =
                eraseChar ??
                (this.selectedObject
                    ? String.fromCharCode(this.selectedObject.ID)
                    : null);
            if (ch === null) return false;
            if (this.mapData.Objects[index] === ch) return false;
            this.mapData.Objects =
                this.mapData.Objects.substring(0, index) +
                ch +
                this.mapData.Objects.substring(index + 1);
            this.requestRender();
            return true;
        }
        const ch =
            eraseChar ??
            (this.selectedTile
                ? String.fromCharCode(this.selectedTile.ID)
                : null);
        if (ch === null) return false;
        if (this.mapData.Tiles[index] === ch) return false;
        this.mapData.Tiles =
            this.mapData.Tiles.substring(0, index) +
            ch +
            this.mapData.Tiles.substring(index + 1);
        this.requestRender();
        return true;
    }

    private paintAt(pos: Point): void {
        this.applySessionEdit("paint", () => this.writeCell(pos));
    }

    private vimPaintAt(at: Point): void {
        this.applySessionEdit("paint", () => this.writeCell(at));
    }

    private vimEraseAt(at: Point): void {
        this.applySessionEdit("erase", () =>
            this.writeCell(at, this.eraseCharForLayer()),
        );
    }

    /** Erase character for the active layer: grass tile / blank object. */
    private eraseCharForLayer(): string {
        return this.currentLayer === "object"
            ? String.fromCharCode(BLANK_OBJECT_ID)
            : String.fromCharCode(GRASS_TILE_ID);
    }

    /** `y`: capture the region's content of both layers. */
    private captureYankRegion(region: Region): void {
        this.yankBuffer = captureRegion(
            this.mapData.Tiles,
            this.mapData.Objects,
            region,
            MAP_WIDTH,
            MAP_HEIGHT,
        );
    }

    /** `d`: erase every cell of the region as one undo entry. */
    private deleteRegion(region: Region): void {
        const cells = regionCells(region);
        const eraseChar = this.eraseCharForLayer();
        this.applySessionEdit("erase", () => {
            let changed = false;
            for (const cell of cells) {
                if (this.writeCell(cell, eraseChar)) changed = true;
            }
            return changed;
        });
    }

    /** `p`: paste the yank buffer (both layers) anchored at the cursor. */
    private pasteYank(at: Point): void {
        const buffer = this.yankBuffer;
        if (!buffer) return;
        this.applySessionEdit("paint", () => {
            let changed = false;
            for (let row = 0; row < buffer.height; row++) {
                for (let col = 0; col < buffer.width; col++) {
                    const charIndex = row * buffer.width + col;
                    if (
                        this.writeBothLayers(
                            at.X + col,
                            at.Y + row,
                            buffer.tiles[charIndex],
                            buffer.objects[charIndex],
                        )
                    ) {
                        changed = true;
                    }
                }
            }
            return changed;
        });
    }

    /** Write one cell of both layers explicitly (paste path). */
    private writeBothLayers(
        x: number,
        y: number,
        tileChar: string,
        objectChar: string,
    ): boolean {
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return false;
        const index = x + y * MAP_WIDTH;
        let changed = false;
        if (this.mapData.Tiles[index] !== tileChar) {
            this.mapData.Tiles =
                this.mapData.Tiles.substring(0, index) +
                tileChar +
                this.mapData.Tiles.substring(index + 1);
            changed = true;
        }
        if (
            objectChar !== undefined &&
            this.mapData.Objects[index] !== objectChar
        ) {
            this.mapData.Objects =
                this.mapData.Objects.substring(0, index) +
                objectChar +
                this.mapData.Objects.substring(index + 1);
            changed = true;
        }
        if (changed) this.requestRender();
        return changed;
    }

    private onCanvasWheel(e: WheelEvent): void {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const anchor = {
            x: (e.clientX - rect.left) * dpr,
            y: (e.clientY - rect.top) * dpr,
        };
        const factor = e.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
        const base = this.zoomAnimating ? this.zoomTarget : this.zoom;
        this.zoomTarget = Math.max(
            this.minZoom,
            Math.min(this.maxZoom, base * factor),
        );
        this.zoomAnchor = anchor;
        if (!this.zoomAnimating) {
            this.zoomAnimating = true;
            this.animateZoomStep();
        }
    }

    private animateZoomStep(): void {
        const anchor = this.zoomAnchor;
        const next =
            this.zoom + (this.zoomTarget - this.zoom) * ZOOM_ANIMATION_EASE;
        const done =
            Math.abs(this.zoomTarget - next) < ZOOM_ANIMATION_EPSILON ||
            next === this.zoom;
        this.applyZoom(done ? this.zoomTarget : next, anchor ?? undefined);
        if (done) {
            this.zoomAnimating = false;
            this.zoomAnchor = null;
            return;
        }
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => this.animateZoomStep());
        } else {
            this.zoomAnimating = false;
            this.zoomAnchor = null;
        }
    }

    private applyZoom(zoom: number, anchor?: { x: number; y: number }): void {
        const target = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
        if (anchor) {
            const before = this.getDrawBox();
            const worldX = (anchor.x - before.startX) / before.tileSize;
            const worldY = (anchor.y - before.startY) / before.tileSize;
            this.zoom = target;
            const after = this.getDrawBox();
            this.panX += anchor.x - (after.startX + worldX * after.tileSize);
            this.panY += anchor.y - (after.startY + worldY * after.tileSize);
        } else {
            this.zoom = target;
        }
        const zoomLevelEl = document.getElementById("zoomLevel");
        if (zoomLevelEl)
            zoomLevelEl.textContent = Math.round(this.zoom * 100) + "%";
        this.clampPan();
        this.render();
    }

    public setZoom(zoom: number, anchor?: { x: number; y: number }): void {
        // A manual zoom cancels any in-flight wheel animation.
        const target = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
        this.zoomAnimating = false;
        this.zoomAnchor = null;
        this.zoomTarget = target;
        this.applyZoom(target, anchor);
    }

    private onCanvasMouseDown(e: MouseEvent): void {
        const isLeftButton = e.button === 0;
        // Panning is done with the right button. Ctrl/Cmd + left does
        // nothing (neither paints nor pans); plain left paints.
        this.isPanning = e.button === 2;
        this.isPainting = isLeftButton && !e.ctrlKey && !e.metaKey;
        this.isDragging = this.isPainting || this.isPanning;
        const rect = this.canvas.getBoundingClientRect();
        this.lastMousePos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
        if (this.isPainting) {
            this.session.flush();
            this.sessionVerb = "paint";
            this.session.hold();
            const pos = this.getTilePosFromMouse(e);
            this.paintAt(pos);
        }
    }

    private onCanvasMouseMove(e: MouseEvent): void {
        const rect = this.canvas.getBoundingClientRect();
        const currentPos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
        const pos = this.getTilePosFromMouse(e);
        const hoverChanged =
            !this.hoveredTile ||
            this.hoveredTile.X !== pos.X ||
            this.hoveredTile.Y !== pos.Y;
        this.hoveredTile = pos;
        this.updateStatusPosition(pos);

        if (this.isDragging) {
            const dx = currentPos.x - this.lastMousePos.x;
            const dy = currentPos.y - this.lastMousePos.y;
            if (this.isPanning) {
                this.panX += dx * (window.devicePixelRatio || 1);
                this.panY += dy * (window.devicePixelRatio || 1);
                this.clampPan();
                this.requestRender();
            } else if (this.isPainting) {
                this.paintAt(pos);
            }
        } else if (hoverChanged) {
            this.render();
        }
        this.lastMousePos = currentPos;
    }

    private onCanvasMouseUp(): void {
        // A drag stroke closes on release (the session's quiet window is
        // irrelevant while the button is held).
        this.session.release();
        this.session.flush();
        this.isDragging = false;
        this.isPanning = false;
        this.isPainting = false;
    }

    private onCanvasMouseLeave(): void {
        this.onCanvasMouseUp();
        this.hoveredTile = null;
        this.updateStatusPosition(null);
        this.render();
    }

    private getTileColor(type: string, style: string): string {
        if (type === "FloorExterior" && style === "Grass") return "#228B22";
        if (type === "FloorExterior") return "#8B7355";
        if (type === "Floor") return "#D2691E";
        if (type === "Wall") return "#808080";
        if (type === "Water") return "#4169E1";
        return "#654321";
    }

    private getObjectColor(type: string): string {
        if (type.includes("Decoration")) return "#DAA520";
        if (type === "FloorItem") return "#9370DB";
        if (type === "FloorObstacle") return "#8B0000";
        if (type === "WallDecoration") return "#228B22";
        if (type === "WallPath") return "#654321";
        if (type === "Banners") return "#FF6347";
        return "#FF69B4";
    }

    private clampPan(): void {
        // Keep the square drawing box clamped to the viewport borders on each
        // axis independently, with a small overscroll so the map edge becomes
        // visible as feedback. Limits are always >= 0 so they can never invert,
        // and they stay symmetric around the centered position.
        const { size: drawSize, tileSize } = this.getDrawBox();
        const margin = PAN_OVERSCROLL_TILES * tileSize;
        const limitX = Math.max(0, (drawSize - this.canvas.width) / 2) + margin;
        const limitY =
            Math.max(0, (drawSize - this.canvas.height) / 2) + margin;
        this.panX = Math.max(-limitX, Math.min(limitX, this.panX));
        this.panY = Math.max(-limitY, Math.min(limitY, this.panY));
    }

    private getDrawBox(): {
        size: number;
        startX: number;
        startY: number;
        tileSize: number;
    } {
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        // Snap the map to whole device pixels so tile edges land exactly on the
        // pixel grid. Fractional tile sizes cause anti-aliased seams between
        // adjacent sprites that look like a leftover grid.
        const drawSize =
            Math.round(
                (Math.min(canvasWidth, canvasHeight) * this.zoom) / MAP_WIDTH,
            ) * MAP_WIDTH;
        const tileSize = drawSize / MAP_WIDTH;
        const startX = Math.round((canvasWidth - drawSize) / 2 + this.panX);
        const startY = Math.round((canvasHeight - drawSize) / 2 + this.panY);
        return { size: drawSize, startX, startY, tileSize };
    }

    private computeWallEffect(x: number, y: number): number {
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return -1;
        const index = x + y * MAP_WIDTH;
        const tileId = this.mapData.Tiles.charCodeAt(index);
        const tile = this.tileMap.get(tileId) ?? this.fullTileMap.get(tileId);
        if (!tile || tile.Type !== "Wall") return -1;

        // BC's neighbor configuration (ChatRoomMapViewWallEffect):
        // CW = Center-West (left): X-1, Y
        // CE = Center-East (right): X+1, Y
        // SW = South-West (bottom-left): X-1, Y+1
        // SC = South-Center (bottom): X, Y+1
        // SE = South-East (bottom-right): X+1, Y+1
        // Out of bounds counts as wall
        const isWall = (tx: number, ty: number) => {
            if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT)
                return true;
            const ti = tx + ty * MAP_WIDTH;
            const tid = this.mapData.Tiles.charCodeAt(ti);
            const t = this.tileMap.get(tid) ?? this.fullTileMap.get(tid);
            return t !== undefined && t.Type === "Wall";
        };

        return findWallEffectTile(
            isWall(x - 1, y),
            isWall(x + 1, y),
            isWall(x - 1, y + 1),
            isWall(x, y + 1),
            isWall(x + 1, y + 1),
        );
    }

    private computeFloorWallEffect(x: number, y: number): number {
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return -1;
        // No effect on the very last row
        if (y >= MAP_HEIGHT - 1) return -1;

        const index = x + y * MAP_WIDTH;
        const tileId = this.mapData.Tiles.charCodeAt(index);
        const tile = this.tileMap.get(tileId) ?? this.fullTileMap.get(tileId);
        if (!tile) return -1;

        // Find the southern wall positions
        const isWall = (tx: number, ty: number) => {
            if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT)
                return true;
            const ti = tx + ty * MAP_WIDTH;
            const tid = this.mapData.Tiles.charCodeAt(ti);
            const t = this.tileMap.get(tid) ?? this.fullTileMap.get(tid);
            return t !== undefined && t.Type === "Wall";
        };

        const SW = isWall(x - 1, y + 1);
        const SC = isWall(x, y + 1);
        const SE = isWall(x + 1, y + 1);

        return findFloorWallEffect(SW, SC, SE, tile.Style === "HalfWall");
    }

    // Bounds-checked object lookup by grid cell. Returns null outside the map
    // or for empty cells (mirrors ChatRoomMapViewGetObjectAtPos semantics).
    private getObjectAt(x: number, y: number): ObjectDef | null {
        if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return null;
        const objId = this.mapData.Objects.charCodeAt(x + y * MAP_WIDTH);
        if (objId === BLANK_OBJECT_ID) return null;
        return this.fullObjectMap.get(objId) ?? null;
    }

    private hasSameIdNeighbor(x: number, y: number, id: number): boolean {
        const neighbor = this.getObjectAt(x, y);
        return neighbor !== null && neighbor.ID === id;
    }

    // BC-faithful neighbor variant selection (BuildImageName equivalent).
    // Each cell resolves independently, so runs of 3+ identical objects
    // naturally become Left/Middle.../Middle/Right with no group pre-pass
    // and no overlapping stretched draws.
    private resolveVariantImageName(
        x: number,
        y: number,
        obj: ObjectDef,
    ): string {
        const expandable = EXPANDABLE_LEFT_RIGHT.get(obj.ID);
        if (expandable) {
            return resolveExpandableVariant(
                expandable.prefix,
                expandable.single,
                this.hasSameIdNeighbor(x - 1, y, obj.ID),
                this.hasSameIdNeighbor(x + 1, y, obj.ID),
            );
        }
        if (obj.ID === RAILROAD_PREVIEW_ID) {
            return railroadStyleName([
                this.hasSameIdNeighbor(x, y - 1, obj.ID),
                this.hasSameIdNeighbor(x, y + 1, obj.ID),
                this.hasSameIdNeighbor(x + 1, y, obj.ID),
                this.hasSameIdNeighbor(x - 1, y, obj.ID),
            ]);
        }
        return obj.Style;
    }

    private render(): void {
        const ctx = this.ctx;
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        // Draw in device-pixel space (getDrawBox returns device pixels); the
        // canvas backing store is already sized by devicePixelRatio.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#0f0f23";
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const { startX, startY, tileSize } = this.getDrawBox();

        const firstTileX = Math.max(0, Math.floor(-startX / tileSize));
        const lastTileX = Math.min(
            MAP_WIDTH - 1,
            Math.ceil((canvasWidth - startX) / tileSize),
        );
        const firstTileY = Math.max(0, Math.floor(-startY / tileSize));
        const lastTileY = Math.min(
            MAP_HEIGHT - 1,
            Math.ceil((canvasHeight - startY) / tileSize),
        );

        // Render tiles using cached sprites
        for (let y = firstTileY; y <= lastTileY; y++) {
            for (let x = firstTileX; x <= lastTileX; x++) {
                const index = x + y * MAP_WIDTH;
                const tileId = this.mapData.Tiles.charCodeAt(index);
                const tile =
                    this.tileMap.get(tileId) ?? this.fullTileMap.get(tileId);
                if (tile) {
                    const key = tile.Type + "/" + tile.Style;
                    const img = this.tileImageCache.get(key);
                    const drawX = startX + x * tileSize;
                    const drawY = startY + y * tileSize;
                    if (img && img.complete && img.naturalWidth > 0) {
                        ctx.drawImage(img, drawX, drawY, tileSize, tileSize);
                    } else {
                        // Fallback to color if image not loaded
                        ctx.fillStyle = this.getTileColor(
                            tile.Type,
                            tile.Style,
                        );
                        ctx.fillRect(drawX, drawY, tileSize, tileSize);
                    }
                    // Draw wall effects for wall tiles
                    if (tile.Type === "Wall") {
                        const effectIndex = this.computeWallEffect(x, y);
                        if (effectIndex >= 0) {
                            const effectImg =
                                this.wallEffectImageCache.get(effectIndex);
                            if (
                                effectImg &&
                                effectImg.complete &&
                                effectImg.naturalWidth > 0
                            ) {
                                ctx.drawImage(
                                    effectImg,
                                    drawX,
                                    drawY,
                                    tileSize,
                                    tileSize,
                                );
                            }
                        }
                    }
                    // Draw floor wall effects for non-wall tiles
                    else {
                        const floorEffectIndex = this.computeFloorWallEffect(
                            x,
                            y,
                        );
                        if (floorEffectIndex >= 0) {
                            const effectImg =
                                this.wallEffectImageCache.get(floorEffectIndex);
                            if (
                                effectImg &&
                                effectImg.complete &&
                                effectImg.naturalWidth > 0
                            ) {
                                ctx.drawImage(
                                    effectImg,
                                    drawX,
                                    drawY,
                                    tileSize,
                                    tileSize,
                                );
                            }
                        }
                    }
                }
            }
        }

        // Culling bounds stay on whole cells (see objectMarginTiles note).
        const firstObjX = Math.max(0, firstTileX - this.objectMarginTiles);
        const lastObjX = Math.min(
            MAP_WIDTH - 1,
            lastTileX + this.objectMarginTiles,
        );
        const firstObjY = Math.max(0, firstTileY - this.objectMarginTiles);
        const lastObjY = Math.min(
            MAP_HEIGHT - 1,
            lastTileY + this.objectMarginTiles,
        );

        // Render objects using cached sprites
        for (let y = firstObjY; y <= lastObjY; y++) {
            for (let x = firstObjX; x <= lastObjX; x++) {
                const index = x + y * MAP_WIDTH;
                const objId = this.mapData.Objects.charCodeAt(index);
                if (objId === BLANK_OBJECT_ID) continue;
                const obj =
                    this.objectMap.get(objId) ?? this.fullObjectMap.get(objId);
                if (obj && obj.Style !== "Blank") {
                    // Neighbor-aware sprite selection for expanding objects
                    // (CouchPink/BedBlue/BallPit/VikingTable previews,
                    // RailroadPreview, VelourRopeBarrier). BC ships a separate
                    // pre-rendered texture per neighbor configuration, so we
                    // switch textures instead of stretching one sprite. Each
                    // cell draws exactly its own variant rect.
                    const variant = this.resolveVariantImageName(x, y, obj);
                    const baseKey = obj.Type + "/" + obj.Style;
                    const key = obj.Type + "/" + variant;
                    const img =
                        this.objectImageCache.get(key) ??
                        this.objectImageCache.get(baseKey);
                    const left = obj.Left ?? 0;
                    const top = obj.Top ?? 0;
                    const width = obj.Width ?? 1;
                    const height = obj.Height ?? 1;
                    const adjDrawX = startX + (x + left) * tileSize;
                    const adjDrawW = tileSize * width;
                    const adjDrawY = startY + (y + top) * tileSize;
                    const adjDrawH = tileSize * height;
                    if (img && img.complete && img.naturalWidth > 0) {
                        ctx.drawImage(
                            img,
                            adjDrawX,
                            adjDrawY,
                            adjDrawW,
                            adjDrawH,
                        );
                    } else {
                        // Fallback to color if image not loaded
                        ctx.fillStyle = this.getObjectColor(obj.Type);
                        ctx.fillRect(
                            adjDrawX + adjDrawW * OBJECT_DRAW_MARGIN,
                            adjDrawY + adjDrawH * OBJECT_DRAW_MARGIN,
                            adjDrawW * OBJECT_DRAW_SIZE,
                            adjDrawH * OBJECT_DRAW_SIZE,
                        );
                    }
                }
            }
        }

        // Render grid (dark, semi-transparent)
        if (this.showGrid) {
            ctx.strokeStyle = GRID_COLOR;
            ctx.lineWidth = GRID_LINE_WIDTH;
            for (let i = 0; i <= MAP_WIDTH; i++) {
                ctx.beginPath();
                ctx.moveTo(startX + i * tileSize, startY);
                ctx.lineTo(
                    startX + i * tileSize,
                    startY + MAP_HEIGHT * tileSize,
                );
                ctx.stroke();
            }
            for (let j = 0; j <= MAP_HEIGHT; j++) {
                ctx.beginPath();
                ctx.moveTo(startX, startY + j * tileSize);
                ctx.lineTo(
                    startX + MAP_WIDTH * tileSize,
                    startY + j * tileSize,
                );
                ctx.stroke();
            }
        }

        // Tint the visual-mode selection under the hover/cursor outlines
        const visualRegion = this.vim.getRegion();
        if (visualRegion) {
            const regionX = startX + visualRegion.from.X * tileSize;
            const regionY = startY + visualRegion.from.Y * tileSize;
            const regionW =
                (visualRegion.to.X - visualRegion.from.X + 1) * tileSize;
            const regionH =
                (visualRegion.to.Y - visualRegion.from.Y + 1) * tileSize;
            ctx.save();
            ctx.fillStyle = REGION_TINT_COLOR;
            ctx.fillRect(regionX, regionY, regionW, regionH);
            ctx.strokeStyle = REGION_BORDER_COLOR;
            ctx.lineWidth = REGION_BORDER_WIDTH;
            ctx.strokeRect(regionX, regionY, regionW, regionH);
            ctx.restore();
        }

        // Highlight only the hovered tile with a light white outline
        const hover = this.hoveredTile;
        if (
            hover &&
            hover.X >= 0 &&
            hover.X < MAP_WIDTH &&
            hover.Y >= 0 &&
            hover.Y < MAP_HEIGHT
        ) {
            ctx.strokeStyle = HOVER_OUTLINE_COLOR;
            ctx.lineWidth = HOVER_OUTLINE_WIDTH;
            ctx.strokeRect(
                startX + hover.X * tileSize,
                startY + hover.Y * tileSize,
                tileSize,
                tileSize,
            );
        }

        // Draw the vim keyboard cursor as a dashed gold outline
        const vimCursor = this.vim.getCursor();
        if (
            vimCursor &&
            vimCursor.X >= 0 &&
            vimCursor.X < MAP_WIDTH &&
            vimCursor.Y >= 0 &&
            vimCursor.Y < MAP_HEIGHT
        ) {
            ctx.save();
            ctx.setLineDash(CURSOR_DASH_PATTERN);
            ctx.strokeStyle = CURSOR_OUTLINE_COLOR;
            ctx.lineWidth = CURSOR_OUTLINE_WIDTH;
            ctx.strokeRect(
                startX + vimCursor.X * tileSize,
                startY + vimCursor.Y * tileSize,
                tileSize,
                tileSize,
            );
            ctx.restore();
        }
    }

    private requestRender(): void {
        if (this.renderRequested) return;
        this.renderRequested = true;
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => {
                this.renderRequested = false;
                this.render();
            });
        } else {
            this.renderRequested = false;
            this.render();
        }
    }

    /** Where the cursor starts when the first vim key arrives. */
    private vimBootPosition(): Point {
        if (this.hoveredTile) return { ...this.hoveredTile };
        return { X: Math.floor(MAP_WIDTH / 2), Y: Math.floor(MAP_HEIGHT / 2) };
    }

    /** Apply a vim cursor move: reveal if needed, refresh position, redraw. */
    private applyVimCursor(pos: Point): void {
        this.ensureCursorVisible(pos);
        this.updateStatusPosition(pos);
        this.requestRender();
    }

    /** Nudge the pan so a keyboard-moved cursor that left the view reappears. */
    private ensureCursorVisible(pos: Point): void {
        const { startX, startY, tileSize } = this.getDrawBox();
        const canvasWidth = this.canvas.width;
        const canvasHeight = this.canvas.height;
        let changed = false;
        const cellX = startX + pos.X * tileSize;
        const cellY = startY + pos.Y * tileSize;
        if (cellX + tileSize < 0) {
            this.panX += Math.ceil(-cellX / tileSize) * tileSize;
            changed = true;
        } else if (cellX > canvasWidth) {
            this.panX -=
                Math.ceil((cellX + tileSize - canvasWidth) / tileSize) *
                tileSize;
            changed = true;
        }
        if (cellY + tileSize < 0) {
            this.panY += Math.ceil(-cellY / tileSize) * tileSize;
            changed = true;
        } else if (cellY > canvasHeight) {
            this.panY -=
                Math.ceil((cellY + tileSize - canvasHeight) / tileSize) *
                tileSize;
            changed = true;
        }
        if (changed) this.clampPan();
    }

    private updateVimMode(): void {
        const el = document.getElementById("statusVimMode");
        if (el) el.textContent = this.vim.statusModeText();
    }

    /** Route a keyboard event into the vim controller (window dispatcher). */
    public handleVimKey(e: KeyboardEvent): boolean {
        const consumed = this.vim.handleKey(e.key);
        if (consumed) e.preventDefault();
        return consumed;
    }

    private updateStatusPosition(pos: Point | null): void {
        const el = document.getElementById("statusPosition");
        if (!el) return;
        if (
            pos &&
            pos.X >= 0 &&
            pos.X < MAP_WIDTH &&
            pos.Y >= 0 &&
            pos.Y < MAP_HEIGHT
        ) {
            el.textContent = `Position: (${pos.X}, ${pos.Y})`;
        } else {
            el.textContent = "Position: (-, -)";
        }
    }

    private updateStatusSelection(): void {
        const el = document.getElementById("statusSelection");
        if (!el) return;
        let text: string;
        if (this.currentLayer === "object" && this.selectedObject) {
            if (this.selectedObject.Style === "Blank") {
                text = "Selection: Blank (Erase)";
            } else {
                text = `Selection: ${this.selectedObject.Type}/${this.selectedObject.Style}`;
            }
        } else if (this.currentLayer === "tile" && this.selectedTile) {
            text = `Selection: ${this.selectedTile.Type}/${this.selectedTile.Style}`;
        } else {
            text = "No selection";
        }
        el.textContent = text;
    }

    private applyDefaultSelection(): void {
        if (!this.selectedTile) {
            this.selectedTile = this.tileMap.get(GRASS_TILE_ID) ?? null;
        }
        if (!this.selectedObject) {
            this.selectedObject = this.objectMap.get(BLANK_OBJECT_ID) ?? null;
        }
        this.updateStatusSelection();
        this.syncPickerSelection();
    }

    public setCurrentLayer(layer: "tile" | "object"): void {
        this.currentLayer = layer;
        this.applyDefaultSelection();
        this.picker.setLayer(layer);
    }
    public setSelectedTile(tile: TileDef | null): void {
        this.selectedTile = tile;
        this.updateStatusSelection();
        this.syncPickerSelection();
    }
    public setSelectedObject(obj: ObjectDef | null): void {
        this.selectedObject = obj;
        this.updateStatusSelection();
        this.syncPickerSelection();
    }
    public getSelectedTile(): TileDef | null {
        return this.selectedTile;
    }
    public getSelectedObject(): ObjectDef | null {
        return this.selectedObject;
    }
    public exportMap(name: string): string {
        return serializeMap({
            Type: this.mapData.Type,
            Tiles: this.mapData.Tiles,
            Objects: this.mapData.Objects,
        });
    }
    public importMap(code: string): void {
        try {
            this.mapData = parseMapData(
                code,
                (id) => this.fullTileMap.has(id),
                (id) => this.fullObjectMap.has(id),
            );
            // A wholesale map replacement starts a new history lineage.
            this.history.clearRedo();
            this.vim.clearCursor();
            this.resetView();
        } catch (e) {
            throw new Error("Failed to import map: " + e);
        }
    }
    public getMapData(): MapData {
        return this.mapData;
    }
    public newMap(): void {
        this.mapData = createDefaultMap();
        this.history.clearRedo();
        this.selectedTile = this.tileMap.get(GRASS_TILE_ID) ?? null;
        this.selectedObject = this.objectMap.get(BLANK_OBJECT_ID) ?? null;
        this.updateStatusSelection();
        this.syncPickerSelection();
        this.vim.clearCursor();
        this.resetView();
    }

    public resetView(): void {
        this.zoom = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.zoomTarget = 1.0;
        this.zoomAnchor = null;
        this.zoomAnimating = false;
        const zoomLevelEl = document.getElementById("zoomLevel");
        if (zoomLevelEl) zoomLevelEl.textContent = "100%";
        this.render();
    }

    public undo(): void {
        // No flush here: MapHistory is built so a mid-stroke undo consumes
        // the stroke's own entry, and endStroke's rollback skips it by
        // identity — pre-flushing would steal the wrong entry (the vim `u`
        // path flushes via the controller's flushEdits intent).
        const prev = this.history.undo([
            this.mapData.Tiles,
            this.mapData.Objects,
        ]);
        if (!prev) return;
        this.mapData.Tiles = prev[0];
        this.mapData.Objects = prev[1];
        this.requestRender();
    }

    public redo(): void {
        const next = this.history.redo([
            this.mapData.Tiles,
            this.mapData.Objects,
        ]);
        if (!next) return;
        this.mapData.Tiles = next[0];
        this.mapData.Objects = next[1];
        this.requestRender();
    }

    public toggleGrid(): void {
        this.setGridVisible(!this.showGrid);
    }

    public setGridVisible(visible: boolean): void {
        this.showGrid = visible;
        this.render();
    }

    public getGridVisible(): boolean {
        return this.showGrid;
    }

    public toggleHelp(): void {
        this.setHelpVisible(!this.showHelp);
    }

    public setHelpVisible(visible: boolean): void {
        this.showHelp = visible;
        const helpEl = document.getElementById("controlsHelp");
        if (helpEl) {
            helpEl.style.display = visible ? "" : "none";
        }
    }

    public getHelpVisible(): boolean {
        return this.showHelp;
    }

    private syncPickerSelection(): void {
        this.picker.syncSelection(
            this.selectedTile?.ID ?? null,
            this.selectedObject?.ID ?? null,
        );
    }

    public filterPickers(term: string): void {
        this.picker.filter(term);
    }

    public populatePickers(): void {
        this.picker.populate(this.tileCatalog, this.objectCatalog);
        this.syncPickerSelection();
    }

    public updatePickerVisibility(): void {
        this.picker.updateVisibility();
    }

    public getTileCatalog(): TileDef[] {
        return this.tileCatalog;
    }
    public getObjectCatalog(): ObjectDef[] {
        return this.objectCatalog;
    }
    public getFullTileCatalog(): readonly TileDef[] {
        return FULL_TILE_CATALOG;
    }
    public getFullObjectCatalog(): readonly ObjectDef[] {
        return FULL_OBJECT_CATALOG;
    }
    public isKnownObjectId(id: number): boolean {
        return this.fullObjectMap.has(id);
    }
    public isKnownTileId(id: number): boolean {
        return this.fullTileMap.has(id);
    }
    public getCurrentLayer(): string {
        return this.currentLayer;
    }
}
