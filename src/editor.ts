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

export type { ObjectDef, TileDef } from "./catalog";

export interface Point {
    X: number;
    Y: number;
}

interface CategoryEntry {
    content: HTMLElement;
    caret: HTMLElement;
    collapsed: boolean;
}

export interface MapRegion {
    TopLeft: Point;
    BottomRight: Point;
}

// Neighbor-aware ("expanding") objects, mirroring BC's BuildImageName logic
// (ropeybot/src/bcdata/ChatRoomMap.ts). `prefix` is the texture name stem,
// `single` the variant used when the object has no same-ID neighbors.
// NOTE: upstream spells the single-couch file "CouckPinkSmall" (typo); the
// correctly-spelled name 404s on the R132 server, so the typo is used here.
// Railroad (750) is connectivity-based and handled separately; Velour rope
// barrier (2033) reuses its base style name when single.
const EXPANDABLE_LEFT_RIGHT = new Map<
    number,
    { prefix: string; single: string }
>([
    [710, { prefix: "CouchPink", single: "CouckPinkSmall" }],
    [720, { prefix: "BedBlue", single: "BedBlueSmall" }],
    [730, { prefix: "BallPit", single: "BallPitSmall" }],
    [740, { prefix: "VikingTable", single: "VikingTableSmall" }],
    [2033, { prefix: "VelourRopeBarrier", single: "VelourRopeBarrier" }],
]);
const RAILROAD_PREVIEW_ID = 750;

