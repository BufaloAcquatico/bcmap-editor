import { describe, it, expect, beforeEach, vi } from "vitest";
import { BCMapEditor } from "../../src/editor";
import { MAP_WIDTH, MAP_HEIGHT, GRASS_TILE_ID } from "../../src/mapdata";

// Mock DOM for testing
const mockCtx = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
};

const mockCanvas = {
    id: "testCanvas",
    width: 800,
    height: 600,
    getContext: vi.fn(() => mockCtx),
    getBoundingClientRect: vi.fn(() => ({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
    })),
    addEventListener: vi.fn(),
};

const mockElements: Record<string, any> = {};
mockElements["testCanvas"] = mockCanvas;
mockElements["tileCategories"] = {
    style: { display: "" },
    innerHTML: "",
    querySelectorAll: vi.fn(() => []),
};
mockElements["objectCategories"] = {
    style: { display: "" },
    innerHTML: "",
    querySelectorAll: vi.fn(() => []),
};
mockElements["zoomLevel"] = { textContent: "" };

global.document = {
    getElementById: vi.fn((id) => mockElements[id] || null),
    querySelector: vi.fn((sel) => null),
    querySelectorAll: vi.fn((sel) => []),
} as any;

global.window = { addEventListener: vi.fn() } as any;
global.Image = vi.fn(() => ({ onerror: null, onload: null, src: "" })) as any;

describe("BCMapEditor", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        editor = new BCMapEditor("testCanvas");
    });

    describe("Constructor", () => {
        it("should initialize with correct defaults", () => {
            expect(editor).toBeDefined();
            expect(editor.getCurrentLayer()).toBe("tile");
            const mapData = editor.getMapData();
            expect(mapData.Type).toBe("Always");
            expect(mapData.Tiles.length).toBe(MAP_WIDTH * MAP_HEIGHT);
            expect(mapData.Objects.length).toBe(MAP_WIDTH * MAP_HEIGHT);
        });

        it("should throw error if canvas not found", () => {
            (global.document.getElementById as any).mockReturnValueOnce(null);
            expect(() => new BCMapEditor("missing")).toThrow(
                "Canvas element #missing not found",
            );
        });

        it("should create default map with grass tiles", () => {
            const mapData = editor.getMapData();
            const firstTile = mapData.Tiles.charCodeAt(0);
            expect(firstTile).toBe(GRASS_TILE_ID);
        });

        it("should create default map with blank objects (ID 100)", () => {
            const mapData = editor.getMapData();
            const firstObj = mapData.Objects.charCodeAt(0);
            expect(firstObj).toBe(100);
        });
    });

    describe("Map dimensions", () => {
        it("should have correct constants", () => {
            expect(MAP_WIDTH).toBe(40);
            expect(MAP_HEIGHT).toBe(40);
            expect(GRASS_TILE_ID).toBe(210);
        });

        it("should create map with 1600 tiles", () => {
            expect(editor.getMapData().Tiles.length).toBe(1600);
        });

        it("should create map with 1600 objects", () => {
            expect(editor.getMapData().Objects.length).toBe(1600);
        });
    });

    describe("Layer management", () => {
        it("should set current layer to tile", () => {
            editor.setCurrentLayer("tile");
            expect(editor.getCurrentLayer()).toBe("tile");
        });

        it("should set current layer to object", () => {
            editor.setCurrentLayer("object");
            expect(editor.getCurrentLayer()).toBe("object");
        });

        it("should toggle between layers", () => {
            editor.setCurrentLayer("tile");
            expect(editor.getCurrentLayer()).toBe("tile");
            editor.setCurrentLayer("object");
            expect(editor.getCurrentLayer()).toBe("object");
            editor.setCurrentLayer("tile");
            expect(editor.getCurrentLayer()).toBe("tile");
        });
    });

    describe("Selection", () => {
        it("should set selected tile", () => {
            const tile = {
                ID: 210,
                Type: "FloorExterior" as const,
                Style: "Grass",
            };
            editor.setSelectedTile(tile);
            expect(() => editor.setSelectedTile(tile)).not.toThrow();
        });

        it("should set selected tile to null", () => {
            editor.setSelectedTile(null);
            expect(() => editor.setSelectedTile(null)).not.toThrow();
        });

        it("should set selected object", () => {
            const obj = { ID: 100, Type: "FloorDecoration", Style: "Blank" };
            editor.setSelectedObject(obj);
            expect(() => editor.setSelectedObject(obj)).not.toThrow();
        });

        it("should set selected object to null", () => {
            editor.setSelectedObject(null);
            expect(() => editor.setSelectedObject(null)).not.toThrow();
        });
    });

    describe("Import/Export", () => {
        it("should export map as base64 string", () => {
            const code = editor.exportMap("test");
            expect(typeof code).toBe("string");
            expect(code.length).toBeGreaterThan(0);
        });

        it("should export map with name parameter", () => {
            const code = editor.exportMap("my-custom-map");
            expect(typeof code).toBe("string");
        });

        it("should import valid map code", () => {
            const exported = editor.exportMap("test");
            const newEditor = new BCMapEditor("testCanvas");
            expect(() => newEditor.importMap(exported)).not.toThrow();
        });

        it("should preserve map data after import", () => {
            const exported = editor.exportMap("test");
            const newEditor = new BCMapEditor("testCanvas");
            newEditor.importMap(exported);
            expect(newEditor.getMapData().Tiles).toBe(
                editor.getMapData().Tiles,
            );
            expect(newEditor.getMapData().Objects).toBe(
                editor.getMapData().Objects,
            );
        });

        it("should throw on invalid map code", () => {
            expect(() => editor.importMap("invalid code")).toThrow();
        });

        it("should throw on empty import", () => {
            expect(() => editor.importMap("")).toThrow();
        });
    });

    describe("New Map", () => {
        it("should reset to default map", () => {
            editor.newMap();
            const mapData = editor.getMapData();
            expect(mapData.Type).toBe("Always");
            expect(mapData.Tiles.length).toBe(1600);
            expect(mapData.Tiles.charCodeAt(0)).toBe(GRASS_TILE_ID);
            expect(mapData.Objects.charCodeAt(0)).toBe(100);
        });
    });

    describe("Catalog access", () => {
        it("should return tile catalog", () => {
            const catalog = editor.getTileCatalog();
            expect(Array.isArray(catalog)).toBe(true);
            expect(catalog.length).toBeGreaterThan(0);
        });

        it("should return object catalog", () => {
            const catalog = editor.getObjectCatalog();
            expect(Array.isArray(catalog)).toBe(true);
            expect(catalog.length).toBeGreaterThan(0);
        });

        it("should have blank object in catalog with ID 100", () => {
            const catalog = editor.getObjectCatalog();
            const blank = catalog.find((c) => c.Style === "Blank");
            expect(blank).toBeDefined();
            expect(blank?.ID).toBe(100);
        });
    });

    describe("Render and update methods", () => {
        it("should call render without errors", () => {
            expect(() => editor.render()).not.toThrow();
        });

        it("should update picker visibility", () => {
            expect(() => editor.updatePickerVisibility()).not.toThrow();
        });
    });
});
