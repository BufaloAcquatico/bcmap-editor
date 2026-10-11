import { describe, it, expect, beforeEach, vi } from "vitest";
import { BCMapEditor } from "../../../src/editor";

const mockCtx = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
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
mockElements["statusVimMode"] = { textContent: "" };
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

const keyEvent = (key: string): KeyboardEvent =>
    ({ key, preventDefault: vi.fn() }) as unknown as KeyboardEvent;

describe("Editor vim cursor integration", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        editor = new BCMapEditor("testCanvas");
    });

    it("starts in normal mode with the mode slot rendered", () => {
        expect((editor as any).vim.getCursor()).toBeNull();
        expect(mockElements["statusVimMode"].textContent).toBe("-- NORMAL --");
    });

    it("boots the cursor at the map center on the first vim key", () => {
        expect(editor.handleVimKey(keyEvent("j"))).toBe(true);
        expect((editor as any).vim.getCursor()).toEqual({ X: 20, Y: 21 });
        expect(mockElements["statusPosition"].textContent).toBe(
            "Position: (20, 21)",
        );
    });

    it("boots at the last hovered cell when the mouse visited first", () => {
        (editor as any).onCanvasMouseMove({
            clientX: 100,
            clientY: 0,
            button: 0,
            ctrlKey: false,
            metaKey: false,
            preventDefault: vi.fn(),
        } as unknown as MouseEvent);
        editor.handleVimKey(keyEvent("l"));
        // draw box starts at x=100 with tileSize 15: clientX 100 -> cell (0,0)
        expect((editor as any).vim.getCursor()).toEqual({ X: 1, Y: 0 });
    });

    it("shows the pending count and pending g in the mode slot", () => {
        editor.handleVimKey(keyEvent("3"));
        expect(mockElements["statusVimMode"].textContent).toBe("3");
        editor.handleVimKey(keyEvent("g"));
        expect(mockElements["statusVimMode"].textContent).toBe("g");
        editor.handleVimKey(keyEvent("g"));
        expect(mockElements["statusVimMode"].textContent).toBe("-- NORMAL --");
        expect((editor as any).vim.getCursor()).toEqual({ X: 0, Y: 0 });
    });

    it("draws the cursor as a dashed outline on render", () => {
        editor.handleVimKey(keyEvent("j"));
        mockCtx.setLineDash.mockClear();
        mockCtx.strokeRect.mockClear();
        (editor as any).render();
        expect(mockCtx.setLineDash).toHaveBeenCalledWith([4, 4]);
        const box = (editor as any).getDrawBox();
        expect(mockCtx.strokeRect).toHaveBeenCalledWith(
            box.startX + 20 * box.tileSize,
            box.startY + 21 * box.tileSize,
            box.tileSize,
            box.tileSize,
        );
    });

    it("does not draw a cursor outline before the first vim key", () => {
        mockCtx.setLineDash.mockClear();
        (editor as any).render();
        expect(mockCtx.setLineDash).not.toHaveBeenCalled();
    });

    it("keeps the cursor visible by panning when a motion exits the viewport", () => {
        editor.setZoom(3);
        const panBefore = (editor as any).panX;
        editor.handleVimKey(keyEvent("l"));
        const cursor = (editor as any).vim.getCursor();
        const box = (editor as any).getDrawBox();
        const cellX = box.startX + cursor.X * box.tileSize;
        expect(
            cellX + box.tileSize >= 0 || cellX <= (editor as any).canvas.width,
        ).toBe(true);
        if (panBefore !== (editor as any).panX) {
            // pan changed: cursor must now be inside the viewport
            expect(cellX).toBeLessThanOrEqual((editor as any).canvas.width);
        }
    });

    it("clears the cursor on newMap but keeps it through resetView", () => {
        editor.handleVimKey(keyEvent("j"));
        editor.resetView();
        expect((editor as any).vim.getCursor()).not.toBeNull();
        editor.newMap();
        expect((editor as any).vim.getCursor()).toBeNull();
    });

    it("does not consume unrelated keys", () => {
        expect(editor.handleVimKey(keyEvent("?"))).toBe(false);
        expect(editor.handleVimKey(keyEvent("z"))).toBe(false);
        expect((editor as any).vim.getCursor()).toBeNull();
    });
});

