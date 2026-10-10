1. Bondage College (reference implementation)
   File: /home/alex/Projects/Unsorted/BC/Bondage-College/BondageClub/Screens/Online/ChatRoom/ChatRoomMapView.js
   1.1 Walls and "3D" Edge Effects
   Walls are tiles with Type === "Wall" (IDs 1000-1205). The game draws a base wall sprite per tile, then applies neighbor-based edge/connection graphics to make walls look continuous/3D.
   Key functions (lines ~1070–1260):

- ChatRoomMapViewIsWall(X,Y) (line 1112): returns true if out of bounds OR tile ID in [1000,2000). Out of bounds is treated as a wall for edge calculations.
- ChatRoomMapViewFindWallEffectTile(CW, CE, SW, SC, SE) (line 1070): takes 5 booleans for the 5 neighbors (center-left, center-right, bottom-left, bottom-center, bottom-right) and returns an effect index (0-21 or -1). This produces the "WallEffect" tile sprite (e.g. corners, T-junctions, straight, inner corners).
- ChatRoomMapViewWallEffect(X,Y,ScreenX,ScreenY,TileWidth,TileHeight) (line 1215): computes CW,CE,SW,SC,SE by checking if neighbor is wall OR ChatRoomMapViewTileIsHidden(...); calls FindWallEffectTile; draws "Screens/Online/ChatRoom/MapTile/WallEffect/<Effect>.png" over that tile's position.
- ChatRoomMapViewFloorWallEffect(X,Y) (line 1236): for non-wall tiles, if the tile below is a wall, it can return another wall effect index (0,11-13,50-53) to draw a bottom-edge effect. Style === "HalfWall" has special cases.
  Where applied in drawing (line ~1442-1443, 1520): after drawing the tile sprite, if TileData.Type === "Wall" call WallEffect(); else compute FloorWallEffect and draw it later (line 1520) so it appears on the floor layer.
  Implication: Walls are not just a single texture per cell — visual continuity depends on the 8/adjacency neighborhood.
  1.2 Multi-Tile / Offsets / Scaling for Objects
  Objects (map layer objects, IDs starting from 100 upward; blank is 100) can span more than one logical "tile unit" visually and can be positioned with pixel-like fractional offsets relative to the tile.
  Properties observed on object entries (ChatRoomMapViewObjectList, many entries around lines 150-600):
- Top (number, often negative): vertical offset in tile units (e.g. -0.5, -0.82, -1.1). Drawn as Top + (TileHeight * Obj.Top) relative to the tile's screen Y.
- Left (number): horizontal offset in tile units (e.g. 0.05, 0.15). Drawn as Left + (TileWidth * Obj.Left).
- Width (number): width multiplier in tile units (default 1). Drawn as TileWidth * Width.
- Height (number): height multiplier in tile units (default 1). Drawn as TileHeight * Height.
- Transparency, TransparencyCutoutHeight: for objects like water-related decorations or some effects, rendered with DrawImageEx and an alpha mask cutout (lines ~1510-1525 in draw pass).
  Drawing code (lines ~1460-1505): after finding the object for the cell:
  DrawImageResize(
  ObjectImage,
  Math.floor(Left + ScreenX + ((Obj.Left == null) ? 0 : TileWidth * Obj.Left)),
  Math.floor(Top + ScreenY + ((Obj.Top == null) ? 0 : TileHeight * Obj.Top)),
  Math.ceil(TileWidth * ((Obj.Width == null) ? 1 : Obj.Width)),
  Math.ceil(TileHeight * ((Obj.Height == null) ? 1 : Obj.Height))
  );
  So objects can draw larger than 1×1 tile and be shifted; they still live in a specific grid cell in the data array, but their visual bounds extend beyond that cell (common for furniture like beds, wardrobes, thrones, banners).
  1.3 Dynamic Image Selection (BuildImageName)
  Some objects compute their sprite name at render time based on neighbors/state (expanding/connected objects) or time-based animation.
  Examples from ChatRoomMapViewObjectList:
- Expanding objects (e.g. CouchPinkPreview ID 710, BedBluePreview 720, BallPitPreview 730, VikingTablePreview 740, RailroadPreview 750): BuildImageName(X,Y) looks at adjacent cells (ChatRoomMapViewGetObjectAtPos(X±1, Y)) to see if they share the same ID and returns Left/Middle/Right/Small variants. Railroad also uses ChatRoomMapViewGetConnectivityDirections to build a 4-direction suffix (NorthSouthEastWest).
- Animated objects (e.g. LogFireAnim0 611, CatCaramelHappy 810, DogBrownHappy 820): BuildImageName uses CurrentTime plus position seed to pick an animation frame name (e.g. LogFireAnimN, CatCaramelStretch/Happy/Play/Sleep/...).
- State-based: some use AssetName + check if character is wearing/occupying the object to pick OccupiedStyle or skip drawing.
  Drawing logic (lines ~1475-1490):
  let ImageName = Obj.Style;
  if ((Obj.AssetName != null) || (Obj.OccupiedStyle != null)) { ... maybe pick OccupiedStyle ... }
  else {
  if (Obj.BuildImageName != null)
  ImageName = Obj.BuildImageName(X, Y);
  }
  ObjectImage = "Screens/Online/ChatRoom/MapObject/" + Obj.Type + "/" + ImageName + ".png";
  1.4 Other rendering details
- Wall decorations may be hidden if the tile below is hidden (WallDecoration special case, line ~1480).
- Water tiles have transparency with cutout height drawn via DrawImageEx (lines ~1505-1525). Objects can also have per-object transparency.
- Floor wall effects drawn after character/object pass (line 1520) to layer correctly.
