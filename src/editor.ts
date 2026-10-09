// BCMap Editor - TypeScript Source

import { compressToBase64, decompressFromBase64 } from "lz-string";

import {
    BLANK_OBJECT_ID,
    OBJECT_CATALOG,
    TILE_CATALOG,
    type ObjectDef,
    type TileDef,
} from "./catalog";

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

export interface MapData {
    Type: "Always" | "Hybrid" | "Never";
    Tiles: string; // 1600 chars, each char = tile ID charCode
    Objects: string; // 1600 chars, each char = object ID charCode
    Effects?: string;
    Fog?: boolean;
}

export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 40;
export const GRASS_TILE_ID = 210;

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
const PAN_OVERSCROLL_TILES = 2;

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
    private tileMap = new Map<number, TileDef>();
    private objectMap = new Map<number, ObjectDef>();
    private searchTerm = "";
    private tileCategoryEls: CategoryEntry[] = [];
    private objectCategoryEls: CategoryEntry[] = [];
    private tilePickerItemById = new Map<number, HTMLElement>();
    private objectPickerItemById = new Map<number, HTMLElement>();
    private showGrid = true;
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
        this.mapData = this.createDefaultMap();
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
    }

    private createDefaultMap(): MapData {
        const grassChar = String.fromCharCode(GRASS_TILE_ID);
        const tiles = grassChar.repeat(MAP_WIDTH * MAP_HEIGHT);
        const objects = String.fromCharCode(BLANK_OBJECT_ID).repeat(
            MAP_WIDTH * MAP_HEIGHT,
        );
        return {
            Type: "Always",
            Tiles: tiles,
            Objects: objects,
        };
    }

    private initCatalogs(): void {
        // The catalog lives in ./catalog.ts and mirrors the game data exactly.
        // Entries are preserved verbatim - styles are intentionally NOT de-duplicated.
        this.tileCatalog = [...TILE_CATALOG];
        this.objectCatalog = [...OBJECT_CATALOG];

        // Build lookup maps for performance
        this.tileMap.clear();
        this.tileCatalog.forEach((t) => this.tileMap.set(t.ID, t));
        this.objectMap.clear();
        this.objectCatalog.forEach((o) => this.objectMap.set(o.ID, o));
    }

    private init(): void {
        this.resizeCanvas();
        this.render();
        this.canvas.addEventListener("click", this.onCanvasClick.bind(this));
        this.canvas.addEventListener("wheel", this.onCanvasWheel.bind(this));
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

    private paintAt(pos: Point): void {
        if (pos.X < 0 || pos.X >= MAP_WIDTH || pos.Y < 0 || pos.Y >= MAP_HEIGHT)
            return;
        const index = pos.X + pos.Y * MAP_WIDTH;
        if (this.currentLayer === "tile" && this.selectedTile) {
            this.mapData.Tiles =
                this.mapData.Tiles.substring(0, index) +
                String.fromCharCode(this.selectedTile.ID) +
                this.mapData.Tiles.substring(index + 1);
        } else if (this.currentLayer === "object" && this.selectedObject) {
            this.mapData.Objects =
                this.mapData.Objects.substring(0, index) +
                String.fromCharCode(this.selectedObject.ID) +
                this.mapData.Objects.substring(index + 1);
        }
        this.render();
    }

    private onCanvasClick(e: MouseEvent): void {
        // Ctrl/Cmd + click is reserved for panning; never paint in that case.
        if (e.ctrlKey || e.metaKey) return;
        const pos = this.getTilePosFromMouse(e);
        this.paintAt(pos);
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
        // Panning is done by holding Ctrl (or Cmd) and dragging with the left button.
        this.isPanning = isLeftButton && (e.ctrlKey || e.metaKey);
        this.isPainting = isLeftButton && !this.isPanning;
        this.isDragging = this.isPainting || this.isPanning;
        const rect = this.canvas.getBoundingClientRect();
        this.lastMousePos = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
        if (e.button === 2) e.preventDefault();
        if (this.isPainting) {
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
                this.render();
            } else if (this.isPainting) {
                this.paintAt(pos);
            }
        } else if (hoverChanged) {
            this.render();
        }
        this.lastMousePos = currentPos;
    }

    private onCanvasMouseUp(): void {
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

        // Render tiles using cached sprites
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const index = x + y * MAP_WIDTH;
                const tileId = this.mapData.Tiles.charCodeAt(index);
                const tile = this.tileMap.get(tileId);
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
                }
            }
        }

        // Render objects using cached sprites
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const index = x + y * MAP_WIDTH;
                const objId = this.mapData.Objects.charCodeAt(index);
                if (objId === BLANK_OBJECT_ID) continue;
                const obj = this.objectMap.get(objId);
                if (obj && obj.Style !== "Blank") {
                    const key = obj.Type + "/" + obj.Style;
                    const img = this.objectImageCache.get(key);
                    const drawX = startX + x * tileSize;
                    const drawY = startY + y * tileSize;
                    if (img && img.complete && img.naturalWidth > 0) {
                        ctx.drawImage(img, drawX, drawY, tileSize, tileSize);
                    } else {
                        // Fallback to color if image not loaded
                        ctx.fillStyle = this.getObjectColor(obj.Type);
                        ctx.fillRect(
                            drawX + tileSize * OBJECT_DRAW_MARGIN,
                            drawY + tileSize * OBJECT_DRAW_MARGIN,
                            tileSize * OBJECT_DRAW_SIZE,
                            tileSize * OBJECT_DRAW_SIZE,
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
            el.textContent = "Position: (—, —)";
        }
    }

    private updateStatusSelection(): void {
        const el = document.getElementById("statusSelection");
        if (!el) return;
        if (this.currentLayer === "object" && this.selectedObject) {
            el.textContent =
                this.selectedObject.Style === "Blank"
                    ? "Selection: Blank (Erase)"
                    : `Selection: ${this.selectedObject.Type}/${this.selectedObject.Style}`;
        } else if (this.currentLayer === "tile" && this.selectedTile) {
            el.textContent = `Selection: ${this.selectedTile.Type}/${this.selectedTile.Style}`;
        } else {
            el.textContent = "No selection";
        }
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
        const data = {
            Type: this.mapData.Type,
            Tiles: this.mapData.Tiles,
            Objects: this.mapData.Objects,
        };
        return compressToBase64(JSON.stringify(data));
    }
    public importMap(code: string): void {
        try {
            const jsonStr = decompressFromBase64(code);
            if (!jsonStr) throw new Error("Invalid map code");
            const parsed = JSON.parse(jsonStr) as any;
            if (
                !parsed ||
                typeof parsed !== "object" ||
                !parsed.Tiles ||
                !parsed.Objects
            ) {
                throw new Error("Invalid map format");
            }
            if (
                parsed.Tiles.length !== MAP_WIDTH * MAP_HEIGHT ||
                parsed.Objects.length !== MAP_WIDTH * MAP_HEIGHT
            ) {
                throw new Error("Invalid map dimensions");
            }
            // Validate tile IDs exist in catalog
            for (let i = 0; i < parsed.Tiles.length; i++) {
                const char = parsed.Tiles[i];
                const id = typeof char === "number" ? char : char.charCodeAt(0);
                if (this.tileMap.get(id) === undefined) {
                    throw new Error("Invalid tile ID at index " + i);
                }
            }
            // Validate object IDs exist in catalog
            for (let i = 0; i < parsed.Objects.length; i++) {
                const char = parsed.Objects[i];
                const id = typeof char === "number" ? char : char.charCodeAt(0);
                if (this.objectMap.get(id) === undefined) {
                    throw new Error("Invalid object ID at index " + i);
                }
            }
            this.mapData = parsed as MapData;
            this.resetView();
        } catch (e) {
            throw new Error("Failed to import map: " + e);
        }
    }
    public getMapData(): MapData {
        return this.mapData;
    }
    public newMap(): void {
        this.mapData = this.createDefaultMap();
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
        tileCategories.innerHTML = "";
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
        objectCategories.innerHTML = "";
        objGroups.forEach((objs, group) => {
            const { header, entry } = this.createCategoryHeader(group);
            this.objectCategoryEls.push(entry);
            const container = entry.content;
            objs.forEach((obj) => {
                const item = document.createElement("div");
                item.className = "sprite-item";
                if (obj.Style !== "Blank") {
                    const key = obj.Type + "/" + obj.Style;
                    item.style.backgroundImage =
                        "url(assets/objects/" + key + ".png)";
                    item.title = obj.Style;
                } else {
                    item.innerHTML =
                        '<div style="font-size:8px;color:#aaa;text-align:center;line-height:40px;">BLANK</div>';
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
    public getCurrentLayer(): string {
        return this.currentLayer;
    }
}
