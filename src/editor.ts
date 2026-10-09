// BCMap Editor - TypeScript Source

import { compressToBase64, decompressFromBase64 } from 'lz-string';

export interface Point {
  X: number;
  Y: number;
}

export interface MapRegion {
  TopLeft: Point;
  BottomRight: Point;
}

export interface MapData {
  Type: 'Always' | 'Hybrid' | 'Never';
  Tiles: string;      // 1600 chars, each char = tile ID charCode
  Objects: string;    // 1600 chars, each char = object ID charCode
  Effects?: string;
  Fog?: boolean;
}

export interface TileDef {
  ID: number;
  Type: 'Floor' | 'FloorExterior' | 'Wall' | 'Water';
  Style: string;
}

export interface ObjectDef {
  ID: number;
  Type: string;
  Style: string;
}

export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 40;
export const GRASS_TILE_ID = 210; // FloorExterior/Grass

export class BCMapEditor {
  private mapData: MapData;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private zoom = 1.0;
  private maxZoom = 10.0;
  private minZoom = 3.0 / 40.0; // min: 3x3 visible
  private currentLayer: 'tile' | 'object' = 'tile';
  private selectedTile: TileDef | null = null;
  private selectedObject: ObjectDef | null = null;
  private isDragging = false;
  private lastMousePos = { x: 0, y: 0 };
  private panX = 0;
  private panY = 0;
  private isPanning = false;
  private tileCatalog: TileDef[] = [];
  private objectCatalog: ObjectDef[] = [];
  private tileImageCache: Map<string, HTMLImageElement> = new Map();
  private objectImageCache: Map<string, HTMLImageElement> = new Map();
  private tileMap = new Map<number, TileDef>();
  private objectMap = new Map<number, ObjectDef>();

  constructor(canvasId: string) {
    const canvasElement = document.getElementById(canvasId);
    if (!canvasElement) throw new Error(`Canvas element #${canvasId} not found`);
    this.canvas = canvasElement as HTMLCanvasElement;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    this.ctx = ctx;
    this.mapData = this.createDefaultMap();
    this.initCatalogs();
    this.init();
    this.preloadImages();
  }

  private preloadImages(): void {
    this.tileCatalog.forEach(tile => {
      const key = tile.Type + '/' + tile.Style;
      if (!this.tileImageCache.has(key)) {
        const img = new Image();
        img.onerror = () => {
          // Keep cached to avoid retrying; image will show as empty and render falls back
        };
        img.src = 'assets/tiles/' + key + '.png';
        this.tileImageCache.set(key, img);
      }
    });
    this.objectCatalog.forEach(obj => {
      if (obj.Style === 'Blank') return;
      const key = obj.Type + '/' + obj.Style;
      if (!this.objectImageCache.has(key)) {
        const img = new Image();
        img.onerror = () => {};
        img.src = 'assets/objects/' + key + '.png';
        this.objectImageCache.set(key, img);
      }
    });
  }

  private createDefaultMap(): MapData {
    const grassChar = String.fromCharCode(GRASS_TILE_ID);
    const tiles = grassChar.repeat(MAP_WIDTH * MAP_HEIGHT);
    const objects = String.fromCharCode(100).repeat(MAP_WIDTH * MAP_HEIGHT);
    return {
      Type: 'Always',
      Tiles: tiles,
      Objects: objects
    };
  }


