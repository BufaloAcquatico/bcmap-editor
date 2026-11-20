import { describe, it, expect } from "vitest";
import { compressToBase64 } from "lz-string";
import { BCMapEditor } from "../../src/editor";
import {
    FULL_OBJECT_CATALOG,
    FULL_TILE_CATALOG,
    isEmptyObject,
} from "../../src/catalog";

// Minimal DOM mock for constructor
const mockCtx = {
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    setTransform: () => {},
    drawImage: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
} as any;
const mockCanvas = {
    id: "testCanvas",
    width: 800,
    height: 600,
    getContext: () => mockCtx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener: () => {},
} as any;
global.document = {
    getElementById: (id: string) => (id === "testCanvas" ? mockCanvas : null),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({}),
} as any;
global.window = { addEventListener: () => {} } as any;
global.Image = function () {
    this.onerror = null;
    this.onload = null;
    this.src = "";
} as any;

describe("Catalog - Full mirror of official game data", () => {
    const editor = new BCMapEditor("testCanvas");
    const tiles = editor.getFullTileCatalog();
    const objects = editor.getFullObjectCatalog();
    const tileIds = new Set(tiles.map((t) => t.ID));
    const objectIds = new Set(objects.map((o) => o.ID));

    it("contains the slime, honey, and spiderweb game tiles", () => {
        // Slime/Honey floors 590-597
        expect(tileIds.has(590)).toBe(true);
        expect(tileIds.has(597)).toBe(true);
        // SpiderWeb wall 1227
        expect(tileIds.has(1227)).toBe(true);
        // Slime/Honey walls 1580-1587
        expect(tileIds.has(1580)).toBe(true);
        expect(tileIds.has(1587)).toBe(true);
    });

    it("contains the ABDL objects (1097-1099, 1399-1402)", () => {
        for (const id of [1097, 1098, 1099, 1399, 1400, 1401, 1402]) {
            expect(objectIds.has(id)).toBe(true);
        }
        const potty = objects.find((o) => o.ID === 1400);
        expect(potty?.Style).toBe("PinkPotty");
        // R134 retypes legacy blanks to EmptySpace but keeps raw IDs so old
        // map codes import byte-for-byte.
        const legacy = objects.find((o) => o.ID === 1399);
        expect(legacy?.Style).toBe("Passable");
        expect(legacy?.Type).toBe("EmptySpace");
        expect(legacy?.deprecatedId).toBe(100);
    });

    it("contains the previously missing game objects", () => {
        // School blank, Bedroom furniture
        for (const id of [211, 400, 401, 402, 403, 404]) {
            expect(objectIds.has(id)).toBe(true);
        }
        // Party deco
        for (const id of [595, 596]) {
            expect(objectIds.has(id)).toBe(true);
        }
        // Bathroom wall items
        for (const id of [3021, 3022, 3023, 3024, 3025, 3026, 3281]) {
            expect(objectIds.has(id)).toBe(true);
        }
        // School clock
        expect(objectIds.has(3201)).toBe(true);
        // Functional (blank, conveyor belts, signs)
        for (const id of [
            3499, 3500, 3501, 3502, 3503, 3510, 3513, 3520, 3523,
        ]) {
            expect(objectIds.has(id)).toBe(true);
        }
        // FloorFoamTiles play tiles
        for (const id of [4500, 4501, 4512]) {
            expect(objectIds.has(id)).toBe(true);
        }
    });

    it("has unique tile and object IDs in the full catalogs", () => {
        expect(tileIds.size).toBe(tiles.length);
        expect(objectIds.size).toBe(objects.length);
    });

    it("is the picker catalog: no second list can drift", () => {
        // The regression test for the 72 missing items: the picker reads
        // these same mirrors, so a game addition surfaces everywhere.
        const pickerTiles = editor.getTileCatalog();
        const pickerObjects = editor.getObjectCatalog();
        expect(new Set(pickerTiles.map((t) => t.ID))).toEqual(
            new Set(FULL_TILE_CATALOG.map((t) => t.ID)),
        );
        expect(new Set(pickerObjects.map((o) => o.ID))).toEqual(
            new Set(FULL_OBJECT_CATALOG.map((o) => o.ID)),
        );
    });

    it("pins the game catalog sizes so updates fail loudly", () => {
        // A game update changes these counts on purpose; the failure tells
        // the author to re-sync deliberately, not silently.
        expect(FULL_TILE_CATALOG.length).toBe(170);
        expect(FULL_OBJECT_CATALOG.length).toBe(373);
    });

    it("pins BC's type-default customization counts", () => {
        const colorable = FULL_OBJECT_CATALOG.filter((o) =>
            o.Layers?.some((l) => l.IsColorable),
        );
        const customizable = FULL_OBJECT_CATALOG.filter(
            (o) => o.CanBeCustomized !== false,
        );
        const transformable = customizable.filter(
            (o) => !o.JoinsNeighbors && !o.CanPlaceOnWalls,
        );
        expect(colorable).toHaveLength(168);
        expect(customizable).toHaveLength(306);
        expect(transformable).toHaveLength(237);
    });

    it("keys previously re-typed entries by their game type", () => {
        // Renderer, preloader, and downloader all key on Type/Style; these
        // entries used to carry rewritten types, forking the asset paths.
        const byId = new Map(editor.getObjectCatalog().map((o) => [o.ID, o]));
        expect(byId.get(110)?.Type).toBe("Functional");
        expect(byId.get(130)?.Type).toBe("LivingRoom");
        expect(byId.get(1050)?.Type).toBe("School");
        expect(byId.get(3020)?.Type).toBe("Bathroom");
    });

    it("marks exactly the entry flag as unique, like BC", () => {
        // BC's Assets/MapData.js carries Unique on object 110 only.
        const unique = (catalog: readonly { ID: number; unique?: boolean }[]) =>
            catalog.filter((o) => o.unique).map((o) => o.ID);
        expect(unique(FULL_OBJECT_CATALOG)).toEqual([110]);
    });

    it("carries BC's conveyor rotations, like the game", () => {
        // BC's Assets/MapData.js: 3500/3510 unrotated, the rest 180/270/90.
        const byId = new Map(FULL_OBJECT_CATALOG.map((o) => [o.ID, o]));
        const degrees = (id: number) => byId.get(id)?.Rotation ?? 0;
        expect([3500, 3510].map(degrees)).toEqual([0, 0]);
        expect([3501, 3511].map(degrees)).toEqual([180, 180]);
        expect([3502, 3512].map(degrees)).toEqual([270, 270]);
        expect([3503, 3513].map(degrees)).toEqual([90, 90]);
        // Rotation exists nowhere else in the game data.
        expect(
            FULL_OBJECT_CATALOG.filter((o) => o.Rotation !== undefined)
                .map((o) => o.ID)
                .sort((a, b) => a - b),
        ).toEqual([3501, 3502, 3503, 3511, 3512, 3513]);
    });

    it("knows every real-game object/tile ID", () => {
        expect(editor.isKnownObjectId(1399)).toBe(true);
        expect(editor.isKnownObjectId(1402)).toBe(true);
        expect(editor.isKnownTileId(1227)).toBe(true);
        expect(editor.isKnownTileId(1587)).toBe(true);
        expect(editor.isKnownObjectId(999999)).toBe(false);
        expect(editor.isKnownTileId(999999)).toBe(false);
    });

    it("contains the R134 kitchen pieces with their game geometry", () => {
        const byId = new Map(FULL_OBJECT_CATALOG.map((o) => [o.ID, o]));
        for (const id of [
            250, 330, 331, 332, 333, 334, 335, 343, 363, 364, 365,
        ]) {
            expect(byId.get(id)?.Type, `object ${id} should be Kitchen`).toBe(
                "Kitchen",
            );
        }
        // The furnace/stove/fridge geometry changed in R134.
        expect(byId.get(362)?.Top).toBe(-0.8);
        expect(byId.get(364)?.Height).toBe(1.22);
        expect(byId.get(365)?.Top).toBe(-0.8);
    });

    it("keeps all 21 DeprecatedID=100 aliases and 23 EmptySpace entries", () => {
        const deprecated = FULL_OBJECT_CATALOG.filter(
            (o) => o.deprecatedId === 100,
        );
        expect(deprecated.map((o) => o.ID)).toEqual([
            200, 211, 249, 342, 400, 500, 600, 700, 800, 1000, 1100, 1200, 1300,
            1399, 2000, 3000, 3281, 3499, 4000, 4500, 5000,
        ]);
        expect(deprecated.every(isEmptyObject)).toBe(true);
        expect(
            FULL_OBJECT_CATALOG.filter(isEmptyObject).map((o) => o.ID),
        ).toEqual([
            100, 101, 200, 211, 249, 342, 400, 500, 600, 700, 800, 1000, 1100,
            1200, 1300, 1399, 2000, 3000, 3281, 3499, 4000, 4500, 5000,
        ]);
    });

    it("round-trips R134-only object 2034 (FarmFenceSingle)", () => {
        const Tiles = String.fromCharCode(210).repeat(1600).split("");
        const Objects = Array(1600).fill(String.fromCharCode(100));
        Objects[7] = String.fromCharCode(2034);
        const code = compressToBase64(
            JSON.stringify({
                Type: "Always",
                Tiles: Tiles.join(""),
                Objects: Objects.join(""),
            }),
        );
        expect(FULL_OBJECT_CATALOG.some((o) => o.ID === 2034)).toBe(true);
        expect(() => editor.importMap(code)).not.toThrow();
        expect(editor.getMapData().Objects.charCodeAt(7)).toBe(2034);
        const reimported = new BCMapEditor("testCanvas");
        expect(() =>
            reimported.importMap(editor.exportMap("r134")),
        ).not.toThrow();
        expect(reimported.getMapData().Objects.charCodeAt(7)).toBe(2034);
    });

    it("imports a real map containing IDs outside the display catalog", () => {
        // 40x40 grid filled with grass (210), one SpiderWeb wall (1227) and
        // one legacy EmptySpace object (1399) - all absent from the display
        // pickers but present in the full game mirror.
        const Tiles = String.fromCharCode(210).repeat(1600).split("");
        Tiles[5] = String.fromCharCode(1227);
        const Objects = String.fromCharCode(100).repeat(1600).split("");
        Objects[5] = String.fromCharCode(1399);
        const code = compressToBase64(
            JSON.stringify({
                Type: "Always",
                Tiles: Tiles.join(""),
                Objects: Objects.join(""),
            }),
        );

        expect(() => editor.importMap(code)).not.toThrow();
        expect(editor.getMapData().Tiles.charCodeAt(5)).toBe(1227);
        expect(editor.getMapData().Objects.charCodeAt(5)).toBe(1399);
    });
});
