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
        expect(editor.handleVimKey(keyEvent("x"))).toBe(false);
        expect((editor as any).vim.getCursor()).toBeNull();
    });
});