  private initCatalogs(): void {
    this.tileCatalog = [
      { ID: 100, Type: 'Floor', Style: 'OakWood' },
      { ID: 110, Type: 'Floor', Style: 'Stone' },
      { ID: 115, Type: 'Floor', Style: 'Pavement' },
      { ID: 120, Type: 'Floor', Style: 'Ceramic' },
      { ID: 121, Type: 'Floor', Style: 'CeramicDark' },
      { ID: 130, Type: 'Floor', Style: 'CarpetPink' },
      { ID: 131, Type: 'Floor', Style: 'CarpetBlue' },
      { ID: 132, Type: 'Floor', Style: 'CarpetRed' },
      { ID: 140, Type: 'Floor', Style: 'Padded' },
      { ID: 150, Type: 'Floor', Style: 'LatexFloor' },
      { ID: 160, Type: 'Floor', Style: 'Tile' },
      { ID: 170, Type: 'Floor', Style: 'HexBlue' },
      { ID: 171, Type: 'Floor', Style: 'HexPurple' },
      { ID: 172, Type: 'Floor', Style: 'Machine' },
      { ID: 199, Type: 'Floor', Style: 'HalfWall' },
      { ID: 200, Type: 'FloorExterior', Style: 'Dirt' },
      { ID: 210, Type: 'FloorExterior', Style: 'Grass' },
      { ID: 215, Type: 'FloorExterior', Style: 'LongGrass' },
      { ID: 220, Type: 'FloorExterior', Style: 'Sand' },
      { ID: 230, Type: 'FloorExterior', Style: 'Gravel' },
      { ID: 235, Type: 'FloorExterior', Style: 'Asphalt' },
      { ID: 240, Type: 'FloorExterior', Style: 'Snow' },
      { ID: 250, Type: 'FloorExterior', Style: 'StoneSquareGray' },
      { ID: 260, Type: 'FloorExterior', Style: 'ScatteredLeaves' },
      { ID: 270, Type: 'FloorExterior', Style: 'ScatteredLeavesDirt' },
      { ID: 280, Type: 'FloorExterior', Style: 'ScatteredLeavesThick' },
      { ID: 1000, Type: 'Wall', Style: 'MixedWood' },
      { ID: 1001, Type: 'Wall', Style: 'CedarWood' },
      { ID: 1010, Type: 'Wall', Style: 'Log' },
      { ID: 1020, Type: 'Wall', Style: 'Japanese' },
      { ID: 1030, Type: 'Wall', Style: 'Stone' },
      { ID: 1040, Type: 'Wall', Style: 'Brick' },
      { ID: 1050, Type: 'Wall', Style: 'Dungeon' },
      { ID: 1060, Type: 'Wall', Style: 'Square' },
      { ID: 1070, Type: 'Wall', Style: 'Steel' },
      { ID: 1080, Type: 'Wall', Style: 'Padded' },
      { ID: 1090, Type: 'Wall', Style: 'Tile' },
      { ID: 1100, Type: 'Wall', Style: 'Lattice' },
      { ID: 1200, Type: 'Wall', Style: 'HexBlue' },
      { ID: 1201, Type: 'Wall', Style: 'HexPurple' },
      { ID: 1202, Type: 'Wall', Style: 'PipeBlue' },
      { ID: 1203, Type: 'Wall', Style: 'PipePurple' },
      { ID: 1204, Type: 'Wall', Style: 'SteelBlack' },
      { ID: 1205, Type: 'Wall', Style: 'SteelGary' },
      { ID: 2000, Type: 'Water', Style: 'Pool' },
      { ID: 2010, Type: 'Water', Style: 'Sea' },
      { ID: 2020, Type: 'Water', Style: 'Ocean' },
      { ID: 2025, Type: 'Water', Style: 'OceanCyan' },
      { ID: 2030, Type: 'Water', Style: 'OceanCalm' },
      { ID: 2040, Type: 'Water', Style: 'Swamp' },
      { ID: 2050, Type: 'Water', Style: 'Waves' },
      { ID: 2060, Type: 'Water', Style: 'Shallow' },
      { ID: 2090, Type: 'Water', Style: 'Lava' }
    ];

    this.objectCatalog = [
      // Blank (erase)
      { ID: 10000, Type: 'Blank', Style: 'Blank' },
      // Floor Decorations - Animal
      { ID: 101, Type: 'FloorDecorationAnimal', Style: 'CatCaramelHappy' },
      { ID: 102, Type: 'FloorDecorationAnimal', Style: 'ChickenBrownIdleLeft' },
      { ID: 103, Type: 'FloorDecorationAnimal', Style: 'DogBrownHappy' },
      { ID: 104, Type: 'FloorDecorationAnimal', Style: 'RabbitBrownStand' },
      // Floor Decorations - Camping
      { ID: 105, Type: 'FloorDecorationCamping', Style: 'LogFire' },
      // Floor Decorations - Expanding
      { ID: 106, Type: 'FloorDecorationExpanding', Style: 'CouchPinkPreview' },
      // Floor Decorations - Party
      { ID: 107, Type: 'FloorDecorationParty', Style: 'BalloonFiveColor' },
      // Floor Decorations - Themed
      { ID: 108, Type: 'FloorDecorationThemed', Style: 'ShibariFrame' },
      // Floor Items
      { ID: 200, Type: 'FloorItem', Style: 'BondageBench' },
      { ID: 201, Type: 'FloorItem', Style: 'Coffin' },
      { ID: 202, Type: 'FloorItem', Style: 'FuturisticCrate' },
      { ID: 203, Type: 'FloorItem', Style: 'Kennel' },
      { ID: 204, Type: 'FloorItem', Style: 'MedicalBed' },
      { ID: 205, Type: 'FloorItem', Style: 'Pole' },
      { ID: 206, Type: 'FloorItem', Style: 'TheDisplayFrame' },
      { ID: 207, Type: 'FloorItem', Style: 'Trolley' },
      { ID: 208, Type: 'FloorItem', Style: 'WoodenBox' },
      { ID: 209, Type: 'FloorItem', Style: 'X-Cross' },
      // Floor Obstacles
      { ID: 300, Type: 'FloorObstacle', Style: 'Cactus' },
      { ID: 301, Type: 'FloorObstacle', Style: 'ChristmasTree' },
      { ID: 302, Type: 'FloorObstacle', Style: 'LampPost' },
      { ID: 303, Type: 'FloorObstacle', Style: 'LeaflessTree' },
      { ID: 304, Type: 'FloorObstacle', Style: 'OakTree' },
      { ID: 305, Type: 'FloorObstacle', Style: 'PalmTree' },
      { ID: 306, Type: 'FloorObstacle', Style: 'PineTree' },
      { ID: 307, Type: 'FloorObstacle', Style: 'RoadCone' },
      { ID: 308, Type: 'FloorObstacle', Style: 'Sakura' },
      { ID: 309, Type: 'FloorObstacle', Style: 'TrashCan' },
      { ID: 310, Type: 'FloorObstacle', Style: 'VelourRopeBarrier' },
      { ID: 311, Type: 'FloorObstacle', Style: 'Window' },
      { ID: 312, Type: 'FloorObstacle', Style: 'Pillar' },
      // Wall Decorations
      { ID: 400, Type: 'WallDecoration', Style: 'Candelabra0' },
      { ID: 401, Type: 'WallDecoration', Style: 'Painting' },
      { ID: 402, Type: 'WallDecoration', Style: 'Stocking' },
      { ID: 403, Type: 'WallDecoration', Style: 'Whip' },
      // Wall Paths
      { ID: 500, Type: 'WallPath', Style: 'BrownDoor' },
      { ID: 501, Type: 'WallPath', Style: 'BrownDoorOpen' },
      { ID: 502, Type: 'WallPath', Style: 'Metal' },
      { ID: 503, Type: 'WallPath', Style: 'MetalDown' },
      { ID: 504, Type: 'WallPath', Style: 'MetalLockedBronze' },
      { ID: 505, Type: 'WallPath', Style: 'MetalLockedGold' },
      { ID: 506, Type: 'WallPath', Style: 'MetalLockedSilver' },
      { ID: 507, Type: 'WallPath', Style: 'MetalUp' },
      { ID: 508, Type: 'WallPath', Style: 'WoodClosed' },
      { ID: 509, Type: 'WallPath', Style: 'WoodLocked' },
      { ID: 510, Type: 'WallPath', Style: 'WoodLockedBronze' },
      { ID: 511, Type: 'WallPath', Style: 'WoodLockedGold' },
      { ID: 512, Type: 'WallPath', Style: 'WoodLockedSilver' },
      { ID: 513, Type: 'WallPath', Style: 'WoodOpen' },
      // Banners
      { ID: 600, Type: 'Banners', Style: 'Blue' },
      { ID: 601, Type: 'Banners', Style: 'Green' },
      { ID: 602, Type: 'Banners', Style: 'PaladinBanner' },
      { ID: 603, Type: 'Banners', Style: 'Yellow' },
      // Floor Icons
      { ID: 700, Type: 'FloorIcon', Style: 'IconCircle' },
      // Floor Numbers
      { ID: 800, Type: 'FloorNumber', Style: 'Number1' },
      // Floor Letters
      { ID: 900, Type: 'FloorLetter', Style: 'LetterA' },
    ];
    
    // Build lookup maps for performance
    this.tileMap.clear();
    this.tileCatalog.forEach(t => this.tileMap.set(t.ID, t));
    this.objectMap.clear();
    this.objectCatalog.forEach(o => this.objectMap.set(o.ID, o));
  }

