import { describe, it, expect } from "vitest";
import { compressToBase64 } from "lz-string";
import { BCMapEditor } from "../../src/editor";

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

    it("contains new game tiles missing from the display catalog", () => {
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
        const blank = objects.find((o) => o.ID === 1399);
        expect(blank?.Style).toBe("Blank");
        expect(blank?.Type).toBe("ABDL");
    });

    it("contains the other obscure objects missing from the display catalog", () => {
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

    it("is a superset of the display catalog", () => {
        const displayTiles = editor.getTileCatalog();
        const displayObjects = editor.getObjectCatalog();
        displayTiles.forEach((t) => expect(tileIds.has(t.ID)).toBe(true));
        displayObjects.forEach((o) => expect(objectIds.has(o.ID)).toBe(true));
    });

    it("knows every real-game object/tile ID", () => {
        expect(editor.isKnownObjectId(1399)).toBe(true);
        expect(editor.isKnownObjectId(1402)).toBe(true);
        expect(editor.isKnownTileId(1227)).toBe(true);
        expect(editor.isKnownTileId(1587)).toBe(true);
        expect(editor.isKnownObjectId(999999)).toBe(false);
        expect(editor.isKnownTileId(999999)).toBe(false);
    });

    it("imports a real map containing IDs outside the display catalog", () => {
        // 40x40 grid filled with grass (210), one SpiderWeb wall (1227) and
        // one ABDL Blank object (1399) - all absent from the display catalogs.
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
