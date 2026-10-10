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

describe("Position-based zoom", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        editor = new BCMapEditor("testCanvas");
    });

    it("keeps the map point under the anchor fixed when zooming", () => {
        // zoom 1: drawSize 600, tileSize 15, startX 100, startY 0
        const anchor = { x: 100 + 10 * 15 + 7.5, y: 10 * 15 + 7.5 };
        const boxBefore = (editor as any).getDrawBox();
        const worldBefore = {
            x: (anchor.x - boxBefore.startX) / boxBefore.tileSize,
            y: (anchor.y - boxBefore.startY) / boxBefore.tileSize,
        };

        editor.setZoom(2, anchor);

        const boxAfter = (editor as any).getDrawBox();
        const worldAfter = {
            x: (anchor.x - boxAfter.startX) / boxAfter.tileSize,
            y: (anchor.y - boxAfter.startY) / boxAfter.tileSize,
        };
        // Pixel snapping can shift the anchor by at most half a snapped pixel.
        const maxDrift = 0.5 / boxAfter.tileSize + 1e-9;
        expect(Math.abs(worldAfter.x - worldBefore.x)).toBeLessThanOrEqual(
            maxDrift,
        );
        expect(Math.abs(worldAfter.y - worldBefore.y)).toBeLessThanOrEqual(
            maxDrift,
        );
    });

    it("keeps pan within the clamp limits after an anchored zoom", () => {
        const anchor = { x: 780, y: 580 };
        editor.setZoom(3, anchor);
        const limitX = Math.max(0, (1800 - 800) / 2) + 15 * (1800 / 40);
        const limitY = Math.max(0, (1800 - 600) / 2) + 15 * (1800 / 40);
        expect(Math.abs((editor as any).panX)).toBeLessThanOrEqual(limitX);
        expect(Math.abs((editor as any).panY)).toBeLessThanOrEqual(limitY);
    });

    it("still clamps to the zoom range without an anchor", () => {
        editor.setZoom(100);
        expect((editor as any).zoom).toBe(3);
        editor.setZoom(0.0001);
        expect((editor as any).zoom).toBe(0.25);
    });
});
