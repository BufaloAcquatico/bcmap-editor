import { describe, it, expect, beforeEach, vi } from "vitest";
import { BCMapEditor } from "../../src/editor";

// Mock DOM with an odd canvas size that would otherwise produce fractional
// tile sizes (min dim 601 / 40 = 15.025).
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
    width: 807,
    height: 601,
    clientWidth: 807,
    clientHeight: 601,
    style: {},
    getContext: vi.fn(() => mockCtx),
    getBoundingClientRect: vi.fn(() => ({
        left: 0,
        top: 0,
        width: 807,
        height: 601,
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

describe("Tile seams", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        editor = new BCMapEditor("testCanvas");
    });

    it("snaps the draw box to whole device pixels", () => {
        const box = (editor as any).getDrawBox();
        expect(Number.isInteger(box.tileSize)).toBe(true);
        expect(box.size % 40).toBe(0);
        expect(Number.isInteger(box.startX)).toBe(true);
        expect(Number.isInteger(box.startY)).toBe(true);
    });

    it("stays pixel-snapped at fractional zoom levels", () => {
        editor.setZoom(1.5);
        const box = (editor as any).getDrawBox();
        expect(Number.isInteger(box.tileSize)).toBe(true);
        expect(Number.isInteger(box.startX)).toBe(true);
        expect(Number.isInteger(box.startY)).toBe(true);
    });

    it("draws horizontally adjacent tiles with no gap", () => {
        mockCtx.fillRect.mockClear();
        editor.render();
        const box = (editor as any).getDrawBox();
        const tiles = mockCtx.fillRect.mock.calls.filter(
            (args: number[]) =>
                args[2] === box.tileSize && args[3] === box.tileSize,
        );
        expect(tiles.length).toBe(40 * 40);
        for (const [, , w, h] of tiles) {
            expect(w % 1).toBe(0);
            expect(h % 1).toBe(0);
        }
        const byPos = new Map<string, number[]>();
        for (const [x, y, w] of tiles) byPos.set(`${x},${y}`, [x, y, w]);
        for (let row = 0; row < 40; row++) {
            for (let col = 0; col < 39; col++) {
                const left = byPos.get(
                    `${box.startX + col * box.tileSize},${box.startY + row * box.tileSize}`,
                )!;
                const right = byPos.get(
                    `${box.startX + (col + 1) * box.tileSize},${box.startY + row * box.tileSize}`,
                )!;
                expect(right[0]).toBe(left[0] + left[2]);
            }
        }
    });
});
