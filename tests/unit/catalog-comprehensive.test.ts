import { describe, it, expect } from "vitest";
import { BCMapEditor } from "../../src/editor";

// Minimal DOM mock for constructor
const mockCtx = {
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
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

describe("Catalog - Comprehensive", () => {
    const editor = new BCMapEditor("testCanvas");
    const tiles = editor.getTileCatalog();
    const objects = editor.getObjectCatalog();

    it("should have unique tile IDs", () => {
        const ids = new Set(tiles.map((t) => t.ID));
        expect(ids.size).toBe(tiles.length);
    });

    it("should have unique object IDs", () => {
        const ids = new Set(objects.map((o) => o.ID));
        expect(ids.size).toBe(objects.length);
    });

    it("should have valid tile types", () => {
        const validTypes = ["Floor", "FloorExterior", "Wall", "Water"];
        tiles.forEach((t) => {
            expect(validTypes).toContain(t.Type);
        });
    });

    it("should have all tiles with defined Style", () => {
        tiles.forEach((t) => {
            expect(t.Style).toBeDefined();
            expect(t.Style.length).toBeGreaterThan(0);
        });
    });

    it("should have all objects with defined Style and Type", () => {
        objects.forEach((o) => {
            expect(o.Style).toBeDefined();
            expect(o.Type).toBeDefined();
        });
    });

    it("should include Blank object with ID 100", () => {
        const blank = objects.find((o) => o.ID === 100);
        expect(blank).toBeDefined();
        expect(blank?.Style).toBe("Blank");
    });

    it("should have Grass tile with ID 210", () => {
        const grass = tiles.find((t) => t.ID === 210);
        expect(grass).toBeDefined();
        expect(grass?.Style).toBe("Grass");
    });

    it("should have tile catalog sorted/valid structure", () => {
        expect(Array.isArray(tiles)).toBe(true);
        expect(tiles.length).toBeGreaterThan(0);
    });

    it("should have object catalog sorted/valid structure", () => {
        expect(Array.isArray(objects)).toBe(true);
        expect(objects.length).toBeGreaterThan(0);
    });
});
