import { describe, it, expect, beforeEach, vi } from "vitest";
import { BCMapEditor } from "../../src/editor";
import { MAP_CELL_COUNT, MAP_WIDTH } from "../../src/mapdata";
import { BLANK_EFFECT_ID, EFFECT_BY_ID } from "../../src/effects";

// Every fillRect records the fillStyle in force, so render assertions can
// look for a specific overlay colour.
const fills: string[] = [];

const mockCtx: any = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(() => {
        fills.push(String(mockCtx.fillStyle));
    }),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineDashOffset: 0,
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
};

const mockCanvas: any = {
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
    toDataURL: vi.fn(() => "data:image/jpeg;base64,AAAA"),
};

const mockElements: Record<string, any> = {
    testCanvas: mockCanvas,
    zoomLevel: { textContent: "" },
    statusSelection: { textContent: "" },
    statusPosition: { textContent: "" },
    statusVimMode: {
        textContent: "",
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
    },
    controlsHelp: { style: {} },
    tileCategories: {
        style: {},
        replaceChildren: vi.fn(),
        appendChild: vi.fn(),
        querySelectorAll: vi.fn(() => []),
    },
    objectCategories: {
        style: {},
        replaceChildren: vi.fn(),
        appendChild: vi.fn(),
        querySelectorAll: vi.fn(() => []),
    },
    effectCategories: {
        style: {},
        replaceChildren: vi.fn(),
        appendChild: vi.fn(),
        querySelectorAll: vi.fn(() => []),
    },
};

global.document = {
    getElementById: vi.fn((id) => mockElements[id] || null),
    querySelector: vi.fn(() => null),
    querySelectorAll: vi.fn(() => []),
    createElement: vi.fn(() => ({
        ...mockCanvas,
        getContext: vi.fn(() => mockCtx),
    })),
} as any;
global.window = { addEventListener: vi.fn(), devicePixelRatio: 1 } as any;
global.Image = vi.fn(() => ({ onerror: null, onload: null, src: "" })) as any;

/** Paint one cell on the current layer via the private mouse-paint path. */
function paint(editor: BCMapEditor, x: number, y: number): void {
    (editor as any).paintAt({ X: x, Y: y });
}

const index = (x: number, y: number) => x + y * MAP_WIDTH;

describe("Lighting layer", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        fills.length = 0;
        editor = new BCMapEditor("testCanvas");
    });

    it("defaults the lighting layer to ShadowLight with the overlay on", () => {
        editor.setCurrentLayer("effect");
        expect(editor.getCurrentLayer()).toBe("effect");
        expect(editor.getSelectedEffect()?.ID).toBe(11);
        expect(editor.getEffectsVisible()).toBe(true);
        expect(editor.getMapData().Effects).toBeUndefined();
    });

    it("paints the selected effect and keeps the rest Blank", () => {
        editor.setCurrentLayer("effect");
        paint(editor, 5, 7);
        const effects = editor.getMapData().Effects!;
        expect(effects).toBeDefined();
        expect(effects.length).toBe(MAP_CELL_COUNT);
        expect(effects[index(5, 7)]).toBe(11);
        expect(effects[0]).toBe(BLANK_EFFECT_ID);
        expect(effects[index(6, 7)]).toBe(BLANK_EFFECT_ID);
    });

    it("paints a different selected effect", () => {
        editor.setCurrentLayer("effect");
        editor.setSelectedEffect(EFFECT_BY_ID.get(13) ?? null);
        paint(editor, 0, 0);
        expect(editor.getMapData().Effects![0]).toBe(13);
    });

    it("drops the grid back to none when the last effect is erased", () => {
        editor.setCurrentLayer("effect");
        paint(editor, 2, 2);
        expect(editor.getMapData().Effects).toBeDefined();
        editor.setSelectedEffect(EFFECT_BY_ID.get(BLANK_EFFECT_ID) ?? null);
        paint(editor, 2, 2);
        expect(editor.getMapData().Effects).toBeUndefined();
    });

    it("pasting a yank buffer writes its lighting", () => {
        (editor as any).yankBuffer = {
            width: 1,
            height: 1,
            tiles: editor.getMapData().Tiles[0],
            objects: editor.getMapData().Objects[0],
            effects: String.fromCharCode(16),
        };
        (editor as any).pasteYank({ X: 3, Y: 3 });
        expect(editor.getMapData().Effects![index(3, 3)]).toBe(16);
    });
});

describe("Lighting visibility", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        fills.length = 0;
        editor = new BCMapEditor("testCanvas");
    });

    it("toggles visibility and back", () => {
        expect(editor.getEffectsVisible()).toBe(true);
        editor.toggleEffects();
        expect(editor.getEffectsVisible()).toBe(false);
        editor.toggleEffects();
        expect(editor.getEffectsVisible()).toBe(true);
    });

    it("toggling is undoable (undo then redo restore visibility)", () => {
        editor.toggleEffects();
        expect(editor.getEffectsVisible()).toBe(false);
        expect(editor.canUndo()).toBe(true);
        editor.undo();
        expect(editor.getEffectsVisible()).toBe(true);
        editor.redo();
        expect(editor.getEffectsVisible()).toBe(false);
    });

    it("draws the overlay colour when on and omits it when off", () => {
        editor.setCurrentLayer("effect");
        editor.setSelectedEffect(EFFECT_BY_ID.get(14) ?? null); // TintRed
        paint(editor, 0, 0);

        fills.length = 0;
        (editor as any).render();
        expect(fills).toContain("rgba(255, 0, 0, 0.3)");

        editor.toggleEffects();
        fills.length = 0;
        (editor as any).render();
        expect(fills).not.toContain("rgba(255, 0, 0, 0.3)");
    });

    it(":lighting command toggles the overlay", () => {
        editor.handleVimCommand(":lighting");
        expect(editor.getEffectsVisible()).toBe(false);
        editor.handleVimCommand("lighting");
        expect(editor.getEffectsVisible()).toBe(true);
    });
});

describe("Lighting persistence", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        fills.length = 0;
        editor = new BCMapEditor("testCanvas");
    });

    it("exports a combined code and round-trips through import", () => {
        editor.setCurrentLayer("effect");
        editor.setSelectedEffect(EFFECT_BY_ID.get(14) ?? null);
        paint(editor, 1, 1);
        const code = editor.exportMap("test");
        expect(code.includes("@")).toBe(true);

        const other = new BCMapEditor("testCanvas");
        other.importMap(code);
        expect(other.getMapData().Effects![index(1, 1)]).toBe(14);
        expect(other.getMapData().Effects![index(1, 2)]).toBe(BLANK_EFFECT_ID);
    });

    it("includes lighting in the slot thumbnail even when the overlay is off", () => {
        editor.setCurrentLayer("effect");
        editor.setSelectedEffect(EFFECT_BY_ID.get(17) ?? null); // GlowYellow
        paint(editor, 4, 4);
        editor.toggleEffects(); // hide the live overlay

        fills.length = 0;
        editor.captureMapThumbnail();
        expect(fills).toContain("rgba(255, 255, 0, 0.3)");
    });
});
