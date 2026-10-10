import { describe, it, expect, beforeEach, vi } from "vitest";
import { BCMapEditor, MAP_WIDTH } from "../../src/editor";

// Mock DOM for testing (mirrors existing unit test setup)
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
global.window = { addEventListener: vi.fn() } as any;
global.Image = vi.fn(() => ({
    onerror: null,
    onload: null,
    src: "",
    complete: true,
    naturalWidth: 48,
    naturalHeight: 48,
})) as any;

// Cactus: ID 2057, Left -0.2, Top -1.2, Width 1.3, Height 1.8
const CACTUS_ID = 2057;

function setObjectAt(
    editor: BCMapEditor,
    x: number,
    y: number,
    id: number,
): void {
    const data = editor.getMapData();
    const index = x + y * MAP_WIDTH;
    data.Objects =
        data.Objects.substring(0, index) +
        String.fromCharCode(id) +
        data.Objects.substring(index + 1);
}

describe("Object render positions at any zoom (Change 1)", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        editor = new BCMapEditor("testCanvas");
    });

    it("object culling margin is an integer so grid loops stay on whole cells", () => {
        const margin = (editor as any).objectMarginTiles;
        expect(Number.isInteger(margin)).toBe(true);
        expect(margin).toBeGreaterThanOrEqual(2);
    });

    it("paints the clicked cell at zoom 200% (data index correct, no 20-cell jump)", () => {
        editor.setZoom(2.0);
        const box = (editor as any).getDrawBox();
        // Click the visual center of cell (10, 18)
        const clientX = box.startX + 10 * box.tileSize + box.tileSize / 2;
        const clientY = box.startY + 18 * box.tileSize + box.tileSize / 2;
        const pos = (editor as any).getTilePosFromMouse({
            clientX,
            clientY,
        } as unknown as MouseEvent);
        expect(pos).toEqual({ X: 10, Y: 18 });

        // Paint an object there and verify the data index, not some far cell
        (editor as any).currentLayer = "object";
        (editor as any).selectedObject = (editor as any).fullObjectMap.get(
            CACTUS_ID,
        );
        (editor as any).paintAt(pos);
        const data = editor.getMapData();
        expect(data.Objects.charCodeAt(10 + 18 * MAP_WIDTH)).toBe(CACTUS_ID);
        // The previously reported phantom destination stays blank
        expect(data.Objects.charCodeAt(20 + 17 * MAP_WIDTH)).toBe(100);
    });

    it("renders the object sprite exactly over its own tile at zoom 200%", () => {
        editor.setZoom(2.0);
        setObjectAt(editor, 10, 18, CACTUS_ID);
        (mockCtx.drawImage as any).mockClear();
        (editor as any).render();

        const box = (editor as any).getDrawBox();
        const obj = (editor as any).fullObjectMap.get(CACTUS_ID);
        const expectedX = box.startX + (10 + obj.Left) * box.tileSize;
        const expectedY = box.startY + (18 + obj.Top) * box.tileSize;
        const expectedW = box.tileSize * obj.Width;
        const expectedH = box.tileSize * obj.Height;

        const calls = (mockCtx.drawImage as any).mock.calls as unknown[][];
        const match = calls.filter(
            (c) =>
                typeof c[1] === "number" &&
                Math.abs((c[1] as number) - expectedX) < 1e-9 &&
                Math.abs((c[2] as number) - expectedY) < 1e-9 &&
                Math.abs((c[3] as number) - expectedW) < 1e-9 &&
                Math.abs((c[4] as number) - expectedH) < 1e-9,
        );
        expect(match.length).toBe(1);
    });

    it("renders the object sprite exactly over its own tile at zoom 100%", () => {
        editor.setZoom(1.0);
        setObjectAt(editor, 10, 18, CACTUS_ID);
        (mockCtx.drawImage as any).mockClear();
        (editor as any).render();

        const box = (editor as any).getDrawBox();
        const obj = (editor as any).fullObjectMap.get(CACTUS_ID);
        const expectedX = box.startX + (10 + obj.Left) * box.tileSize;
        const expectedY = box.startY + (18 + obj.Top) * box.tileSize;

        const calls = (mockCtx.drawImage as any).mock.calls as unknown[][];
        const match = calls.filter(
            (c) =>
                typeof c[1] === "number" &&
                Math.abs((c[1] as number) - expectedX) < 1e-9 &&
                Math.abs((c[2] as number) - expectedY) < 1e-9,
        );
        expect(match.length).toBe(1);
    });
});