// Bundled eraser icon for Blank (delete-tool) picker items. Inline SVG on
// purpose: the previous markup used the non-existent `bi-erase` class (only
// `eraser`/`eraser-fill` exist), so the icon could never render, and font
// glyphs additionally fail offline. Artwork below is the official Bootstrap
// Icons `eraser` (v1.11.1, MIT) inlined, tinted flat #adb5bd to match the
// picker's minimal look with zero CSS dependency.
const BLANK_ERASER_ICON =
    '<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">' +
    '<svg class="picker-eraser-icon" width="30" height="30" viewBox="0 0 16 16" fill="#adb5bd" aria-hidden="true">' +
    '<path d="M8.086 2.207a2 2 0 0 1 2.828 0l3.879 3.879a2 2 0 0 1 0 2.828l-5.5 5.5A2 2 0 0 1 7.879 15H5.12a2 2 0 0 1-1.414-.586l-2.5-2.5a2 2 0 0 1 0-2.828l6.879-6.879zm2.121.707a1 1 0 0 0-1.414 0L4.16 7.547l5.293 5.293 4.633-4.633a1 1 0 0 0 0-1.414l-3.879-3.879zM8.746 13.547 3.453 8.254 1.914 9.793a1 1 0 0 0 0 1.414l2.5 2.5a1 1 0 0 0 .707.293H7.88a1 1 0 0 0 .707-.293l.16-.16z"/>' +
    "</svg></span>";

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
    private searchTerm = "";
    private tileCategoryEls: CategoryEntry[] = [];
    private objectCategoryEls: CategoryEntry[] = [];
    private tilePickerItemById = new Map<number, HTMLElement>();
    private objectPickerItemById = new Map<number, HTMLElement>();
    private showGrid = true;
    private showHelp = true;
    private renderRequested = false;
    private history = new MapHistory();
    private objectMarginTiles = 0;
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

    private paintAt(pos: Point): void {
        if (pos.X < 0 || pos.X >= MAP_WIDTH || pos.Y < 0 || pos.Y >= MAP_HEIGHT)
            return;
        const index = pos.X + pos.Y * MAP_WIDTH;
        if (this.currentLayer === "tile" && this.selectedTile) {
            const ch = String.fromCharCode(this.selectedTile.ID);
            // No-op guard: repainting the same cell must not dirty state or
            // request renders (and, together with per-stroke pushes, keeps
            // one physical click to exactly one undo entry).
            if (this.mapData.Tiles[index] === ch) return;
            this.mapData.Tiles =
                this.mapData.Tiles.substring(0, index) +
                ch +
                this.mapData.Tiles.substring(index + 1);
            this.history.markDirty();
        } else if (this.currentLayer === "object" && this.selectedObject) {
            const ch = String.fromCharCode(this.selectedObject.ID);
            if (this.mapData.Objects[index] === ch) return;
            this.mapData.Objects =
                this.mapData.Objects.substring(0, index) +
                ch +
                this.mapData.Objects.substring(index + 1);
            this.history.markDirty();
        } else {
            return;
        }
        this.requestRender();
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
            this.history.beginStroke(this.mapData.Tiles, this.mapData.Objects);
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
        this.history.endStroke();
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

        const CW = isWall(x - 1, y);
        const CE = isWall(x + 1, y);
        const SW = isWall(x - 1, y + 1);
        const SC = isWall(x, y + 1);
        const SE = isWall(x + 1, y + 1);

        // BC's FindWallEffectTile algorithm (ChatRoomMapViewFindWallEffectTile)
        if (CW && CE && SW && SC && SE) return 0;
        if (!CW && !CE && !SC) return 1;
        if (!CW && CE && !SC) return 2;
        if (CW && !CE && !SC) return 3;
        if (CW && CE && !SC) return 4;

        if (!CW && !CE && SW && SC && SE) return 5;
        if (!CW && !CE && SW && SC && !SE) return 6;
        if (!CW && !CE && !SW && SC && SE) return 7;

        if (CW && CE && !SW && SC && !SE) return 8;
        if (!CW && CE && !SW && SC && !SE) return 9;
        if (CW && !CE && !SW && SC && !SE) return 10;

        if (!CW && !CE && !SE && SC && !SW) return 11;
        if (CW && !CE && !SE && SC && !SW) return 12;
        if (!CW && CE && !SE && SC && !SW) return 13;

        if (!CW && CE && SE && SC && SW) return 14;
        if (CW && !CE && SE && SC && SW) return 15;

        if (CW && !CE && SW && SC) return 16;
        if (!CW && CE && SC && SE) return 17;

        if (CW && CE && SW && SC && !SE) return 18;
        if (CW && CE && !SW && SC && SE) return 19;

        if (!CW && CE && SW && SC && !SE) return 20;
        if (CW && !CE && !SW && SC && SE) return 21;

        return -1;
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

        // If here is HalfWall
        if (tile.Style === "HalfWall") {
            if (!SW && SC && !SE) return 11;
            if (!SW && SC && SE) return 12;
            if (SW && SC && !SE) return 13;
            if (SW && SC && SE) return 0;
        }

        // Find the "3D" wall effect for floor tiles
        if (!SW && SC && !SE) return 50;
        if (!SW && SC && SE) return 51;
        if (SW && SC && !SE) return 52;
        if (SW && SC && SE) return 53;
        return -1;
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
            const hasLeft = this.hasSameIdNeighbor(x - 1, y, obj.ID);
            const hasRight = this.hasSameIdNeighbor(x + 1, y, obj.ID);
            if (hasLeft && hasRight) return expandable.prefix + "Middle";
            if (hasLeft) return expandable.prefix + "Right";
            if (hasRight) return expandable.prefix + "Left";
            return expandable.single;
        }
        if (obj.ID === RAILROAD_PREVIEW_ID) {
            // Suffix built in strict North/South/East/West order (BC source).
            let suffix = "";
            if (this.hasSameIdNeighbor(x, y - 1, obj.ID)) suffix += "North";
            if (this.hasSameIdNeighbor(x, y + 1, obj.ID)) suffix += "South";
            if (this.hasSameIdNeighbor(x + 1, y, obj.ID)) suffix += "East";
            if (this.hasSameIdNeighbor(x - 1, y, obj.ID)) suffix += "West";
            return "Railroad" + suffix;
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
        this.updatePickerVisibility();
        this.filterPickers(this.searchTerm);
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

    private createCategoryHeader(name: string): {
        header: HTMLElement;
        entry: CategoryEntry;
    } {
        const header = document.createElement("div");
        header.className =
            "category-header p-2 border-bottom border-secondary d-flex align-items-center gap-2";
        const caret = document.createElement("i");
        caret.className = "bi bi-caret-right-fill category-caret";
        const label = document.createElement("span");
        label.textContent = name;
        header.appendChild(caret);
        header.appendChild(label);
        const content = document.createElement("div");
        content.className = "category-content p-2";
        const entry: CategoryEntry = { content, caret, collapsed: false };
        header.addEventListener("click", () =>
            this.setCategoryCollapsed(entry, !entry.collapsed),
        );
        return { header, entry };
    }

    private setCategoryCollapsed(
        entry: CategoryEntry,
        collapsed: boolean,
    ): void {
        entry.collapsed = collapsed;
        entry.content.style.display = collapsed ? "none" : "";
        if (collapsed) entry.caret.classList?.remove("expanded");
        else entry.caret.classList?.add("expanded");
    }

    private syncPickerSelection(): void {
        this.tilePickerItemById.forEach((el, id) => {
            el.classList?.toggle("selected", this.selectedTile?.ID === id);
        });
        this.objectPickerItemById.forEach((el, id) => {
            el.classList?.toggle("selected", this.selectedObject?.ID === id);
        });
    }

    public filterPickers(term: string): void {
        this.searchTerm = term;
        const lowered = term.trim().toLowerCase();
        const entries =
            this.currentLayer === "tile"
                ? this.tileCategoryEls
                : this.objectCategoryEls;
        entries.forEach((entry) => {
            const items = entry.content.querySelectorAll(".sprite-item");
            let matches = 0;
            items.forEach((el) => {
                const htmlEl = el as HTMLElement;
                const title = htmlEl.getAttribute?.("title") || "";
                const txt = htmlEl.textContent || "";
                const match =
                    lowered === "" ||
                    title.toLowerCase().includes(lowered) ||
                    txt.toLowerCase().includes(lowered);
                htmlEl.style.display = match ? "" : "none";
                if (match) matches++;
            });
            this.setCategoryCollapsed(
                entry,
                lowered === "" ? true : matches === 0,
            );
        });
    }

    public populatePickers(): void {
        const tileCategories = document.getElementById("tileCategories");
        const objectCategories = document.getElementById("objectCategories");
        if (!tileCategories || !objectCategories) return;

        this.tileCategoryEls = [];
        this.objectCategoryEls = [];
        this.tilePickerItemById.clear();
        this.objectPickerItemById.clear();

        const tileGroups = new Map<string, TileDef[]>();
        this.tileCatalog.forEach((t) => {
            if (!tileGroups.has(t.Type)) tileGroups.set(t.Type, []);
            tileGroups.get(t.Type)!.push(t);
        });
        // Clear without HTML parsing (containers only hold app-created nodes).
        tileCategories.replaceChildren();
        tileGroups.forEach((tiles, type) => {
            const { header, entry } = this.createCategoryHeader(type);
            this.tileCategoryEls.push(entry);
            const container = entry.content;
            tiles.forEach((tile) => {
                const item = document.createElement("div");
                item.className = "sprite-item";
                const key = tile.Type + "/" + tile.Style;
                item.style.backgroundImage =
                    "url(assets/tiles/" + key + ".png)";
                item.title = tile.Style;
                item.addEventListener("click", () => {
                    this.setSelectedTile(tile);
                });
                container.appendChild(item);
                this.tilePickerItemById.set(tile.ID, item);
            });
            tileCategories.appendChild(header);
            tileCategories.appendChild(container);
        });

        const objGroups = new Map<string, ObjectDef[]>();
        this.objectCatalog.forEach((o) => {
            let g = o.Type;
            if (o.Type.startsWith("FloorDecoration")) g = "Floor Decorations";
            else if (
                o.Type === "FloorItem" ||
                o.Type === "FloorNumber" ||
                o.Type === "FloorLetter" ||
                o.Type === "FloorIcon"
            )
                g = "Floor Items";
            else if (o.Type === "FloorObstacle") g = "Floor Obstacles";
            else if (o.Type === "WallDecoration" || o.Type === "WallPath")
                g = "Wall";
            else if (o.Type === "Banners") g = "Banners";
            if (!objGroups.has(g)) objGroups.set(g, []);
            objGroups.get(g)!.push(o);
        });
        // Clear without HTML parsing (containers only hold app-created nodes).
        objectCategories.replaceChildren();
        objGroups.forEach((objs, group) => {
            const { header, entry } = this.createCategoryHeader(group);
            this.objectCategoryEls.push(entry);
            const container = entry.content;
            let blankAdded = false;
            objs.forEach((obj) => {
                if (obj.Style === "Blank") {
                    if (blankAdded) {
                        return;
                    }
                    blankAdded = true;
                }
                const item = document.createElement("div");
                item.className = "sprite-item";
                if (obj.Style !== "Blank") {
                    const key = obj.Type + "/" + obj.Style;
                    item.style.backgroundImage =
                        "url(assets/objects/" + key + ".png)";
                    item.title = obj.Style;
                } else {
                    // Static compile-time SVG constant only (no interpolation
                    // of catalog or user data); the single sanctioned
                    // innerHTML use in this file.
                    item.innerHTML = BLANK_ERASER_ICON;
                    item.title = "Blank (Erase)";
                }
                item.addEventListener("click", () => {
                    this.setSelectedObject(obj);
                });
                container.appendChild(item);
                this.objectPickerItemById.set(obj.ID, item);
            });
            objectCategories.appendChild(header);
            objectCategories.appendChild(container);
        });

        this.tileCategoryEls.forEach((entry) =>
            this.setCategoryCollapsed(entry, true),
        );
        this.objectCategoryEls.forEach((entry) =>
            this.setCategoryCollapsed(entry, true),
        );
        this.updatePickerVisibility();
        this.syncPickerSelection();
    }

    public updatePickerVisibility(): void {
        const tileCategories = document.getElementById("tileCategories");
        const objectCategories = document.getElementById("objectCategories");
        if (!tileCategories || !objectCategories) return;
        if (this.currentLayer === "tile") {
            tileCategories.style.display = "";
            objectCategories.style.display = "none";
        } else {
            tileCategories.style.display = "none";
            objectCategories.style.display = "";
        }
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
