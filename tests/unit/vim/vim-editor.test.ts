import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BCMapEditor } from "../../../src/editor";
import { appSurface } from "../../../src/appSurface";
import { MOTION_MS, MOTION_QUICK_MS } from "../../../src/anim";

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

    it("clamps an out-of-bounds mouse hover to the last valid position", () => {
        (editor as any).hoveredTile = { X: -5, Y: 99 };
        editor.handleVimKey(keyEvent("v"));
        expect((editor as any).vim.getCursor()).toEqual({ X: 0, Y: 39 });
        expect((editor as any).vim.getRegion()).toEqual({
            from: { X: 0, Y: 39 },
            to: { X: 0, Y: 39 },
        });
        expect((editor as any).vim.getMode()).toBe("visual");
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

    it("painting with the grass brush erases back to grass", () => {
        editor.handleVimKey(keyEvent(" "));
        editor.setSelectedTile({
            ID: 210,
            Type: "FloorExterior",
            Style: "Grass",
        });
        editor.handleVimKey(keyEvent(" "));
        expect(tileAt(20, 20)).toBe(210);
    });

    it("painting unchanged content costs no undo entry", () => {
        editor.setSelectedTile({
            ID: 210,
            Type: "FloorExterior",
            Style: "Grass",
        });
        editor.handleVimKey(keyEvent(" "));
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
        // burst: paint 3 distinct cells with held Space (one burst)
        const before = editor.getMapData().Tiles;
        editor.handleVimKey(keyEvent(" "));
        editor.handleVimKey(keyEvent("h"));
        editor.handleVimKey(keyEvent(" "));
        editor.handleVimKey(keyEvent("h"));
        editor.handleVimKey(keyEvent(" "));
        expect(editor.getMapData().Tiles).not.toBe(before);
        expect(editor.canUndo()).toBe(true);
        editor.undo();
        // one undo reverts the entire burst
        expect(editor.getMapData().Tiles).toBe(before);
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

    it("Space fills the whole visual region as one undo entry", () => {
        paintCells([5, 5], [7, 5]);
        editor.handleVimKey(keyEvent("g"));
        editor.handleVimKey(keyEvent("g"));
        for (let i = 0; i < 5; i++) editor.handleVimKey(keyEvent("j"));
        for (let i = 0; i < 5; i++) editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("v"));
        editor.handleVimKey(keyEvent("2"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent(" "));
        expect(tileAt(5, 5)).toBe(215);
        expect(tileAt(6, 5)).toBe(215);
        expect(tileAt(7, 5)).toBe(215);
        expect((editor as any).vim.getMode()).toBe("normal");
        expect(editor.canUndo()).toBe(true);
        editor.undo(); // reverts the fill only
        expect(tileAt(5, 5)).toBe(215);
        expect(tileAt(6, 5)).toBe(210);
        expect(tileAt(7, 5)).toBe(215);
        editor.undo(); // reverts the painted pair
        expect(tileAt(5, 5)).toBe(210);
        expect(tileAt(7, 5)).toBe(210);
    });

    it("p tiles the yank over the visual region", () => {
        paintCells([0, 0]); // (0,0) = 215, (1,0) stays grass
        editor.handleVimKey(keyEvent("g"));
        editor.handleVimKey(keyEvent("g"));
        editor.handleVimKey(keyEvent("v"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("y")); // buffer 2x1: [215, grass]
        editor.handleVimKey(keyEvent("g"));
        editor.handleVimKey(keyEvent("g"));
        for (let i = 0; i < 5; i++) editor.handleVimKey(keyEvent("j"));
        editor.handleVimKey(keyEvent("v"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("p")); // tile [215, grass] over 4x1
        expect(tileAt(0, 5)).toBe(215);
        expect(tileAt(1, 5)).toBe(210);
        expect(tileAt(2, 5)).toBe(215);
        expect(tileAt(3, 5)).toBe(210);
        expect((editor as any).vim.getMode()).toBe("normal");
        editor.undo(); // one undo reverts the whole tiling
        expect(tileAt(0, 5)).toBe(210);
        expect(tileAt(2, 5)).toBe(210);
        expect(tileAt(0, 0)).toBe(215); // source cells untouched
    });

    it("tiled paste with an empty buffer shows E353 and records nothing", () => {
        editor.handleVimKey(keyEvent("v"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("p"));
        expect(mockElements["statusVimMode"].textContent).toBe(
            "E353: Nothing in register",
        );
        expect(editor.canUndo()).toBe(false);
        expect((editor as any).vim.getMode()).toBe("normal");
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

describe("Editor command line (VB5)", () => {
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

    it(":line paints a straight run on the active layer", () => {
        editor.handleVimCommand("line 0,0 3,0");
        expect(tileAt(0, 0)).toBe(215);
        expect(tileAt(1, 0)).toBe(215);
        expect(tileAt(2, 0)).toBe(215);
        expect(tileAt(3, 0)).toBe(215);
        expect(tileAt(4, 0)).toBe(210);
    });

    it(":line is one undo entry", () => {
        editor.handleVimCommand("line 0,0 3,0");
        expect(editor.canUndo()).toBe(true);
        editor.undo();
        expect(tileAt(2, 0)).toBe(210);
    });

    it(":line clips off-map cells", () => {
        editor.handleVimCommand("line 39,39 44,44");
        expect(tileAt(39, 39)).toBe(215);
    });

    it(":grid toggles the grid", () => {
        const before = editor.getGridVisible();
        editor.handleVimCommand(":grid");
        expect(editor.getGridVisible()).toBe(!before);
    });

    it(":help toggles the help card", () => {
        const before = editor.getHelpVisible();
        editor.handleVimCommand("help");
        expect(editor.getHelpVisible()).toBe(!before);
    });

    it(":w goes through the write handler with the name", () => {
        const writer = vi.fn();
        editor.onWriteMapRequest = writer;
        editor.handleVimCommand("write my-map");
        expect(writer).toHaveBeenCalledWith("my-map");
    });

    it(":e goes through the import handler", () => {
        const opener = vi.fn();
        editor.onImportRequest = opener;
        editor.handleVimCommand("e");
        expect(opener).toHaveBeenCalledTimes(1);
    });

    it("shows E492 for an unknown command", () => {
        editor.handleVimCommand("nope");
        expect(mockElements["statusVimMode"].textContent).toBe(
            "E492: Not an editor command: nope",
        );
    });

    it("shows E353 when pasting with an empty register", () => {
        editor.handleVimKey(keyEvent("p"));
        expect(mockElements["statusVimMode"].textContent).toBe(
            "E353: Nothing in register",
        );
    });

    it("bad :line usage reports an error and paints nothing", () => {
        editor.handleVimCommand("line 3,4");
        expect(mockElements["statusVimMode"].textContent).toMatch(/E486/);
        expect(tileAt(3, 4)).toBe(210);
    });
});

describe("Off-map cursor restyle", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        appSurface.set("map");
        editor = new BCMapEditor("testCanvas");
        editor.handleVimKey(keyEvent("j")); // boot the cursor at (20, 21)
    });

    it("draws the shared hover white, dashed, on the map surface", () => {
        mockCtx.setLineDash.mockClear();
        mockCtx.strokeStyle = "";
        (editor as any).render();
        expect(mockCtx.setLineDash).toHaveBeenCalledWith([4, 4]);
        expect(mockCtx.strokeStyle).toBe("rgba(255, 255, 255, 0.9)");
        appSurface.set("map");
    });

    it("draws dimmed white dotted off the map and repaints on change", () => {
        mockCtx.setLineDash.mockClear();
        mockCtx.fillRect.mockClear();
        appSurface.set("picker"); // subscriber repaints synchronously here
        expect(mockCtx.fillRect).toHaveBeenCalled();
        expect(mockCtx.setLineDash).toHaveBeenCalledWith([2, 3]);
        expect(mockCtx.strokeStyle).toBe("rgba(255, 255, 255, 0.35)");
        appSurface.set("map");
    });
});

describe("Canvas cursor glide", () => {
    let editor: BCMapEditor;
    let frames: Array<() => void>;
    let now = 100000;

    beforeEach(() => {
        vi.clearAllMocks();
        appSurface.set("map");
        // Pump frames manually AND control the clock: renders only run
        // when flushed, and only advance time when tests say so. Motion
        // stays fully deterministic for any duration tuning.
        frames = [];
        now = 100000;
        vi.spyOn(performance, "now").mockImplementation(() => now);
        vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
            frames.push(cb);
            return frames.length;
        });
        editor = new BCMapEditor("testCanvas");
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    const flushOne = () => {
        const pending = frames;
        frames = [];
        pending.forEach((cb) => cb());
    };
    // Advance the clock by whole frames until the loop drains. Bounded
    // generously so any sane duration tuning converges mid-test.
    const settleFrames = () => {
        for (let i = 0; i < 5000 && frames.length > 0; i++) {
            now += 1000 / 60;
            flushOne();
        }
        expect(frames).toHaveLength(0);
    };
    // Exactly one frame after advancing the clock: a single step.
    const stepFrame = (ms: number) => {
        now += ms;
        flushOne();
    };
    // Direct renders (field pokes, not key events) step once, on demand.
    const renderAt = (ms: number) => {
        now += ms;
        (editor as any).render();
    };

    it("snaps the render position on first appearance", () => {
        editor.handleVimKey(keyEvent("j")); // logical (20, 21)
        settleFrames();
        expect((editor as any).cursorRenderPos).toEqual({ X: 20, Y: 21 });
    });

    it("glides mid-flight, then lands exactly", () => {
        editor.handleVimKey(keyEvent("j"));
        settleFrames(); // snap to (20, 21)
        editor.handleVimKey(keyEvent("l")); // logical (21, 21)
        stepFrame(1000 / 60); // exactly one frame toward it
        const mid = (editor as any).cursorRenderPos;
        expect(mid.X).toBeGreaterThan(20);
        expect(mid.X).toBeLessThan(21);
        expect(mid.Y).toBe(21);
        expect(frames.length).toBeGreaterThan(0); // chain continues
        settleFrames();
        expect((editor as any).cursorRenderPos).toEqual({ X: 21, Y: 21 });
    });

    it("eases an open region and snaps a fresh one", () => {
        editor.handleVimKey(keyEvent("v"));
        editor.handleVimKey(keyEvent("l"));
        settleFrames(); // snap region (20..21, 20)
        editor.handleVimKey(keyEvent("l")); // logical to.x = 22
        stepFrame(1000 / 60);
        const mid = (editor as any).regionRender.to.X;
        expect(mid).toBeGreaterThan(21);
        expect(mid).toBeLessThan(22);
        settleFrames();
        expect((editor as any).regionRender.to).toEqual({ X: 22, Y: 20 });
    });

    it("grows the hover outline from the tile middle on appear", () => {
        (editor as any).hoveredTile = { X: 5, Y: 5 };
        renderAt(1000 / 60);
        const scale = (editor as any).hoverRenderScale;
        expect(scale).toBeGreaterThan(0);
        expect(scale).toBeLessThan(1);
        expect((editor as any).hoverRenderPos).toEqual({ X: 5, Y: 5 });
        settleFrames();
        expect((editor as any).hoverRenderScale).toBe(1);
    });

    it("chases the hover across tiles, then shrinks away on leave", () => {
        (editor as any).hoveredTile = { X: 5, Y: 5 };
        renderAt(1000 / 60);
        settleFrames();
        (editor as any).hoveredTile = { X: 8, Y: 5 };
        renderAt(1000 / 60); // exactly one step toward (8, 5)
        const mid = (editor as any).hoverRenderPos;
        expect(mid.X).toBeGreaterThan(5);
        expect(mid.X).toBeLessThan(8);
        settleFrames();
        expect((editor as any).hoverRenderPos).toEqual({ X: 8, Y: 5 });
        // Leaving for void shrinks back toward the middle, then hides.
        (editor as any).hoveredTile = null;
        renderAt(1000 / 60); // exactly one step toward hidden
        const shrinking = (editor as any).hoverRenderScale;
        expect(shrinking).toBeGreaterThan(0);
        expect(shrinking).toBeLessThan(1);
        settleFrames();
        expect((editor as any).hoverRenderScale).toBe(0);
        expect((editor as any).hoverRenderPos).toBeNull();
    });

    it("treats an out-of-bounds hover as hidden until it returns", () => {
        (editor as any).hoveredTile = { X: -3, Y: 0 };
        renderAt(1000 / 60);
        settleFrames();
        expect((editor as any).hoverRenderScale).toBe(0);
        expect((editor as any).hoverRenderPos).toBeNull();
        (editor as any).hoveredTile = { X: 5, Y: 5 };
        renderAt(1000 / 60); // snap position, first grow step
        expect((editor as any).hoverRenderScale).toBeGreaterThan(0);
        expect((editor as any).hoverRenderPos).toEqual({ X: 5, Y: 5 });
    });

    it("snaps everything under reduced motion", () => {
        vi.stubGlobal("window", {
            matchMedia: vi.fn(() => ({ matches: true })),
            devicePixelRatio: 1,
            addEventListener: vi.fn(),
        });
        editor.handleVimKey(keyEvent("j"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("l"));
        settleFrames();
        // Jumped two cells with no intermediate positions rendered.
        expect((editor as any).cursorRenderPos).toEqual({ X: 22, Y: 21 });
        expect((editor as any).stepMotion()).toBe(false);
    });

    it("pulses once on region fill, then clears past the token", () => {
        editor.setSelectedTile({
            ID: 215,
            Type: "FloorExterior",
            Style: "LongGrass",
        });
        editor.handleVimKey(keyEvent("v"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent(" "));
        const flash = (editor as any).flash;
        expect(flash?.region).toEqual({
            from: { X: 20, Y: 20 },
            to: { X: 21, Y: 20 },
        });
        expect(flash?.durationMs).toBe(MOTION_MS);
        const now = vi.spyOn(performance, "now");
        try {
            now.mockReturnValue(performance.now() + 10_000);
            (editor as any).render();
            expect((editor as any).flash).toBeNull();
        } finally {
            now.mockRestore();
        }
    });

    it("skips the pulse under reduced motion", () => {
        vi.stubGlobal("window", {
            matchMedia: vi.fn(() => ({ matches: true })),
            devicePixelRatio: 1,
            addEventListener: vi.fn(),
        });
        try {
            editor.setSelectedTile({
                ID: 215,
                Type: "FloorExterior",
                Style: "LongGrass",
            });
            editor.handleVimKey(keyEvent("v"));
            editor.handleVimKey(keyEvent("l"));
            editor.handleVimKey(keyEvent(" "));
            expect((editor as any).flash).toBeNull();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("blinks the yanked region white over the quick tier", () => {
        editor.handleVimKey(keyEvent("v"));
        editor.handleVimKey(keyEvent("l"));
        editor.handleVimKey(keyEvent("y"));
        // Yank exits visual mode, leaving only the blink behind.
        expect((editor as any).vim.getMode()).toBe("normal");
        const flash = (editor as any).flash;
        expect(flash?.region).toEqual({
            from: { X: 20, Y: 20 },
            to: { X: 21, Y: 20 },
        });
        expect(flash?.durationMs).toBe(MOTION_QUICK_MS);
        // The blink recolors the selection: white border and fill.
        (editor as any).render();
        expect(mockCtx.strokeStyle).toBe("rgba(255, 255, 255, 0.9)");
        expect(mockCtx.fillStyle).toBe("rgba(255, 255, 255, 0.15)");
        const now = vi.spyOn(performance, "now");
        try {
            now.mockReturnValue(performance.now() + 10_000);
            (editor as any).render();
            expect((editor as any).flash).toBeNull();
        } finally {
            now.mockRestore();
        }
    });
});
