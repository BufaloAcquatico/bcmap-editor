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
  private tileCatalog: TileDef[] = [];
  private objectCatalog: ObjectDef[] = [];

  constructor(canvasId: string) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get canvas context');
    this.ctx = ctx;
    this.mapData = this.createDefaultMap();
    this.initCatalogs();
    this.init();
  }

  private createDefaultMap(): MapData {
    // Initialize with 40x40 grass tiles (Grass ID 210 = char code 210)
    const grassChar = String.fromCharCode(GRASS_TILE_ID);
    const tiles = grassChar.repeat(MAP_WIDTH * MAP_HEIGHT);
    const objects = String.fromCharCode(100).repeat(MAP_WIDTH * MAP_HEIGHT); // Blank
    return {
      Type: 'Always',
      Tiles: tiles,
      Objects: objects
    };
  }

  private initCatalogs(): void {
    // Basic tiles from MAP_SYSTEM_DOCUMENTATION.md
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

    // Basic objects
    this.objectCatalog = [
      { ID: 100, Type: 'FloorDecoration', Style: 'Blank' },
      { ID: 110, Type: 'FloorDecoration', Style: 'EntryFlag' },
      { ID: 115, Type: 'FloorDecoration', Style: 'ExitFlag' },
      { ID: 160, Type: 'FloorDecoration', Style: 'KeyBronze' },
      { ID: 162, Type: 'FloorDecoration', Style: 'KeySilver' },
      { ID: 164, Type: 'FloorDecoration', Style: 'KeyGold' },
      { ID: 166, Type: 'FloorDecoration', Style: 'Bed' },
      { ID: 200, Type: 'FloorDecorationThemed', Style: 'Blank' },
      { ID: 300, Type: 'FloorDecorationThemed', Style: 'ShibariFrame' },
      { ID: 500, Type: 'FloorDecorationParty', Style: 'Blank' },
      { ID: 510, Type: 'FloorDecorationParty', Style: 'BalloonFiveColor' },
      { ID: 600, Type: 'FloorDecorationCamping', Style: 'Blank' },
      { ID: 610, Type: 'FloorDecorationCamping', Style: 'LogFire' },
      { ID: 700, Type: 'FloorDecorationExpanding', Style: 'Blank' },
      { ID: 710, Type: 'FloorDecorationExpanding', Style: 'CouchPinkPreview' },
      { ID: 800, Type: 'FloorDecorationAnimal', Style: 'Blank' },
      { ID: 810, Type: 'FloorDecorationAnimal', Style: 'CatCaramelHappy' },
      { ID: 820, Type: 'FloorDecorationAnimal', Style: 'DogBrownHappy' },
      { ID: 830, Type: 'FloorDecorationAnimal', Style: 'RabbitBrownStand' },
      { ID: 840, Type: 'FloorDecorationAnimal', Style: 'ChickenBrownIdleLeft' },
      { ID: 1000, Type: 'FloorItem', Style: 'Blank' },
      { ID: 1010, Type: 'FloorItem', Style: 'Kennel' },
      { ID: 1020, Type: 'FloorItem', Style: 'X-Cross' },
      { ID: 1030, Type: 'FloorItem', Style: 'BondageBench' },
      { ID: 1040, Type: 'FloorItem', Style: 'Trolley' },
      { ID: 1050, Type: 'FloorItem', Style: 'Locker' },
      { ID: 1060, Type: 'FloorItem', Style: 'WoodenBox' },
      { ID: 1070, Type: 'FloorItem', Style: 'Coffin' },
      { ID: 1080, Type: 'FloorItem', Style: 'TheDisplayFrame' },
      { ID: 1090, Type: 'FloorItem', Style: 'Pole' },
      { ID: 1095, Type: 'FloorItem', Style: 'MedicalBed' },
      { ID: 1096, Type: 'FloorItem', Style: 'FuturisticCrate' },
      { ID: 1100, Type: 'FloorNumber', Style: 'Blank' },
      { ID: 1101, Type: 'FloorNumber', Style: 'Number1' },
      { ID: 1200, Type: 'FloorLetter', Style: 'Blank' },
      { ID: 1201, Type: 'FloorLetter', Style: 'LetterA' },
      { ID: 1300, Type: 'FloorIcon', Style: 'Blank' },
      { ID: 1301, Type: 'FloorIcon', Style: 'IconCircle' },
      { ID: 2000, Type: 'FloorObstacle', Style: 'Blank' },
      { ID: 2093, Type: 'FloorObstacle', Style: 'VelourRopeBarrier' },
      { ID: 2095, Type: 'FloorObstacle', Style: 'OakTree' },
      { ID: 2097, Type: 'FloorObstacle', Style: 'LeaflessTree' },
      { ID: 2100, Type: 'FloorObstacle', Style: 'PineTree' },
      { ID: 2110, Type: 'FloorObstacle', Style: 'PalmTree' },
      { ID: 2120, Type: 'FloorObstacle', Style: 'Sakura' },
      { ID: 2130, Type: 'FloorObstacle', Style: 'Cactus' },
      { ID: 2140, Type: 'FloorObstacle', Style: 'ChristmasTree' },
      { ID: 2150, Type: 'FloorObstacle', Style: 'Window' },
      { ID: 2160, Type: 'FloorObstacle', Style: 'TrashCan' },
      { ID: 2170, Type: 'FloorObstacle', Style: 'RoadCone' },
      { ID: 2180, Type: 'FloorObstacle', Style: 'LampPost' },
      { ID: 2190, Type: 'FloorObstacle', Style: 'Pillar' },
      { ID: 3000, Type: 'WallDecoration', Style: 'Blank' },
      { ID: 3010, Type: 'WallDecoration', Style: 'Painting' },
      { ID: 3020, Type: 'WallDecoration', Style: 'Mirror' },
      { ID: 3030, Type: 'WallDecoration', Style: 'Candelabra0' },
      { ID: 3040, Type: 'WallDecoration', Style: 'Whip' },
      { ID: 3050, Type: 'WallDecoration', Style: 'Fireplace' },
      { ID: 3060, Type: 'WallDecoration', Style: 'Stocking' },
      { ID: 4000, Type: 'WallPath', Style: 'Blank' },
      { ID: 4010, Type: 'WallPath', Style: 'WoodOpen' },
      { ID: 4011, Type: 'WallPath', Style: 'WoodClosed' },
      { ID: 4012, Type: 'WallPath', Style: 'WoodLocked' },
      { ID: 4013, Type: 'WallPath', Style: 'WoodLockedBronze' },
      { ID: 4014, Type: 'WallPath', Style: 'WoodLockedSilver' },
      { ID: 4015, Type: 'WallPath', Style: 'WoodLockedGold' },
      { ID: 4020, Type: 'WallPath', Style: 'Metal' },
      { ID: 4021, Type: 'WallPath', Style: 'MetalUp' },
      { ID: 4022, Type: 'WallPath', Style: 'MetalDown' },
      { ID: 4023, Type: 'WallPath', Style: 'MetalLockedBronze' },
      { ID: 4024, Type: 'WallPath', Style: 'MetalLockedSilver' },
      { ID: 4025, Type: 'WallPath', Style: 'MetalLockedGold' },
      { ID: 4030, Type: 'WallPath', Style: 'BrownDoor' },
      { ID: 4031, Type: 'WallPath', Style: 'BrownDoorOpen' },
      { ID: 5010, Type: 'Banners', Style: 'Blank' },
      { ID: 5011, Type: 'Banners', Style: 'Blue' },
      { ID: 5012, Type: 'Banners', Style: 'Green' },
      { ID: 5013, Type: 'Banners', Style: 'Yellow' },
      { ID: 5014, Type: 'Banners', Style: 'PaladinBanner' }
    ];
  }

  private init(): void {
    this.resizeCanvas();
    this.render();
    // Add event listeners
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

  private onCanvasClick(e: MouseEvent): void {
    const pos = this.getTilePosFromMouse(e);
    if (pos.X < 0 || pos.X >= MAP_WIDTH || pos.Y < 0 || pos.Y >= MAP_HEIGHT) return;

    const index = pos.X + pos.Y * MAP_WIDTH;
    
    if (this.currentLayer === 'tile' && this.selectedTile) {
      this.mapData.Tiles = this.mapData.Tiles.substring(0, index) + 
        String.fromCharCode(this.selectedTile.ID) + 
        this.mapData.Tiles.substring(index + 1);
    } else if (this.currentLayer === 'object' && this.selectedObject) {
      this.mapData.Objects = this.mapData.Objects.substring(0, index) + 
        String.fromCharCode(this.selectedObject.ID) + 
        this.mapData.Objects.substring(index + 1);
    }
    this.render();
  }

  private getTilePosFromMouse(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    
    const tileWidth = canvasWidth / MAP_WIDTH * this.zoom;
    const tileHeight = canvasHeight / MAP_HEIGHT * this.zoom;
    const startX = (canvasWidth - MAP_WIDTH * tileWidth) / 2;
    const startY = (canvasHeight - MAP_HEIGHT * tileHeight) / 2;
    
    const tileX = Math.floor((mouseX - startX) / tileWidth);
    const tileY = Math.floor((mouseY - startY) / tileHeight);
    
    return { X: tileX, Y: tileY };
  }

  private onCanvasWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.deltaY < 0) {
      this.zoom = Math.min(this.maxZoom, this.zoom * 1.1);
    } else {
      this.zoom = Math.max(this.minZoom, this.zoom * 0.9);
    }
    const zoomLevelEl = document.getElementById('zoomLevel');
    if (zoomLevelEl) {
      zoomLevelEl.textContent = Math.round(this.zoom * 100) + '%';
    }
    this.render();
  }

  private onCanvasMouseDown(e: MouseEvent): void {
    this.isDragging = true;
    const rect = this.canvas.getBoundingClientRect();
    this.lastMousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onCanvasMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    // Drag logic would go here if needed
    const rect = this.canvas.getBoundingClientRect();
    const currentPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    this.lastMousePos = currentPos;
  }

  private onCanvasMouseUp(): void {
    this.isDragging = false;
  }

  private render(): void {
    const ctx = this.ctx;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    
    // Clear canvas
    ctx.fillStyle = '#0f0f23';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    const tileWidth = (canvasWidth / MAP_WIDTH) * this.zoom;
    const tileHeight = (canvasHeight / MAP_HEIGHT) * this.zoom;
    const startX = (canvasWidth - MAP_WIDTH * tileWidth) / 2;
    const startY = (canvasHeight - MAP_HEIGHT * tileHeight) / 2;
    
    // Render tiles
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const index = x + y * MAP_WIDTH;
        const tileId = this.mapData.Tiles.charCodeAt(index);
        const tile = this.tileCatalog.find(t => t.ID === tileId);
        if (tile) {
          // Simple colored boxes for tiles (placeholder - will use sprites later)
          ctx.fillStyle = this.getTileColor(tile.Type, tile.Style);
          ctx.fillRect(startX + x * tileWidth, startY + y * tileHeight, tileWidth, tileHeight);
        }
      }
    }
    
    // Render objects
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const index = x + y * MAP_WIDTH;
        const objId = this.mapData.Objects.charCodeAt(index);
        if (objId === 100) continue; // Blank
        const obj = this.objectCatalog.find(o => o.ID === objId);
        if (obj) {
          ctx.fillStyle = this.getObjectColor(obj.Type);
          ctx.fillRect(startX + x * tileWidth + tileWidth * 0.2, startY + y * tileHeight + tileHeight * 0.2, tileWidth * 0.6, tileHeight * 0.6);
        }
      }
    }
    
    // Draw grid
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

  public setCurrentLayer(layer: 'tile' | 'object'): void {
    this.currentLayer = layer;
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
      Objects: this.mapData.Objects
    };
    const jsonStr = JSON.stringify(data);
    return compressToBase64(jsonStr);
  }

  public importMap(code: string): void {
    try {
      const jsonStr = decompressFromBase64(code);
      if (!jsonStr) throw new Error('Invalid map code');
      const data = JSON.parse(jsonStr) as MapData;
      this.mapData = data;
      this.render();
    } catch (e) {
      throw new Error('Failed to import map: ' + e);
    }
  }

  public getMapData(): MapData {
    return this.mapData;
  }

  public newMap(): void {
    this.mapData = this.createDefaultMap();
    this.render();
  }

  public getTileCatalog(): TileDef[] {
    return this.tileCatalog;
  }

  public getObjectCatalog(): ObjectDef[] {
    return this.objectCatalog;
  }
}
export {};
