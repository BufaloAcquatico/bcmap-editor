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

const ctrlDrag = (
    editor: BCMapEditor,
    from: { x: number; y: number },
    to: { x: number; y: number },
): void => {
    editor.onCanvasMouseDown(
        createMouseEvent({
            button: 0,
            ctrlKey: true,
            clientX: from.x,
            clientY: from.y,
        }),
    );
    editor.onCanvasMouseMove(
        createMouseEvent({ clientX: to.x, clientY: to.y }),
    );
    editor.onCanvasMouseUp();
};

describe("Pan clamping", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        mockCanvas.width = 800;
        mockCanvas.height = 600;
        editor = new BCMapEditor("testCanvas");
    });

    it("stays within the overscroll margin when the map fits (regression)", () => {
        (editor as any).zoom = 0.5; // drawSize snaps to 320 (40-px steps)
        ctrlDrag(editor, { x: 0, y: 0 }, { x: 20, y: 10 });
        const margin = 2 * (editor as any).getDrawBox().tileSize;
        expect((editor as any).panX).toBe(margin); // clamped to 2 tiles
        expect((editor as any).panY).toBe(10);
    });

    it("clamps symmetrically per axis when zoomed in", () => {
        (editor as any).zoom = 3; // drawSize 1800, margin 90
        ctrlDrag(editor, { x: 0, y: 0 }, { x: 10000, y: 10000 });
        expect((editor as any).panX).toBe(590); // (1800 - 800) / 2 + 90
        expect((editor as any).panY).toBe(690); // (1800 - 600) / 2 + 90
    });

    it("clamps to the negative border without a shift", () => {
        (editor as any).zoom = 3;
        ctrlDrag(editor, { x: 0, y: 0 }, { x: -10000, y: -10000 });
        expect((editor as any).panX).toBe(-590);
        expect((editor as any).panY).toBe(-690);
    });

    it("preserves a pan within the limits", () => {
        (editor as any).zoom = 3;
        ctrlDrag(editor, { x: 0, y: 0 }, { x: 50, y: 40 });
        expect((editor as any).panX).toBe(50);
        expect((editor as any).panY).toBe(40);
    });

    it("scales the overscroll margin with zoom", () => {
        // zoom 1 -> drawSize 600, margin 30
        (editor as any).zoom = 1;
        ctrlDrag(editor, { x: 0, y: 0 }, { x: 10000, y: 0 });
        expect((editor as any).panX).toBe(30);

        // zoom 2 -> drawSize 1200, margin 60: (1200 - 800) / 2 + 60
        (editor as any).panX = 0;
        (editor as any).zoom = 2;
        ctrlDrag(editor, { x: 0, y: 0 }, { x: 10000, y: 0 });
        expect((editor as any).panX).toBe(260);
    });

    it("setZoom clamps to the zoom range", () => {
        editor.setZoom(100);
        expect((editor as any).zoom).toBe(3);
        editor.setZoom(0.0001);
        expect((editor as any).zoom).toBe(0.25);
    });

    it("resetView recenters zoom and pan", () => {
        (editor as any).zoom = 3;
        (editor as any).panX = 500;
        (editor as any).panY = 600;
        editor.resetView();
        expect((editor as any).zoom).toBe(1);
        expect((editor as any).panX).toBe(0);
        expect((editor as any).panY).toBe(0);
    });
});
