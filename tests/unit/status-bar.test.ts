import { describe, it, expect, beforeEach, vi } from "vitest";
import { BCMapEditor } from "../../src/editor";

// Mock DOM for testing (canvas 800x600, dpr 1)
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
    globalCompositeOperation: "source-over",
};
const mockCanvas = {
    id: "testCanvas",
    width: 800,
    height: 600,
    clientWidth: 800,
    clientHeight: 600,
    style: {},
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
mockElements["zoomLevel"] = { textContent: "" };
mockElements["statusPosition"] = { textContent: "" };
mockElements["statusSelection"] = { textContent: "" };

global.document = {
    getElementById: vi.fn((id) => mockElements[id] || null),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    createElement: vi.fn(() => ({
        className: "",
        textContent: "",
        style: {},
        title: "",
        innerHTML: "",
        addEventListener: vi.fn(),
        appendChild: vi.fn(),
        querySelectorAll: vi.fn(() => []),
    })),
} as any;
global.window = { addEventListener: vi.fn(), devicePixelRatio: 1 } as any;
global.Image = vi.fn(() => ({ onerror: null, onload: null, src: "" })) as any;

const moveTo = (clientX: number, clientY: number): MouseEvent =>
    ({ clientX, clientY }) as unknown as MouseEvent;

describe("Status bar", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        editor = new BCMapEditor("testCanvas");
    });

    it("shows Grass as the default tile selection", () => {
        expect(editor.getSelectedTile()?.ID).toBe(210);
        expect(mockElements["statusSelection"].textContent).toBe(
            "Selection: FloorExterior/Grass",
        );
    });

    it("shows Blank (Erase) when switching to the object layer", () => {
        editor.setCurrentLayer("object");
        expect(editor.getSelectedObject()?.ID).toBe(100);
        expect(mockElements["statusSelection"].textContent).toBe(
            "Selection: Blank (Erase)",
        );
        editor.setCurrentLayer("tile");
        expect(mockElements["statusSelection"].textContent).toBe(
            "Selection: FloorExterior/Grass",
        );
    });

    it("keeps a previously chosen object across layer switches", () => {
        const obj = editor.getObjectCatalog().find((o) => o.ID !== 100)!;
        editor.setSelectedObject(obj);
        editor.setCurrentLayer("tile");
        editor.setCurrentLayer("object");
        expect(editor.getSelectedObject()).toBe(obj);
        expect(mockElements["statusSelection"].textContent).toBe(
            `Selection: ${obj.Type}/${obj.Style}`,
        );
    });

    it("updates the selection text when a tile is picked", () => {
        const tile = editor.getTileCatalog()[0];
        editor.setSelectedTile(tile);
        expect(mockElements["statusSelection"].textContent).toBe(
            `Selection: ${tile.Type}/${tile.Style}`,
        );
    });

    it("resets the selection to defaults on newMap", () => {
        const obj = editor.getObjectCatalog().find((o) => o.ID !== 100)!;
        editor.setSelectedObject(obj);
        editor.newMap();
        expect(editor.getSelectedTile()?.ID).toBe(210);
        expect(editor.getSelectedObject()?.ID).toBe(100);
    });

    it("tracks the pointer position and clears on leave", () => {
        editor.onCanvasMouseMove(moveTo(107, 7));
        expect(mockElements["statusPosition"].textContent).toBe(
            "Position: (0, 0)",
        );

        editor.onCanvasMouseMove(moveTo(0, 0));
        expect(mockElements["statusPosition"].textContent).toBe(
            "Position: (-, -)",
        );

        editor.onCanvasMouseMove(moveTo(107, 7));
        editor.onCanvasMouseLeave();
        expect(mockElements["statusPosition"].textContent).toBe(
            "Position: (-, -)",
        );
    });
});
