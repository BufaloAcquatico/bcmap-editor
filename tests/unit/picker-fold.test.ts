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

    it("lists the Banners section last in the object picker", () => {
        editor.populatePickers();
        const tileCount = (editor as any).picker.tileCategoryEls.length;
        const headers = created.filter(
            (el: any) =>
                typeof el.className === "string" &&
                el.className.includes("category-header"),
        );
        // Each header appends its caret first, then its label span; the
        // label carries the group name in creation (= display) order.
        const labelOf = (header: any) =>
            header.appendChild.mock.calls
                .map((c: any[]) => c[0])
                .find(
                    (el: any) =>
                        el &&
                        typeof el.textContent === "string" &&
                        el.textContent !== "",
                ).textContent;
        const objectNames = headers
            .slice(tileCount)
            .map((h: any) => labelOf(h));
        expect(objectNames.length).toBeGreaterThan(0);
        expect(objectNames[objectNames.length - 1]).toBe("Banners");
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

    it("does not replay the expand animation on a redundant fold", () => {
        editor.populatePickers();
        const picker = (editor as any).picker;
        const entry = picker.tileCategoryEls[0];
        let lastAnim: any = null;
        entry.content.animate = vi.fn(() => (lastAnim = { onfinish: null }));
        entry.content.getAnimations = vi.fn(() => []);
        picker.setCategoryCollapsed(entry, false);
        expect(entry.content.animate).toHaveBeenCalledTimes(1);
        // Already open: state syncs, animation does not replay.
        picker.setCategoryCollapsed(entry, false);
        expect(entry.content.animate).toHaveBeenCalledTimes(1);
        expect(entry.collapsed).toBe(false);
        expect(entry.content.style.display).toBe("");
        // Collapse arms the fade; firing it hides, and a redundant
        // collapse stays silent afterwards.
        picker.setCategoryCollapsed(entry, true);
        expect(entry.content.animate).toHaveBeenCalledTimes(2);
        lastAnim.onfinish();
        expect(entry.content.style.display).toBe("none");
        picker.setCategoryCollapsed(entry, true);
        expect(entry.content.animate).toHaveBeenCalledTimes(2);
    });

    it("rotates conveyor picker icons so directions differ", () => {
        // One shared Style per direction set; Rotation carries direction.
        const conveyors = [0, 180, 270, 90].map((degrees, i) => ({
            ID: 3500 + i,
            Type: "Functional",
            Style: "ConveyorBelt1",
            Top: 0,
            Left: 0,
            ...(degrees === 0 ? {} : { Rotation: degrees }),
        }));
        (editor as any).picker.populate([], conveyors);
        const icons = created.filter((el) => el.className === "sprite-item");
        expect(icons).toHaveLength(4);
        expect(icons.map((el) => el.style.transform ?? "")).toEqual([
            "",
            "rotate(180deg)",
            "rotate(270deg)",
            "rotate(90deg)",
        ]);
    });

    it("shows the eraser first even when Blank sorts last in game order", () => {
        // Bathroom's Blank (3281) comes after every other Bathroom entry.
        const bathroom = [
            { ID: 260, Type: "Bathroom", Style: "LaundryMachine" },
            { ID: 3024, Type: "Bathroom", Style: "Sink" },
            { ID: 3281, Type: "Bathroom", Style: "Blank" },
        ];
        (editor as any).picker.populate([], bathroom);
        const icons = created.filter((el) => el.className === "sprite-item");
        expect(icons).toHaveLength(3);
        expect(icons[0].title).toBe("Blank (Erase)");
    });
});
