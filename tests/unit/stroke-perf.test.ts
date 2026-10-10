import { describe, it, expect, beforeEach, vi } from "vitest";
import { BCMapEditor } from "../../src/editor";

// Stroke benchmark: a 40-cell drag is the realistic worst case for a
// single press/drag gesture. Budgets are generous sanity bounds (orders
// of magnitude above measured ~ms costs), not tight gates — they exist
// to catch accidental quadratic blowups, not to fail on slow CI.

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
    createElement: vi.fn(() => ({})),
} as any;
global.window = { addEventListener: vi.fn(), devicePixelRatio: 1 } as any;
global.Image = vi.fn(() => ({ onerror: null, onload: null, src: "" })) as any;
// Synchronous rAF so stroke cost includes the render it schedules.
global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(performance.now());
    return 1;
}) as any;

describe("Drag-stroke benchmark (40-cell worst case)", () => {
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

    it("paints 40 distinct cells in well under budget", () => {
        // Model-only: render scheduling stubbed, so this measures the
        // string-splice cost (typically ~0.1ms) deterministically.
        const e = editor as any;
        e.requestRender = () => {};
        const start = performance.now();
        for (let i = 0; i < 40; i++) {
            e.paintAt({ X: i, Y: 0 });
        }
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(200);
    });

    it("a full 40-cell stroke with renders stays in budget", () => {
        // End-to-end smoke with synchronous renders. Budget is deliberately
        // lax (10x typical) — it trips on structural blowups, not noise.
        const e = editor as any;
        e.history.beginStroke(
            editor.getMapData().Tiles,
            editor.getMapData().Objects,
        );
        const start = performance.now();
        for (let i = 0; i < 40; i++) {
            e.paintAt({ X: i, Y: 1 });
        }
        e.history.endStroke();
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(2000);
    });

    it("undo of a 40-cell stroke stays in budget", () => {
        const e = editor as any;
        e.history.beginStroke(
            editor.getMapData().Tiles,
            editor.getMapData().Objects,
        );
        for (let i = 0; i < 40; i++) {
            e.paintAt({ X: i, Y: 2 });
        }
        e.history.endStroke();
        const start = performance.now();
        editor.undo();
        const elapsed = performance.now() - start;
        expect(elapsed).toBeLessThan(50);
    });
});
