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

function createMouseEvent(overrides: Partial<MouseEvent> = {}): MouseEvent {
    return {
        button: 0,
        ctrlKey: overrides.ctrlKey ?? false,
        clientX: overrides.clientX ?? 0,
        clientY: overrides.clientY ?? 0,
        metaKey: overrides.metaKey ?? false,
        altKey: overrides.altKey ?? false,
        shiftKey: overrides.shiftKey ?? false,
    } as MouseEvent;
}

function ctrlDrag(
    editor: BCMapEditor,
    from: { x: number; y: number },
    to: { x: number; y: number },
) {
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
}

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
        // PAN_OVERSCROLL_TILES = 15, tileSize = 8, margin = 120
        // Drag by (20,10) is within clamp, so panX=20, panY=10
        expect((editor as any).panX).toBe(20); // clamped to 15 tiles
        expect((editor as any).panY).toBe(10);
    });

    it("clamps symmetrically per axis when zoomed in", () => {
        (editor as any).zoom = 3; // drawSize 1800, tileSize 45
        // PAN_OVERSCROLL_TILES = 15, margin = 675
        // Clamp limit X: (1800-800)/2 + 675 = 500 + 675 = 1175
        // Clamp limit Y: (1800-600)/2 + 675 = 600 + 675 = 1275
        // Drag by (10000, 10000) beyond clamp, so panX=1175, panY=1275
        ctrlDrag(editor, { x: 0, y: 0 }, { x: 10000, y: 10000 });
        expect((editor as any).panX).toBe(1175);
        expect((editor as any).panY).toBe(1275);
    });

    it("clamps to the negative border without a shift", () => {
        (editor as any).zoom = 3;
        ctrlDrag(editor, { x: 0, y: 0 }, { x: -10000, y: -10000 });
        // PAN_OVERSCROLL_TILES = 15
        expect((editor as any).panX).toBe(-1175);
        expect((editor as any).panY).toBe(-1275);
    });

    it("scales the overscroll margin with zoom", () => {
        // zoom 1 -> drawSize 600, tileSize 15, margin = 15*15 = 225
        // limitX = max(0, (600-800)/2) + 225 = 0 + 225 = 225
        (editor as any).zoom = 1;
        ctrlDrag(editor, { x: 0, y: 0 }, { x: 10000, y: 0 });
        expect((editor as any).panX).toBe(225);

        // zoom 2 -> drawSize 1200, tileSize 30, margin = 15*30 = 450
        // limitX = max(0, (1200-800)/2) + 450 = 200 + 450 = 650
        (editor as any).panX = 0;
        (editor as any).zoom = 2;
        ctrlDrag(editor, { x: 0, y: 0 }, { x: 10000, y: 0 });
        expect((editor as any).panX).toBe(650);
    });

    it("setZoom clamps to the zoom range", () => {
        editor.setZoom(100);
        expect((editor as any).zoom).toBe(3);
        editor.setZoom(0.0001);
        expect((editor as any).zoom).toBe(0.25);
    });
});
