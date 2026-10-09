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

describe("Grid toggle", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        editor = new BCMapEditor("testCanvas");
    });

    it("draws the grid by default", () => {
        expect(editor.getGridVisible()).toBe(true);
        mockCtx.stroke.mockClear();
        editor.render();
        // 41 vertical + 41 horizontal grid lines (no hover outline here)
        expect(mockCtx.stroke).toHaveBeenCalledTimes(82);
    });

    it("skips the grid when disabled", () => {
        editor.setGridVisible(false);
        mockCtx.stroke.mockClear();
        editor.render();
        expect(mockCtx.stroke).not.toHaveBeenCalled();
    });

    it("still draws the hover outline with the grid off", () => {
        editor.setGridVisible(false);
        (editor as any).hoveredTile = { X: 0, Y: 0 };
        mockCtx.strokeRect.mockClear();
        editor.render();
        expect(mockCtx.strokeRect).toHaveBeenCalled();
    });

    it("toggles the grid visibility", () => {
        editor.toggleGrid();
        expect(editor.getGridVisible()).toBe(false);
        editor.toggleGrid();
        expect(editor.getGridVisible()).toBe(true);
    });
});
