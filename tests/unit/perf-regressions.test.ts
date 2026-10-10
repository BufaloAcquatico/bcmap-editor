import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BCMapEditor } from "../../src/editor";

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

const rafQueue: FrameRequestCallback[] = [];
global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafQueue.push(cb);
    return rafQueue.length;
}) as any;

const wheelEvent = (deltaY: number): WheelEvent =>
    ({
        deltaY,
        clientX: 400,
        clientY: 300,
        preventDefault: vi.fn(),
    }) as unknown as WheelEvent;

const countTileDraws = (): number => {
    const box = (editor as any).getDrawBox();
    return mockCtx.fillRect.mock.calls.filter(
        (args: number[]) =>
            args[2] === box.tileSize && args[3] === box.tileSize,
    ).length;
};

let editor: BCMapEditor;

beforeEach(() => {
    vi.clearAllMocks();
    rafQueue.length = 0;
    editor = new BCMapEditor("testCanvas");
});

afterEach(() => {
    rafQueue.length = 0;
});

describe("Zoom animation terminates (infinite rAF loop regression)", () => {
    it("drains the rAF queue after a wheel zoom", () => {
        (editor as any).onCanvasWheel(wheelEvent(-120));
        expect((editor as any).zoomAnimating).toBe(true);
        let steps = 0;
        while (rafQueue.length > 0) {
            expect(steps++).toBeLessThan(5000);
            const cb = rafQueue.shift()!;
            cb(performance.now());
        }
        expect(steps).toBeLessThan(5000);
        expect((editor as any).zoomAnimating).toBe(false);
        expect((editor as any).zoomAnchor).toBeNull();
        expect(rafQueue).toHaveLength(0);
    });

    it("leaves no scheduled frames behind after several wheel ticks", () => {
        (editor as any).onCanvasWheel(wheelEvent(-120));
        (editor as any).onCanvasWheel(wheelEvent(-120));
        (editor as any).onCanvasWheel(wheelEvent(120));
        let steps = 0;
        while (rafQueue.length > 0) {
            expect(steps++).toBeLessThan(5000);
            rafQueue.shift()!(performance.now());
        }
        expect((editor as any).zoomAnimating).toBe(false);
        expect(rafQueue).toHaveLength(0);
    });
});

describe("Viewport culling", () => {
    it("draws every tile when the map fully fits (zoom 1)", () => {
        mockCtx.fillRect.mockClear();
        (editor as any).render();
        expect(countTileDraws()).toBe(40 * 40);
    });

    it("draws only visible tiles when zoomed in (zoom 3)", () => {
        editor.setZoom(3);
        mockCtx.fillRect.mockClear();
        (editor as any).render();
        const drawn = countTileDraws();
        expect(drawn).toBeGreaterThan(0);
        expect(drawn).toBeLessThan(40 * 40);
    });

    it("still covers the whole canvas after panning at zoom 3", () => {
        editor.setZoom(3);
        (editor as any).panX = 900;
        (editor as any).panY = -600;
        (editor as any).clampPan();
        mockCtx.fillRect.mockClear();
        (editor as any).render();
        const drawn = countTileDraws();
        expect(drawn).toBeGreaterThan(0);
        expect(drawn).toBeLessThan(40 * 40);
    });
});

describe("Render coalescing", () => {
    it("collapses a burst of paintAt calls into one scheduled render", () => {
        // Paint a non-default tile so the burst contains real changes
        // (repainting the default grass is a no-op and schedules nothing).
        editor.setSelectedTile({
            ID: 215,
            Type: "FloorExterior",
            Style: "LongGrass",
        });
        for (let i = 0; i < 100; i++) {
            (editor as any).paintAt({ X: i % 40, Y: Math.floor(i / 40) });
        }
        expect(rafQueue).toHaveLength(1);
        const before = mockCtx.fillRect.mock.calls.length;
        rafQueue.shift()!(performance.now());
        expect(mockCtx.fillRect.mock.calls.length).toBeGreaterThan(before);
        expect(rafQueue).toHaveLength(0);
    });

    it("schedules a new render after the previous one flushed", () => {
        editor.setSelectedTile({
            ID: 215,
            Type: "FloorExterior",
            Style: "LongGrass",
        });
        (editor as any).paintAt({ X: 1, Y: 1 });
        expect(rafQueue).toHaveLength(1);
        rafQueue.shift()!(performance.now());
        (editor as any).paintAt({ X: 2, Y: 2 });
        expect(rafQueue).toHaveLength(1);
        rafQueue.shift()!(performance.now());
        expect(rafQueue).toHaveLength(0);
    });

    it("a burst of no-op repaints schedules no render", () => {
        // Default selection is grass on an all-grass map: nothing changes.
        for (let i = 0; i < 100; i++) {
            (editor as any).paintAt({ X: i % 40, Y: Math.floor(i / 40) });
        }
        expect(rafQueue).toHaveLength(0);
    });
});