  private init(): void {
    this.resizeCanvas();
    this.render();
    this.canvas.addEventListener('click', this.onCanvasClick.bind(this));
    this.canvas.addEventListener('wheel', this.onCanvasWheel.bind(this));
    this.canvas.addEventListener('mousedown', this.onCanvasMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.onCanvasMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.onCanvasMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.onCanvasMouseUp.bind(this));
    window.addEventListener('resize', this.resizeCanvas.bind(this));
  }

  private resizeCanvas(): void {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
      this.render();
    }
  }

  private getTilePosFromMouse(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const tileWidth = (canvasWidth / MAP_WIDTH) * this.zoom;
    const tileHeight = (canvasHeight / MAP_HEIGHT) * this.zoom;
    const startX = (canvasWidth - MAP_WIDTH * tileWidth) / 2 + this.panX;
    const startY = (canvasHeight - MAP_HEIGHT * tileHeight) / 2 + this.panY;
    const tileX = Math.floor((mouseX - startX) / tileWidth);
    const tileY = Math.floor((mouseY - startY) / tileHeight);
    return { X: tileX, Y: tileY };
  }

  private onCanvasClick(e: MouseEvent): void {
    const pos = this.getTilePosFromMouse(e);
    if (pos.X < 0 || pos.X >= MAP_WIDTH || pos.Y < 0 || pos.Y >= MAP_HEIGHT) return;
    const index = pos.X + pos.Y * MAP_WIDTH;
    if (this.currentLayer === 'tile' && this.selectedTile) {
      this.mapData.Tiles = this.mapData.Tiles.substring(0, index) + String.fromCharCode(this.selectedTile.ID) + this.mapData.Tiles.substring(index + 1);
    } else if (this.currentLayer === 'object' && this.selectedObject) {
      this.mapData.Objects = this.mapData.Objects.substring(0, index) + String.fromCharCode(this.selectedObject.ID) + this.mapData.Objects.substring(index + 1);
    }
    this.render();
  }

  private onCanvasWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.deltaY < 0) {
      this.zoom = Math.min(this.maxZoom, this.zoom * 1.1);
    } else {
      this.zoom = Math.max(this.minZoom, this.zoom * 0.9);
    }
    const zoomLevelEl = document.getElementById('zoomLevel');
    if (zoomLevelEl) zoomLevelEl.textContent = Math.round(this.zoom * 100) + '%';
    this.render();
  }

  private onCanvasMouseDown(e: MouseEvent): void {
    this.isDragging = true;
    this.isPanning = e.button === 1 || e.button === 2 || (e.ctrlKey || e.metaKey);
    const rect = this.canvas.getBoundingClientRect();
    this.lastMousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (e.button === 2) e.preventDefault();
  }

  private onCanvasMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    const rect = this.canvas.getBoundingClientRect();
    const currentPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const dx = currentPos.x - this.lastMousePos.x;
    const dy = currentPos.y - this.lastMousePos.y;
    if (this.isPanning) {
      this.panX += dx;
      this.panY += dy;
      this.render();
    }
    this.lastMousePos = currentPos;
  }

  private onCanvasMouseUp(): void {
    this.isDragging = false;
    this.isPanning = false;
  }

  private getTileColor(type: string, style: string): string {
    if (type === 'FloorExterior' && style === 'Grass') return '#228B22';
    if (type === 'FloorExterior') return '#8B7355';
    if (type === 'Floor') return '#D2691E';
    if (type === 'Wall') return '#808080';
    if (type === 'Water') return '#4169E1';
    return '#654321';
  }

  private getObjectColor(type: string): string {
    if (type.includes('Decoration')) return '#DAA520';
    if (type === 'FloorItem') return '#9370DB';
    if (type === 'FloorObstacle') return '#8B0000';
    if (type === 'WallDecoration') return '#228B22';
    if (type === 'WallPath') return '#654321';
    if (type === 'Banners') return '#FF6347';
    return '#FF69B4';
  }

  private render(): void {
    const ctx = this.ctx;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    ctx.fillStyle = '#0f0f23';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    const tileWidth = (canvasWidth / MAP_WIDTH) * this.zoom;
    const tileHeight = (canvasHeight / MAP_HEIGHT) * this.zoom;
    const startX = (canvasWidth - MAP_WIDTH * tileWidth) / 2 + this.panX;
    const startY = (canvasHeight - MAP_HEIGHT * tileHeight) / 2 + this.panY;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const index = x + y * MAP_WIDTH;
        const tileId = this.mapData.Tiles.charCodeAt(index);
        const tile = this.tileMap.get(tileId);
        if (tile) {
          ctx.fillStyle = this.getTileColor(tile.Type, tile.Style);
          ctx.fillRect(startX + x * tileWidth, startY + y * tileHeight, tileWidth, tileHeight);
        }
      }
    }
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const index = x + y * MAP_WIDTH;
        const objId = this.mapData.Objects.charCodeAt(index);
        if (objId === 10000) continue;
        const obj = this.objectMap.get(objId);
        if (obj) {
          ctx.fillStyle = this.getObjectColor(obj.Type);
          ctx.fillRect(startX + x * tileWidth + tileWidth * 0.2, startY + y * tileHeight + tileHeight * 0.2, tileWidth * 0.6, tileHeight * 0.6);
        }
      }
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= MAP_WIDTH; i++) {
      ctx.beginPath();
      ctx.moveTo(startX + i * tileWidth, startY);
      ctx.lineTo(startX + i * tileWidth, startY + MAP_HEIGHT * tileHeight);
      ctx.stroke();
    }
    for (let j = 0; j <= MAP_HEIGHT; j++) {
      ctx.beginPath();
      ctx.moveTo(startX, startY + j * tileHeight);
      ctx.lineTo(startX + MAP_WIDTH * tileWidth, startY + j * tileHeight);
      ctx.stroke();
    }
  }

  public setCurrentLayer(layer: 'tile' | 'object'): void {
    this.currentLayer = layer;
  }
  public setSelectedTile(tile: TileDef | null): void { this.selectedTile = tile; }
  public setSelectedObject(obj: ObjectDef | null): void { this.selectedObject = obj; }
  public exportMap(name: string): string {
    const data = { Type: this.mapData.Type, Tiles: this.mapData.Tiles, Objects: this.mapData.Objects };
    return compressToBase64(JSON.stringify(data));
  }
  public importMap(code: string): void {
    try {
      const jsonStr = decompressFromBase64(code);
      if (!jsonStr) throw new Error('Invalid map code');
      const parsed = JSON.parse(jsonStr) as any;
      if (!parsed || typeof parsed !== 'object' || !parsed.Tiles || !parsed.Objects) {
        throw new Error('Invalid map format');
      }
      if (parsed.Tiles.length !== MAP_WIDTH * MAP_HEIGHT || parsed.Objects.length !== MAP_WIDTH * MAP_HEIGHT) {
        throw new Error('Invalid map dimensions');
      }
      this.mapData = parsed as MapData;
      this.panX = 0; this.panY = 0; this.zoom = 1.0;
      this.render();
    } catch (e) { throw new Error('Failed to import map: ' + e); }
  }
  public getMapData(): MapData { return this.mapData; }
  public newMap(): void { this.mapData = this.createDefaultMap(); this.panX = 0; this.panY = 0; this.zoom = 1.0; this.render(); }  public populatePickers(): void {
    const tileCategories = document.getElementById('tileCategories');
    const objectCategories = document.getElementById('objectCategories');
    if (!tileCategories || !objectCategories) return;
    const tileGroups = new Map<string, TileDef[]>();
    this.tileCatalog.forEach(t => {
      if (!tileGroups.has(t.Type)) tileGroups.set(t.Type, []);
      tileGroups.get(t.Type)!.push(t);
    });
    tileCategories.innerHTML = '';
    tileGroups.forEach((tiles, type) => {
      const header = document.createElement('div');
      header.className = 'category-header p-2 border-bottom border-secondary';
      header.textContent = type;
      const container = document.createElement('div');
      container.className = 'category-content p-2 d-flex flex-wrap';
      tiles.forEach(tile => {
        const item = document.createElement('div');
        item.className = 'sprite-item';
        const key = tile.Type + '/' + tile.Style;
        const img = new Image();
        img.src = 'assets/tiles/' + key + '.png';
        img.alt = tile.Style;
        item.title = tile.Style;
        item.appendChild(img);
        item.addEventListener('click', () => {
          document.querySelectorAll('#tileCategories .sprite-item').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          this.selectedTile = tile;
        });
        container.appendChild(item);
      });
      tileCategories.appendChild(header);
      tileCategories.appendChild(container);
    });
    
    const objGroups = new Map<string, ObjectDef[]>();
    this.objectCatalog.forEach(o => {
      let g = o.Type;
      if (o.Type.startsWith('FloorDecoration')) g = 'Floor Decorations';
      else if (o.Type === 'FloorItem' || o.Type === 'FloorNumber' || o.Type === 'FloorLetter' || o.Type === 'FloorIcon') g = 'Floor Items';
      else if (o.Type === 'FloorObstacle') g = 'Floor Obstacles';
      else if (o.Type === 'WallDecoration' || o.Type === 'WallPath') g = 'Wall';
      else if (o.Type === 'Banners') g = 'Banners';
      if (!objGroups.has(g)) objGroups.set(g, []);
      objGroups.get(g)!.push(o);
    });
    objectCategories.innerHTML = '';
    objGroups.forEach((objs, group) => {
      const header = document.createElement('div');
      header.className = 'category-header p-2 border-bottom border-secondary';
      header.textContent = group;
      const container = document.createElement('div');
      container.className = 'category-content p-2 d-flex flex-wrap';
      objs.forEach(obj => {
        const item = document.createElement('div');
        item.className = 'sprite-item';
        if (obj.Style !== 'Blank') {
          const key = obj.Type + '/' + obj.Style;
          const img = new Image();
          img.src = 'assets/objects/' + key + '.png';
          img.alt = obj.Style;
          item.title = obj.Style;
          item.appendChild(img);
        } else {
          item.innerHTML = '<div style="font-size:8px;color:#aaa;text-align:center;line-height:40px;">BLANK</div>';
          item.title = 'Blank (Erase)';
        }
        item.addEventListener('click', () => {
          document.querySelectorAll('#objectCategories .sprite-item').forEach(el => el.classList.remove('selected'));
          item.classList.add('selected');
          this.selectedObject = obj;
        });
        container.appendChild(item);
      });
      objectCategories.appendChild(header);
      objectCategories.appendChild(container);
    });
  }

  public getTileCatalog(): TileDef[] { return this.tileCatalog; }
  public getObjectCatalog(): ObjectDef[] { return this.objectCatalog; }
  public getCurrentLayer(): string { return this.currentLayer; }
}