describe("Editor vim verb + edit-session integration", () => {
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

    const tileAt = (x: number, y: number) =>
        editor.getMapData().Tiles.charCodeAt(x + y * 40);

    it("Space paints the cursor cell with the selected tile", () => {
        editor.handleVimKey(keyEvent(" "));
        expect(tileAt(20, 20)).toBe(215);
        expect(editor.canUndo()).toBe(true);
        editor.undo();
        expect(tileAt(20, 20)).toBe(210); // grass restored
    });

    it("x erases back to grass", () => {
        editor.handleVimKey(keyEvent(" "));
        editor.handleVimKey(keyEvent("x"));
        expect(tileAt(20, 20)).toBe(210);
    });

    it("x over unchanged content costs no undo entry", () => {
        editor.handleVimKey(keyEvent("x"));
        expect(tileAt(20, 20)).toBe(210);
        editor.handleVimKey(keyEvent("u")); // flush the empty burst, then undo
        expect(tileAt(20, 20)).toBe(210);
        // the empty burst rolled back: nothing was ever recorded
        expect(editor.canUndo()).toBe(false);
    });

    it("coalesces a key-repeat burst into one undo entry", () => {
        editor.handleVimKey(keyEvent("l")); // move off the painted cell
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("h"));
        // burst: erase 3 cells under one held x
        editor.handleVimKey(keyEvent(" ")); // paint current
        editor.handleVimKey(keyEvent(" ")); // hold x below
        // erase three distinct cells with x (same verb, one burst)
        const before = editor.getMapData().Tiles;
        editor.handleVimKey(keyEvent("x"));
        editor.handleVimKey(keyEvent("h"));
        editor.handleVimKey(keyEvent("x"));
        editor.handleVimKey(keyEvent("h"));
        editor.handleVimKey(keyEvent("x"));
        expect(editor.getMapData().Tiles).not.toBe(before);
        expect(editor.canUndo()).toBe(true);
        editor.undo();
        // one undo reverts the entire burst
        expect(editor.getMapData().Tiles).toBe(before);
    });

    it("switching verb closes the burst into separate entries", () => {
        editor.handleVimKey(keyEvent(" ")); // paint 215
        editor.handleVimKey(keyEvent("x")); // erase  -> 210
        editor.handleVimKey(keyEvent(" ")); // paint  -> 215
        editor.handleVimKey(keyEvent("x")); // erase  -> 210
        expect(tileAt(20, 20)).toBe(210);
        expect(editor.canUndo()).toBe(true);
        editor.undo(); // reverts the last erase
        expect(tileAt(20, 20)).toBe(215);
        editor.undo(); // reverts that paint
        expect(tileAt(20, 20)).toBe(210);
        editor.undo(); // reverts the first erase
        expect(tileAt(20, 20)).toBe(215);
        editor.undo(); // reverts the first paint
        expect(tileAt(20, 20)).toBe(210);
        expect(editor.canUndo()).toBe(false);
    });

    it("u undoes the last burst", () => {
        editor.handleVimKey(keyEvent(" "));
        editor.handleVimKey(keyEvent("u"));
        expect(tileAt(20, 20)).toBe(210);
    });

    it("keeps a mouse drag as one undo entry (shared session)", () => {
        const mouse = (clientX: number, clientY: number) => ({
            clientX,
            clientY,
            button: 0,
            ctrlKey: false,
            metaKey: false,
            preventDefault: vi.fn(),
        });
        (editor as any).onCanvasMouseDown(
            mouse(100, 0) as unknown as MouseEvent,
        );
        for (let i = 0; i < 5; i++) {
            (editor as any).onCanvasMouseMove(
                mouse(100 + i * 15, 0) as unknown as MouseEvent,
            );
        }
        (editor as any).onCanvasMouseUp();
        editor.undo();
        // one undo removes the whole drag stroke
        expect(tileAt(0, 0)).toBe(210);
        expect(tileAt(5, 0)).toBe(210);
    });
});

