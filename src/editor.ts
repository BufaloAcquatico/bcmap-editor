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

const ZOOM_IN_FACTOR = 1.1;
const ZOOM_OUT_FACTOR = 0.9;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3.0;

const OBJECT_DRAW_MARGIN = 0.2;
const OBJECT_DRAW_SIZE = 0.6;
const GRID_OPACITY = 0.3;
const GRID_LINE_WIDTH = 0.5; // FloorExterior/Grass

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
    this.canvas.addEventListener("mouseup", this.onCanvasMouseUp.bind(this));
    this.canvas.addEventListener("mouseleave", this.onCanvasMouseUp.bind(this));
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
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.render();
    }
  }

  private getTilePosFromMouse(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    // Use CSS pixel coordinates (canvas style size) for mouse, since rect is in CSS pixels
    const cssWidth = this.canvas.clientWidth;
    const cssHeight = this.canvas.clientHeight;
    const { startX, startY, tileSize } = this.getDrawBox();
    // getDrawBox uses canvas.width/height (device pixels), need to convert
    const dpr = window.devicePixelRatio || 1;
    const cssStartX = startX / dpr;
    const cssStartY = startY / dpr;
    const cssTileSize = tileSize / dpr;
    const tileX = Math.floor((mouseX - cssStartX) / cssTileSize);
    const tileY = Math.floor((mouseY - cssStartY) / cssTileSize);
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
    const pos = this.getTilePosFromMouse(e);
    this.paintAt(pos);
  }

  private onCanvasWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.deltaY < 0) {
      this.zoom = Math.min(this.maxZoom, this.zoom * ZOOM_IN_FACTOR);
    } else {
      this.zoom = Math.max(this.minZoom, this.zoom * ZOOM_OUT_FACTOR);
    }
    const zoomLevelEl = document.getElementById("zoomLevel");
    if (zoomLevelEl)
      zoomLevelEl.textContent = Math.round(this.zoom * 100) + "%";
    this.render();
  }

  private onCanvasMouseDown(e: MouseEvent): void {
    this.isDragging = true;
    this.isPanning = e.button === 1 || e.button === 2 || e.ctrlKey || e.metaKey;
    this.isPainting = e.button === 0 && !e.ctrlKey && !e.metaKey && !this.isPanning;
    const rect = this.canvas.getBoundingClientRect();
    this.lastMousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (e.button === 2) e.preventDefault();
    if (this.isPainting) {
      const pos = this.getTilePosFromMouse(e);
      this.paintAt(pos);
    }
  }

  private onCanvasMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    const rect = this.canvas.getBoundingClientRect();
    const currentPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const dx = currentPos.x - this.lastMousePos.x;
    const dy = currentPos.y - this.lastMousePos.y;
    if (this.isPanning) {
      this.panX += dx * (window.devicePixelRatio || 1);
      this.panY += dy * (window.devicePixelRatio || 1);
      // Clamp pan to keep map reasonably visible within square drawing box
      const { size: drawSize } = this.getDrawBox();
      const canvas = this.canvas;
      const maxPan = canvas.width * 0.3;
      const minPan = -drawSize + canvas.width * 0.7;
      if (this.panX > maxPan) this.panX = maxPan;
      if (this.panY > maxPan) this.panY = maxPan;
      if (this.panX < minPan) this.panX = minPan;
      if (this.panY < minPan) this.panY = minPan;
      this.render();
    } else if (this.isPainting) {
      const pos = this.getTilePosFromMouse(e);
      this.paintAt(pos);
    }
    this.lastMousePos = currentPos;
  }

  private onCanvasMouseUp(): void {
    this.isDragging = false;
    this.isPanning = false;
    this.isPainting = false;
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

  private getDrawBox(): {
    size: number;
    startX: number;
    startY: number;
    tileSize: number;
  } {
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const drawSize = Math.min(canvasWidth, canvasHeight) * this.zoom;
    const tileSize = drawSize / MAP_WIDTH;
    const startX = (canvasWidth - drawSize) / 2 + this.panX;
    const startY = (canvasHeight - drawSize) / 2 + this.panY;
    return { size: drawSize, startX, startY, tileSize };
  }

  private render(): void {
    const ctx = this.ctx;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
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
            ctx.fillStyle = this.getTileColor(tile.Type, tile.Style);
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
      // Render grid
      ctx.strokeStyle = `rgba(255, 255, 255, ${GRID_OPACITY})`;
      ctx.lineWidth = GRID_LINE_WIDTH;
      for (let i = 0; i <= MAP_WIDTH; i++) {
        ctx.beginPath();
        ctx.moveTo(startX + i * tileSize, startY);
        ctx.lineTo(startX + i * tileSize, startY + MAP_HEIGHT * tileSize);
        ctx.stroke();
      }
      for (let j = 0; j <= MAP_HEIGHT; j++) {
        ctx.beginPath();
        ctx.moveTo(startX, startY + j * tileSize);
        ctx.lineTo(startX + MAP_WIDTH * tileSize, startY + j * tileSize);
        ctx.stroke();
      }
    }
  }
  public setCurrentLayer(layer: "tile" | "object"): void {
    this.currentLayer = layer;
    this.updatePickerVisibility();
  }
  public setSelectedTile(tile: TileDef | null): void {
    this.selectedTile = tile;
  }
  public setSelectedObject(obj: ObjectDef | null): void {
    this.selectedObject = obj;
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
      this.panX = 0;
      this.panY = 0;
      this.zoom = 1.0;
      this.render();
    } catch (e) {
      throw new Error("Failed to import map: " + e);
    }
  }
  public getMapData(): MapData {
    return this.mapData;
  }
  public newMap(): void {
    this.mapData = this.createDefaultMap();
    this.panX = 0;
    this.panY = 0;
    this.zoom = 1.0;
    this.render();
  }

  public populatePickers(): void {
    const tileCategories = document.getElementById("tileCategories");
    const objectCategories = document.getElementById("objectCategories");
    if (!tileCategories || !objectCategories) return;
    const tileGroups = new Map<string, TileDef[]>();
    this.tileCatalog.forEach((t) => {
      if (!tileGroups.has(t.Type)) tileGroups.set(t.Type, []);
      tileGroups.get(t.Type)!.push(t);
    });
    tileCategories.innerHTML = "";
    tileGroups.forEach((tiles, type) => {
      const header = document.createElement("div");
      header.className = "category-header p-2 border-bottom border-secondary";
      header.textContent = type;
      const container = document.createElement("div");
      container.className = "category-content p-2 d-flex flex-wrap";
      tiles.forEach((tile) => {
        const item = document.createElement("div");
        item.className = "sprite-item";
        const key = tile.Type + "/" + tile.Style;
        item.style.backgroundImage = "url(assets/tiles/" + key + ".png)";
        item.title = tile.Name ? tile.Name + " (" + tile.Style + ")" : tile.Style;
        item.addEventListener("click", () => {
          document
            .querySelectorAll("#tileCategories .sprite-item")
            .forEach((el) => el.classList.remove("selected"));
          item.classList.add("selected");
          this.selectedTile = tile;
        });
        container.appendChild(item);
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
      else if (o.Type === "WallDecoration" || o.Type === "WallPath") g = "Wall";
      else if (o.Type === "Banners") g = "Banners";
      if (!objGroups.has(g)) objGroups.set(g, []);
      objGroups.get(g)!.push(o);
    });
    objectCategories.innerHTML = "";
    objGroups.forEach((objs, group) => {
      const header = document.createElement("div");
      header.className = "category-header p-2 border-bottom border-secondary";
      header.textContent = group;
      const container = document.createElement("div");
      container.className = "category-content p-2 d-flex flex-wrap";
      objs.forEach((obj) => {
        const item = document.createElement("div");
        item.className = "sprite-item";
        if (obj.Style !== "Blank") {
          const key = obj.Type + "/" + obj.Style;
          item.style.backgroundImage = "url(assets/objects/" + key + ".png)";
          item.title = obj.Style;
        } else {
          item.innerHTML =
            '<div style="font-size:8px;color:#aaa;text-align:center;line-height:40px;">BLANK</div>';
          item.title = "Blank (Erase)";
        }
        item.addEventListener("click", () => {
          document
            .querySelectorAll("#objectCategories .sprite-item")
            .forEach((el) => el.classList.remove("selected"));
          item.classList.add("selected");
          this.selectedObject = obj;
        });
        container.appendChild(item);
      });
      objectCategories.appendChild(header);
      objectCategories.appendChild(container);
    });
    this.updatePickerVisibility();
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
