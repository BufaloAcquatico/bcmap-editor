import { describe, it, expect, beforeEach, vi } from "vitest";
import { BCMapEditor, MAP_WIDTH } from "../../src/editor";

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
    appendChild: vi.fn(),
};
mockElements["objectCategories"] = {
    style: { display: "" },
    innerHTML: "",
    querySelectorAll: vi.fn(() => []),
    appendChild: vi.fn(),
};
mockElements["zoomLevel"] = { textContent: "" };
mockElements["statusPosition"] = { textContent: "" };
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

const createMouseEvent = (overrides: Partial<MouseEvent> = {}): MouseEvent =>
    ({
        clientX: 0,
        clientY: 0,
        button: 0,
        ctrlKey: false,
        metaKey: false,
        preventDefault: vi.fn(),
        ...overrides,
    }) as unknown as MouseEvent;

// Canvas 800x600 @dpr1, zoom 1: draw box 600px at (100,0), tileSize 15.
// clientX 107..121 => tile X 0; clientY 7..21 => tile Y 0/1.
const cellEvent = (x: number, y: number) =>
    createMouseEvent({ clientX: 107 + x * 15, clientY: 7 + y * 15 });

describe("Undo/redo stroke coalescing (Change 6)", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        editor = new BCMapEditor("testCanvas");
        editor.setSelectedTile({
            ID: 215,
            Type: "FloorExterior",
            Style: "LongGrass",
        });
    });

    function press(cellX: number, cellY: number): void {
        const e = editor as any;
        e.onCanvasMouseDown(cellEvent(cellX, cellY));
        e.onCanvasMouseUp();
    }

    function drag(cells: Array<[number, number]>): void {
        const e = editor as any;
        e.onCanvasMouseDown(cellEvent(cells[0][0], cells[0][1]));
        for (const [x, y] of cells.slice(1))
            e.onCanvasMouseMove(cellEvent(x, y));
        e.onCanvasMouseUp();
    }

    it("one click produces exactly one undo entry", () => {
        press(0, 0);
        expect(editor.getMapData().Tiles.charCodeAt(0)).toBe(215);
        expect((editor as any).history.undoStack.length).toBe(1);
    });

    it("a single undo reverts a single click", () => {
        press(0, 0);
        editor.undo();
        expect(editor.getMapData().Tiles.charCodeAt(0)).toBe(210);
        expect(editor.canUndo()).toBe(false);
        expect(editor.canRedo()).toBe(true);
    });

    it("a second undo with empty stack is a no-op", () => {
        press(0, 0);
        editor.undo();
        editor.undo();
        expect(editor.getMapData().Tiles.charCodeAt(0)).toBe(210);
    });

    it("a drag stroke shares one undo entry and one undo reverts all cells", () => {
        drag([
            [0, 0],
            [1, 0],
            [2, 0],
        ]);
        expect((editor as any).history.undoStack.length).toBe(1);
        expect(editor.getMapData().Tiles.charCodeAt(0)).toBe(215);
        expect(editor.getMapData().Tiles.charCodeAt(1)).toBe(215);
        expect(editor.getMapData().Tiles.charCodeAt(2)).toBe(215);
        editor.undo();
        expect(editor.getMapData().Tiles.charCodeAt(0)).toBe(210);
        expect(editor.getMapData().Tiles.charCodeAt(1)).toBe(210);
        expect(editor.getMapData().Tiles.charCodeAt(2)).toBe(210);
    });

    it("redo restores the undone stroke", () => {
        press(1, 0);
        editor.undo();
        expect(editor.getMapData().Tiles.charCodeAt(1)).toBe(210);
        editor.redo();
        expect(editor.getMapData().Tiles.charCodeAt(1)).toBe(215);
    });

    it("painting after undo clears the redo stack", () => {
        press(0, 0);
        editor.undo();
        expect(editor.canRedo()).toBe(true);
        press(1, 0);
        expect(editor.canRedo()).toBe(false);
    });

    it("pressing an unchanged cell pushes no undo entry", () => {
        press(0, 0);
        expect((editor as any).history.undoStack.length).toBe(1);
        press(0, 0); // same cell, same tile: no-op stroke
        expect((editor as any).history.undoStack.length).toBe(1);
    });

    it("undo mid-press on a no-op stroke keeps the redo entry", () => {
        press(0, 0); // real stroke, one undo entry
        const e = editor as any;
        // Second press hits the unchanged cell: entry pushed, nothing painted.
        e.onCanvasMouseDown(cellEvent(0, 0));
        expect(e.history.undoStack.length).toBe(2);
        editor.undo(); // pops the no-op stroke entry mid-press
        expect(e.history.undoStack.length).toBe(1);
        e.onCanvasMouseUp(); // must not wipe the redo entry just created
        expect(editor.canRedo()).toBe(true);
        editor.redo();
        expect(editor.getMapData().Tiles.charCodeAt(0)).toBe(215);
        expect(editor.canRedo()).toBe(false);
    });

    it("panning never touches the undo stack", () => {
        press(0, 0);
        const e = editor as any;
        e.onCanvasMouseDown(
            createMouseEvent({ button: 2, clientX: 400, clientY: 300 }),
        );
        e.onCanvasMouseMove(
            createMouseEvent({ button: 2, clientX: 450, clientY: 320 }),
        );
        e.onCanvasMouseUp();
        expect((editor as any).history.undoStack.length).toBe(1);
    });

    it("notifies history listeners on stroke/undo/redo", () => {
        const cb = vi.fn();
        editor.onHistoryChange = cb;
        press(0, 0);
        expect(cb).toHaveBeenCalled();
        const afterStroke = cb.mock.calls.length;
        editor.undo();
        editor.redo();
        expect(cb.mock.calls.length).toBeGreaterThan(afterStroke);
    });

    it("object strokes undo as one step", () => {
        editor.setCurrentLayer("object");
        (editor as any).selectedObject = (editor as any).fullObjectMap.get(
            2057,
        );
        const e = editor as any;
        e.onCanvasMouseDown(cellEvent(2, 2));
        e.onCanvasMouseMove(cellEvent(3, 2));
        e.onCanvasMouseUp();
        expect((editor as any).history.undoStack.length).toBe(1);
        expect(editor.getMapData().Objects.charCodeAt(2 + 2 * MAP_WIDTH)).toBe(
            2057,
        );
        editor.undo();
        expect(editor.getMapData().Objects.charCodeAt(2 + 2 * MAP_WIDTH)).toBe(
            100,
        );
        expect(editor.getMapData().Objects.charCodeAt(3 + 2 * MAP_WIDTH)).toBe(
            100,
        );
    });
});
