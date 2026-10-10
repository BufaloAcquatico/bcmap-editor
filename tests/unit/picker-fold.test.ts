import { describe, it, expect, beforeEach, vi } from "vitest";
import { BCMapEditor } from "../../src/editor";

const created: any[] = [];

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
mockElements["tileCategories"] = {
    style: {},
    innerHTML: "",
    replaceChildren: vi.fn(),
    appendChild: vi.fn(),
    querySelectorAll: vi.fn(() => []),
};
mockElements["objectCategories"] = {
    style: {},
    innerHTML: "",
    replaceChildren: vi.fn(),
    appendChild: vi.fn(),
    querySelectorAll: vi.fn(() => []),
};

global.document = {
    getElementById: vi.fn((id) => mockElements[id] || null),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    createElement: vi.fn(() => {
        const el: any = {
            className: "",
            textContent: "",
            style: {},
            title: "",
            innerHTML: "",
            addEventListener: vi.fn(),
            appendChild: vi.fn(),
            querySelectorAll: vi.fn(() => []),
            getAttribute: vi.fn(() => null),
            classList: {
                add: vi.fn(),
                remove: vi.fn(),
                toggle: vi.fn(),
            },
        };
        created.push(el);
        return el;
    }),
} as any;
global.window = { addEventListener: vi.fn(), devicePixelRatio: 1 } as any;
global.Image = vi.fn(() => ({ onerror: null, onload: null, src: "" })) as any;

describe("Foldable pickers", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        created.length = 0;
        editor = new BCMapEditor("testCanvas");
    });

    it("builds category entries that start collapsed", () => {
        editor.populatePickers();
        const tileEntries = (editor as any).picker.tileCategoryEls;
        const objectEntries = (editor as any).picker.objectCategoryEls;
        expect(tileEntries.length).toBeGreaterThan(0);
        expect(objectEntries.length).toBeGreaterThan(0);
        expect(tileEntries.every((e: any) => e.collapsed)).toBe(true);
        expect(objectEntries.every((e: any) => e.collapsed)).toBe(true);
    });

    it("toggles a category when its header is clicked", () => {
        editor.populatePickers();
        const entries = (editor as any).picker.tileCategoryEls;
        const headers = created.filter(
            (el) =>
                typeof el.className === "string" &&
                el.className.includes("category-header"),
        );
        const clickCall = headers[0].addEventListener.mock.calls.find(
            (c: any[]) => c[0] === "click",
        );
        const handler = clickCall[1];
        handler();
        expect(entries[0].collapsed).toBe(false);
        handler();
        expect(entries[0].collapsed).toBe(true);
    });

    it("filters without throwing and stores the term", () => {
        editor.populatePickers();
        expect(() => editor.filterPickers("Grass")).not.toThrow();
        expect((editor as any).picker.searchTerm).toBe("Grass");
        expect(() => editor.filterPickers("")).not.toThrow();
        expect((editor as any).picker.searchTerm).toBe("");
    });

    it("renders Blank picker items as bundled inline SVG, not a CDN glyph", () => {
        editor.populatePickers();
        const blanks = created.filter(
            (el) =>
                el.className === "sprite-item" && el.title === "Blank (Erase)",
        );
        expect(blanks.length).toBeGreaterThan(0);
        for (const item of blanks) {
            expect(item.innerHTML).toContain("picker-eraser-icon");
            expect(item.innerHTML).toContain("<svg");
            expect(item.innerHTML).not.toContain("bi-erase");
        }
    });
});
