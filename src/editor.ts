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
import { appSurface } from "./appSurface";
import {
    advanceToward,
    settled,
    prefersReducedMotion,
    fadeIn,
    marchOffset,
    FRAME_MS,
    MOTION_EPSILON_TILES,
    MOTION_EPSILON_SCALE,
    MOTION_MAX_STEP_MS,
    MOTION_MS,
    MOTION_QUICK_MS,
} from "./anim";
import { VimController } from "./vim/vimController";
import { EditSession } from "./vim/editSession";
import { captureRegion, type YankBuffer } from "./vim/yank";
import { regionCells, type Region } from "./vim/motions";
import { runCommand } from "./vim/commands";
import { lineCells } from "./line";
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
const ZOOM_ANIMATION_EPSILON = 0.001;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3.0;

const OBJECT_DRAW_MARGIN = 0.2;
const OBJECT_DRAW_SIZE = 0.6;
const GRID_COLOR = "rgba(30, 30, 40, 0.45)";
const GRID_LINE_WIDTH = 0.5;
const HOVER_OUTLINE_COLOR = "rgba(255, 255, 255, 0.9)";
const HOVER_OUTLINE_WIDTH = 2;
// The vim cursor shares the hover white exactly: one white-ish color for
// every outline (hover, cursor, picker focus, selection). Only the dash
// pattern tells keyboard and mouse apart.
const CURSOR_OUTLINE_COLOR = HOVER_OUTLINE_COLOR;
const CURSOR_OUTLINE_WIDTH = 2;
const CURSOR_DASH_PATTERN = [4, 4];
// Off-map cursor: same position and hue, dimmed dotted — context kept,
// paint-ready signal unambiguous. Drawn when the tracked surface is
// anything but the map.
const CURSOR_INACTIVE_COLOR = "rgba(255, 255, 255, 0.35)";
const CURSOR_INACTIVE_DASH_PATTERN = [2, 3];
const REGION_TINT_COLOR = "rgba(13, 110, 253, 0.25)";
const REGION_BORDER_COLOR = "rgba(13, 110, 253, 0.9)";
/** Yank blink fill: faint white over the quick tier (border reuses hover white). */
const YANK_FLASH_FILL = "rgba(255, 255, 255, 0.15)";
const REGION_BORDER_WIDTH = 2;
const FEEDBACK_MS = 1500;
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
    /** One entry per gesture (mouse) or key-repeat burst (vim): closes on idle timeout or explicit flush. */
    private session = new EditSession({
        begin: () =>
            this.history.beginStroke(this.mapData.Tiles, this.mapData.Objects),
        markDirty: () => this.history.markDirty(),
        end: () => this.history.endStroke(),
    });
    /** Copy buffer from `y`, holding both layers; `p` pastes it. */
    private yankBuffer: YankBuffer | null = null;
    /** Set by init.ts: export the map (`:w`) and open Import (`:e`). */
    public onWriteMapRequest: ((name?: string) => void) | null = null;
    public onImportRequest: (() => void) | null = null;
    /** Suppress mode-slot updates while a transient message shows. */
    private feedbackUntil = 0;
    private picker = new MapPicker({
        onSelectTile: (tile) => this.setSelectedTile(tile),
        onSelectObject: (obj) => this.setSelectedObject(obj),
    });
    private objectMarginTiles = 0;
    /**
     * Render-side cursor/region: fractional positions easing toward the
     * logical vim state each frame. Presentation only — status, paint,
     * yank and boot logic always read the raw cursor/region.
     */
    private cursorRenderPos: Point | null = null;
    private regionRender: Region | null = null;
    /**
     * Cursor march state: wall-clock elapsed driving the marching
     * dashes (frozen once settled). Presentation only, like the
     * positions above.
     */
    private cursorMarchElapsed = 0;
    private cursorDashOffset = 0;
    /**
     * Hover render state: fractional cell chasing the raw hover plus a
     * 0..1 scale that grows the outline from the tile middle on appear
     * and shrinks it back on leave. Logic keeps reading hoveredTile.
     */
    private hoverRenderPos: Point | null = null;
    private hoverRenderScale = 0;
    /**
     * Last wall-clock timestamps consumed by the motion and zoom loops.
     * Null until the first frame; each frame advances at most
     * MOTION_MAX_STEP_MS so idle gaps and background tabs catch up
     * smoothly instead of jumping.
     */
    private lastMotionAt: number | null = null;
    private lastZoomAt: number | null = null;
    /**
     * One-shot commit pulse: region + start timestamp. The render loop
     * draws it decaying over the standard token, then clears it.
     * Presentation only; skipped under reduced motion.
     */
    /**
     * One-shot commit pulse: region + start timestamp + duration + style.
     * Paint commits flash the region tint; yanks blink it white. Latest
     * gesture wins; skipped under reduced motion. Presentation only.
     */
    private flash: {
        region: Region;
        startedAt: number;
        durationMs: number;
        border: string | null;
        fill: string | null;
    } | null = null;
    private vim = new VimController({
        setCursor: (pos) => this.applyVimCursor(pos),
        bootCursor: () => this.vimBootPosition(),
        paintAt: (at) => this.vimPaintAt(at),
        paintRegion: (region) => this.paintRegion(region),
        yankRegion: (region) => this.captureYankRegion(region),
        pasteYank: (at) => this.pasteYank(at),
        pasteYankTiled: (region) => this.pasteYankTiled(region),
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
        // Surface changes restyle the cursor: repaint once per change
        // (focus transitions are rare; this is outside hot key paths).
        appSurface.subscribe(() => this.requestRender());
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
     * Route an edit into the coalesced session. Repeats share one undo
     * entry until the quiet window ends; a flush (gesture/mode change,
     * region gesture) starts a new entry.
     */
    private applySessionEdit(mutate: () => boolean): void {
        this.session.runEdit(mutate);
    }

    /**
     * Write one cell of the active layer with the current picker selection
     * (Grass tile / Blank object are ordinary brushes: erasing is painting).
     * Returns whether the map changed, so no-op edits cost no undo entry.
     */
    private writeCell(pos: Point): boolean {
        if (pos.X < 0 || pos.X >= MAP_WIDTH || pos.Y < 0 || pos.Y >= MAP_HEIGHT)
            return false;
        const index = pos.X + pos.Y * MAP_WIDTH;
        if (this.currentLayer === "object") {
            const ch = this.selectedObject
                ? String.fromCharCode(this.selectedObject.ID)
                : null;
            if (ch === null) return false;
            if (this.mapData.Objects[index] === ch) return false;
            // Unique objects (BC's `Unique`: the entry flag) live at most
            // once per map, so placing one moves it. The clear and the
            // write share this stroke, making the whole move one undo
            // entry. Mirrors BC's setObject/#clearUniqueObject.
            if (this.selectedObject?.unique) {
                this.clearUniqueObject(this.selectedObject.ID, index);
            }
            this.mapData.Objects =
                this.mapData.Objects.substring(0, index) +
                ch +
                this.mapData.Objects.substring(index + 1);
            this.requestRender();
            return true;
        }
        const ch = this.selectedTile
            ? String.fromCharCode(this.selectedTile.ID)
            : null;
        if (ch === null) return false;
        if (this.mapData.Tiles[index] === ch) return false;
        this.mapData.Tiles =
            this.mapData.Tiles.substring(0, index) +
            ch +
            this.mapData.Tiles.substring(index + 1);
        this.requestRender();
        return true;
    }

    /** Blank every cell holding `objectId`, except `keepIndex`. */
    private clearUniqueObject(objectId: number, keepIndex: number): void {
        const chars = this.mapData.Objects.split("");
        let cleared = false;
        for (let i = 0; i < chars.length; i++) {
            if (i === keepIndex) continue;
            if (chars[i].charCodeAt(0) === objectId) {
                chars[i] = String.fromCharCode(BLANK_OBJECT_ID);
                cleared = true;
            }
        }
        if (cleared) this.mapData.Objects = chars.join("");
    }

    private paintAt(pos: Point): void {
        this.applySessionEdit(() => this.writeCell(pos));
    }

    private vimPaintAt(at: Point): void {
        this.applySessionEdit(() => this.writeCell(at));
    }

    /**
     * `Space`/`Enter` in visual mode: fill the region with the current
     * brush on the active layer as one undo entry. (Erasing is painting
     * with the Grass / Blank brush.) A missing brush paints nothing.
     */
    private paintRegion(region: Region): void {
        const cells = regionCells(region);
        let painted = false;
        this.applySessionEdit(() => {
            painted = false;
            for (const cell of cells) {
                if (this.writeCell(cell)) painted = true;
            }
            return painted;
        });
        if (painted) this.flashCommit(region);
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
        // A successful yank blinks the region white and exits visual
        // mode (the controller closes it right after this intent).
        this.flashCommit(region, "yank");
    }

    /** `p`: paste the yank buffer (both layers) anchored at the cursor. */
    private pasteYank(at: Point): void {
        const buffer = this.yankBuffer;
        if (!buffer) {
            this.showVimFeedback("E353: Nothing in register");
            return;
        }
        this.applySessionEdit(() => {
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

    /**
     * `p` in visual mode: tile the yank buffer over the region from its
     * top-left, repeating and trimming to fit, both layers exactly as
     * stored. One undo entry. A region smaller than the buffer trims.
     */
    private pasteYankTiled(region: Region): void {
        const buffer = this.yankBuffer;
        if (!buffer) {
            this.showVimFeedback("E353: Nothing in register");
            return;
        }
        const width = region.to.X - region.from.X + 1;
        const height = region.to.Y - region.from.Y + 1;
        let painted = false;
        this.applySessionEdit(() => {
            painted = false;
            for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) {
                    const charIndex =
                        (row % buffer.height) * buffer.width +
                        (col % buffer.width);
                    if (
                        this.writeBothLayers(
                            region.from.X + col,
                            region.from.Y + row,
                            buffer.tiles[charIndex],
                            buffer.objects[charIndex],
                        )
                    ) {
                        painted = true;
                    }
                }
            }
            return painted;
        });
        if (painted) this.flashCommit(region);
    }

    /**
     * Arm the one-shot commit pulse: the region flashes softly, then
     * fades. Paint uses the region tint over the standard token; yank
     * blinks white over the quick tier. Presentation only; skipped
     * under reduced motion.
     */
    private flashCommit(
        region: Region,
        kind: "paint" | "yank" = "paint",
    ): void {
        if (prefersReducedMotion()) return;
        this.flash = {
            region: { from: { ...region.from }, to: { ...region.to } },
            startedAt: performance.now(),
            durationMs: kind === "yank" ? MOTION_QUICK_MS : MOTION_MS,
            border: kind === "yank" ? HOVER_OUTLINE_COLOR : null,
            fill: kind === "yank" ? YANK_FLASH_FILL : REGION_TINT_COLOR,
        };
        this.requestRender();
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

    private animateZoomStep(now: number = performance.now()): void {
        const anchor = this.zoomAnchor;
        const last = this.lastZoomAt;
        this.lastZoomAt = now;
        const dt =
            last === null
                ? FRAME_MS
                : Math.min(Math.max(0, now - last), MOTION_MAX_STEP_MS);
        const next = advanceToward(
            this.zoom,
            this.zoomTarget,
            MOTION_QUICK_MS,
            dt,
        );
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

    /**
     * UI-initiated zoom step (toolbar buttons): retargets and glides
     * through the shared animation loop, so repeated presses retarget
     * mid-flight instead of jumping. Unlike setZoom (synchronous and
     * exact, kept for programmatic use and clamping tests), this honors
     * the motion durations like every other chase.
     */
    public zoomBy(factor: number): void {
        const base = this.zoomAnimating ? this.zoomTarget : this.zoom;
        this.zoomTarget = Math.max(
            this.minZoom,
            Math.min(this.maxZoom, base * factor),
        );
        this.zoomAnchor = null;
        if (!this.zoomAnimating) {
            this.zoomAnimating = true;
            this.animateZoomStep();
        }
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
                // Repaint on cell change even when the paint is a no-op
                // (same tile as the brush): no-op writes schedule no
                // render themselves, but the hover outline must keep
                // following the mouse. Coalesced, so scrubbing is free.
                if (hoverChanged) this.requestRender();
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
                    // Conveyor belts bake direction purely as a rotation
                    // about the rect centre (degrees, clockwise on screen),
                    // mirroring BC. Zero rotation keeps the fast path with no
                    // transform so existing rendering is pixel-identical.
                    const rotation = obj.Rotation ?? 0;
                    if (rotation !== 0) {
                        ctx.save();
                        ctx.translate(
                            adjDrawX + adjDrawW / 2,
                            adjDrawY + adjDrawH / 2,
                        );
                        ctx.rotate((rotation * Math.PI) / 180);
                        ctx.translate(
                            -(adjDrawX + adjDrawW / 2),
                            -(adjDrawY + adjDrawH / 2),
                        );
                    }
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
                    if (rotation !== 0) ctx.restore();
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

        // Ease render positions toward the logical state first so the
        // cursor and region below draw mid-flight; chain another frame
        // while anything is still moving (stops dead at rest).
        const moving = this.stepMotion();
        // Tint the visual-mode selection under the hover/cursor outlines
        const visualRegion = this.regionRender;
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

        // One-shot commit pulse decaying over its duration, then gone.
        // Chains frames only while alive.
        const flash = this.flash;
        if (flash) {
            const age = performance.now() - flash.startedAt;
            if (age >= flash.durationMs) {
                this.flash = null;
            } else {
                const rx = startX + flash.region.from.X * tileSize;
                const ry = startY + flash.region.from.Y * tileSize;
                const rw =
                    (flash.region.to.X - flash.region.from.X + 1) * tileSize;
                const rh =
                    (flash.region.to.Y - flash.region.from.Y + 1) * tileSize;
                ctx.save();
                ctx.globalAlpha = 1 - age / flash.durationMs;
                if (flash.fill) {
                    ctx.fillStyle = flash.fill;
                    ctx.fillRect(rx, ry, rw, rh);
                }
                if (flash.border) {
                    ctx.strokeStyle = flash.border;
                    ctx.lineWidth = REGION_BORDER_WIDTH;
                    ctx.strokeRect(rx, ry, rw, rh);
                }
                ctx.restore();
                this.requestRender();
            }
        }

        // Hover outline: chases the raw cell and grows from the tile
        // middle on appear, shrinking back on leave (presentation only).
        const hoverDraw = this.hoverRenderPos;
        if (hoverDraw && this.hoverRenderScale > MOTION_EPSILON_SCALE) {
            const hoverSize = tileSize * Math.min(1, this.hoverRenderScale);
            const hoverCX = startX + (hoverDraw.X + 0.5) * tileSize;
            const hoverCY = startY + (hoverDraw.Y + 0.5) * tileSize;
            ctx.strokeStyle = HOVER_OUTLINE_COLOR;
            ctx.lineWidth = HOVER_OUTLINE_WIDTH;
            ctx.strokeRect(
                hoverCX - hoverSize / 2,
                hoverCY - hoverSize / 2,
                hoverSize,
                hoverSize,
            );
        }

        // Draw the vim keyboard cursor: white dashed while the tracked
        // surface is the map, dimmed white dotted everywhere else.
        const vimCursor = this.cursorRenderPos;
        if (
            vimCursor &&
            vimCursor.X >= 0 &&
            vimCursor.X < MAP_WIDTH &&
            vimCursor.Y >= 0 &&
            vimCursor.Y < MAP_HEIGHT
        ) {
            const onMap = appSurface.get() === "map";
            ctx.save();
            ctx.setLineDash(
                onMap ? CURSOR_DASH_PATTERN : CURSOR_INACTIVE_DASH_PATTERN,
            );
            ctx.lineDashOffset = this.cursorDashOffset;
            ctx.strokeStyle = onMap
                ? CURSOR_OUTLINE_COLOR
                : CURSOR_INACTIVE_COLOR;
            ctx.lineWidth = CURSOR_OUTLINE_WIDTH;
            ctx.strokeRect(
                startX + vimCursor.X * tileSize,
                startY + vimCursor.Y * tileSize,
                tileSize,
                tileSize,
            );
            ctx.restore();
        }
        if (moving) this.requestRender();
    }

    /**
     * Ease render positions toward the logical vim state using wall-clock
     * deltas, so settle time follows the duration tokens on any refresh
     * rate. Open/close snaps (a fresh outline appears whole, a dismissed
     * one vanishes); resizes glide. Returns true while anything is still
     * moving. A frozen clock (dt 0) moves nothing and chains nothing, so
     * synchronous environments can never recurse.
     */
    private stepMotion(): boolean {
        if (prefersReducedMotion()) {
            const cursor = this.vim.getCursor();
            this.cursorRenderPos = cursor ? { ...cursor } : null;
            this.cursorMarchElapsed = 0;
            this.cursorDashOffset = 0;
            const region = this.vim.getRegion();
            this.regionRender = region
                ? { from: { ...region.from }, to: { ...region.to } }
                : null;
            const hover = this.hoveredTile;
            const hoverVisible = !!hover && this.isTileOnMap(hover);
            this.hoverRenderPos = hoverVisible ? { ...hover } : null;
            this.hoverRenderScale = hoverVisible ? 1 : 0;
            this.lastMotionAt = performance.now();
            return false;
        }
        const now = performance.now();
        const dt =
            this.lastMotionAt === null
                ? 0
                : Math.min(
                      Math.max(0, now - this.lastMotionAt),
                      MOTION_MAX_STEP_MS,
                  );
        this.lastMotionAt = now;
        let moving = false;
        const cursor = this.vim.getCursor();
        if (!cursor) {
            this.cursorRenderPos = null;
        } else if (!this.cursorRenderPos) {
            // Fresh outline appears whole: no glide, no march.
            this.cursorRenderPos = { ...cursor };
            this.cursorMarchElapsed = 0;
            this.cursorDashOffset = 0;
        } else {
            const next = {
                X: advanceToward(
                    this.cursorRenderPos.X,
                    cursor.X,
                    MOTION_MS,
                    dt,
                ),
                Y: advanceToward(
                    this.cursorRenderPos.Y,
                    cursor.Y,
                    MOTION_MS,
                    dt,
                ),
            };
            if (
                settled(next.X, cursor.X, MOTION_EPSILON_TILES) &&
                settled(next.Y, cursor.Y, MOTION_EPSILON_TILES)
            ) {
                this.cursorRenderPos = { ...cursor };
            } else {
                this.cursorRenderPos = next;
                this.cursorMarchElapsed += dt;
                const dashPattern =
                    appSurface.get() === "map"
                        ? CURSOR_DASH_PATTERN
                        : CURSOR_INACTIVE_DASH_PATTERN;
                this.cursorDashOffset = marchOffset(
                    this.cursorMarchElapsed,
                    dashPattern.reduce((a, b) => a + b, 0),
                );
                moving = dt > 0;
            }
        }
        const hover = this.hoveredTile;
        const hoverCell = hover && this.isTileOnMap(hover) ? hover : null;
        if (!hoverCell) {
            // Tile left for void (or the canvas): shrink toward the
            // middle, then hide. Re-entry mid-shrink reverses below.
            if (
                this.hoverRenderPos &&
                this.hoverRenderScale > MOTION_EPSILON_SCALE
            ) {
                this.hoverRenderScale = advanceToward(
                    this.hoverRenderScale,
                    0,
                    MOTION_QUICK_MS,
                    dt,
                );
                if (this.hoverRenderScale <= MOTION_EPSILON_SCALE) {
                    this.hoverRenderScale = 0;
                    this.hoverRenderPos = null;
                } else {
                    moving = dt > 0;
                }
            } else {
                this.hoverRenderScale = 0;
                this.hoverRenderPos = null;
            }
        } else {
            if (!this.hoverRenderPos) this.hoverRenderPos = { ...hoverCell };
            else {
                const next = {
                    X: advanceToward(
                        this.hoverRenderPos.X,
                        hoverCell.X,
                        MOTION_QUICK_MS,
                        dt,
                    ),
                    Y: advanceToward(
                        this.hoverRenderPos.Y,
                        hoverCell.Y,
                        MOTION_QUICK_MS,
                        dt,
                    ),
                };
                if (
                    settled(next.X, hoverCell.X, MOTION_EPSILON_TILES) &&
                    settled(next.Y, hoverCell.Y, MOTION_EPSILON_TILES)
                ) {
                    this.hoverRenderPos = { ...hoverCell };
                } else {
                    this.hoverRenderPos = next;
                    moving = dt > 0;
                }
            }
            if (this.hoverRenderScale < 1) {
                const nextScale = advanceToward(
                    this.hoverRenderScale,
                    1,
                    MOTION_QUICK_MS,
                    dt,
                );
                this.hoverRenderScale = settled(
                    nextScale,
                    1,
                    MOTION_EPSILON_SCALE,
                )
                    ? 1
                    : nextScale;
                if (this.hoverRenderScale !== 1) moving = dt > 0;
            }
        }
        const region = this.vim.getRegion();
        if (!region) {
            this.regionRender = null;
        } else if (!this.regionRender) {
            this.regionRender = {
                from: { ...region.from },
                to: { ...region.to },
            };
        } else {
            const from = {
                X: advanceToward(
                    this.regionRender.from.X,
                    region.from.X,
                    MOTION_MS,
                    dt,
                ),
                Y: advanceToward(
                    this.regionRender.from.Y,
                    region.from.Y,
                    MOTION_MS,
                    dt,
                ),
            };
            const to = {
                X: advanceToward(
                    this.regionRender.to.X,
                    region.to.X,
                    MOTION_MS,
                    dt,
                ),
                Y: advanceToward(
                    this.regionRender.to.Y,
                    region.to.Y,
                    MOTION_MS,
                    dt,
                ),
            };
            const done =
                settled(from.X, region.from.X, MOTION_EPSILON_TILES) &&
                settled(from.Y, region.from.Y, MOTION_EPSILON_TILES) &&
                settled(to.X, region.to.X, MOTION_EPSILON_TILES) &&
                settled(to.Y, region.to.Y, MOTION_EPSILON_TILES);
            this.regionRender = done
                ? { from: { ...region.from }, to: { ...region.to } }
                : { from, to };
            moving = moving || (!done && dt > 0);
        }
        return moving;
    }

    /** True while a synchronous (no-rAF) render is on the stack. */
    private rendering = false;

    private requestRender(): void {
        if (this.renderRequested) return;
        this.renderRequested = true;
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => {
                this.renderRequested = false;
                this.render();
            });
        } else if (!this.rendering) {
            // No rAF (unit tests, SSR): render once, synchronously. Never
            // nest: a moving loop would otherwise recurse thousands deep
            // on microsecond real-time deltas. Progress resumes on the
            // next explicit render with a fresh timestamp.
            this.renderRequested = false;
            this.rendering = true;
            try {
                this.render();
            } finally {
                this.rendering = false;
            }
        } else {
            this.renderRequested = false;
        }
    }

    /** True for cells inside the 40x40 map (hover can stray outside). */
    private isTileOnMap(pos: Point): boolean {
        return (
            pos.X >= 0 && pos.X < MAP_WIDTH && pos.Y >= 0 && pos.Y < MAP_HEIGHT
        );
    }

    /**
     * Where the cursor starts when the first vim key arrives. A mouse
     * hover outside the map yields out-of-bounds cells, so clamp each
     * axis exactly like keyboard motions do: the last valid position.
     */
    private vimBootPosition(): Point {
        if (this.hoveredTile) {
            return {
                X: Math.max(0, Math.min(MAP_WIDTH - 1, this.hoveredTile.X)),
                Y: Math.max(0, Math.min(MAP_HEIGHT - 1, this.hoveredTile.Y)),
            };
        }
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
        // Never clobber a transient feedback message while it is showing.
        if (performance.now() < this.feedbackUntil) return;
        const el = document.getElementById("statusVimMode");
        if (el) el.textContent = this.vim.statusModeText();
    }

    /**
     * Transient message in the mode slot (vim error style), reverting to the
     * live mode text after FEEDBACK_MS. Drives E492/E353 feedback.
     */
    public showVimFeedback(message: string): void {
        this.feedbackUntil = performance.now() + FEEDBACK_MS;
        const el = document.getElementById("statusVimMode");
        if (el) el.textContent = message;
        setTimeout(() => {
            this.feedbackUntil = 0;
            this.updateVimMode();
        }, FEEDBACK_MS);
    }

    /**
     * Run a `:` command. Map-side actions (draw) execute here; DOM actions
     * (export, import dialog, help, grid) go through handlers or directly.
     * Unknown/bad input surfaces as a transient E-message.
     */
    public handleVimCommand(input: string): void {
        const result = runCommand(input, {
            writeMap: (name) => this.onWriteMapRequest?.(name),
            openImport: () => this.onImportRequest?.(),
            toggleHelp: () => this.toggleHelp(),
            toggleGrid: () => this.toggleGrid(),
            drawLine: (x1, y1, x2, y2) => this.drawLine(x1, y1, x2, y2),
        });
        if (!result.ok && result.error) this.showVimFeedback(result.error);
    }

    /** `:line` — paint a Bresenham line on the active layer, one entry. */
    public drawLine(x1: number, y1: number, x2: number, y2: number): void {
        const cells = lineCells({ X: x1, Y: y1 }, { X: x2, Y: y2 });
        this.applySessionEdit(() => {
            let changed = false;
            for (const cell of cells) {
                if (this.writeCell(cell)) changed = true;
            }
            return changed;
        });
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
        // Same layer: nothing to do. Keyboard ([ / ]) and clicks can
        // arrive redundantly; skipping avoids a full picker rebuild (and
        // its selection reset) for no change.
        if (this.currentLayer === layer) return;
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
            // Wholesale content swap reads as a transition, not a glitch.
            fadeIn(this.canvas);
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
        // Wholesale content swap reads as a transition, not a glitch.
        fadeIn(this.canvas);
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

    /** Whether a visual-mode region is currently open (context help note). */
    public isVisualActive(): boolean {
        return this.vim.getMode() === "visual";
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

    /** Picker instance (used by the sidebar keyboard router in init.ts). */
    public getPicker(): MapPicker {
        return this.picker;
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