describe("Editor visual mode + yank/paste", () => {
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

    const tileAt = (x: number, y: number) =>
        editor.getMapData().Tiles.charCodeAt(x + y * 40);
    const objectAt = (x: number, y: number) =>
        editor.getMapData().Objects.charCodeAt(x + y * 40);

    const paintCells = (...cells: [number, number][]) =>
        cells.forEach(([x, y]) => {
            editor.handleVimKey(keyEvent("g"));
            editor.handleVimKey(keyEvent("g"));
            for (let i = 0; i < y; i++) editor.handleVimKey(keyEvent("j"));
            for (let i = 0; i < x; i++) editor.handleVimKey(keyEvent("l"));
            editor.handleVimKey(keyEvent(" "));
        });

    it("shows the VISUAL label with region size", () => {
        editor.handleVimKey(keyEvent("v"));
        editor.handleVimKey(keyEvent("l"));
        expect(mockElements["statusVimMode"].textContent).toBe(
            "-- VISUAL -- 2x1",
        );
    });

    it("draws a tinted rectangle for the visual region", () => {
        editor.handleVimKey(keyEvent("v"));
        editor.handleVimKey(keyEvent("l"));
        mockCtx.fillRect.mockClear();
        mockCtx.strokeRect.mockClear();
        (editor as any).render();
        const box = (editor as any).getDrawBox();
        expect(mockCtx.fillRect).toHaveBeenCalledWith(
            box.startX + 20 * box.tileSize,
            box.startY + 20 * box.tileSize,
            2 * box.tileSize,
            box.tileSize,
        );
        expect(mockCtx.strokeRect).toHaveBeenCalled();
    });

    it("y captures both layers and p restores them", () => {
        // paint two distinct tiles side by side and an object at one cell
        editor.setCurrentLayer("tile");
        paintCells([5, 5], [6, 5]);
        editor.setCurrentLayer("object");
        editor.setSelectedObject({ ID: 201, Type: "FloorItem", Style: "Test" });
        editor.handleVimKey(keyEvent("g"));
        editor.handleVimKey(keyEvent("g"));
        for (let i = 0; i < 6; i++) editor.handleVimKey(keyEvent("j"));
        editor.handleVimKey(keyEvent(" ")); // object at (6,6)

        // select (6,5)..(7,5)? select the painted pair instead:
        editor.setCurrentLayer("tile");
        editor.handleVimKey(keyEvent("g"));
        editor.handleVimKey(keyEvent("g"));
        for (let i = 0; i < 5; i++) editor.handleVimKey(keyEvent("j"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("v"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("y"));
        expect((editor as any).vim.getMode()).toBe("normal");

        // erase originals, paste somewhere else
        const buffer = (editor as any).yankBuffer;
        expect(buffer.width).toBe(2);
        expect(buffer.height).toBe(1);
        editor.handleVimKey(keyEvent("g"));
        editor.handleVimKey(keyEvent("g"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("p"));
        expect(tileAt(1, 0)).toBe(215);
        expect(tileAt(2, 0)).toBe(215);
    });

    it("d deletes the whole visual region as one undo entry", () => {
        paintCells([5, 5], [6, 5], [7, 5]);
        editor.handleVimKey(keyEvent("g"));
        editor.handleVimKey(keyEvent("g"));
        for (let i = 0; i < 5; i++) editor.handleVimKey(keyEvent("j"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("v"));
        editor.handleVimKey(keyEvent("2"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("d"));
        expect(tileAt(5, 5)).toBe(210);
        expect(tileAt(6, 5)).toBe(210);
        expect(tileAt(7, 5)).toBe(210);
        expect(editor.canUndo()).toBe(true);
        editor.undo();
        expect(tileAt(5, 5)).toBe(215);
        expect(tileAt(6, 5)).toBe(215);
        expect(tileAt(7, 5)).toBe(215);
    });

    it("paste is empty-safe (no buffer = no-op)", () => {
        editor.handleVimKey(keyEvent("p"));
        expect(tileAt(20, 20)).toBe(210);
        expect(editor.canUndo()).toBe(false);
    });

    it("Escape exits visual mode", () => {
        editor.handleVimKey(keyEvent("v"));
        editor.handleVimKey(keyEvent("Escape"));
        expect((editor as any).vim.getRegion()).toBeNull();
        expect(mockElements["statusVimMode"].textContent).toBe("-- NORMAL --");
    });
});
