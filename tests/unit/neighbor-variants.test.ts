import { describe, it, expect, beforeEach, vi } from "vitest";
import { BCMapEditor } from "../../src/editor";
import { MAP_WIDTH } from "../../src/mapdata";

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
global.Image = vi.fn(() => ({ onerror: null, onload: null, src: "" })) as any;

const COUCH = 710;
const BED = 720;
const RAILROAD = 750;
const VELOUR = 2033;
const CACTUS = 2057;
const BLANK = 100;
const KITCHEN_COUNTER = 330;
const KITCHEN_SINK = 331;
const FARM_FENCE = 2034;

function mapWith(editor: BCMapEditor, cells: [number, number, number][]): void {
    const data = editor.getMapData();
    const arr = Array.from({ length: MAP_WIDTH * MAP_WIDTH }, (_, i) =>
        data.Objects.charCodeAt(i),
    );
    for (const [x, y, id] of cells) arr[x + y * MAP_WIDTH] = id;
    data.Objects = String.fromCharCode(...arr);
}

function variantAt(editor: BCMapEditor, x: number, y: number): string {
    const obj = (editor as any).fullObjectMap.get(
        editor.getMapData().Objects.charCodeAt(x + y * MAP_WIDTH),
    );
    return (editor as any).resolveVariantImageName(x, y, obj);
}

describe("Neighbor-aware variant selection (Change 4)", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        vi.clearAllMocks();
        editor = new BCMapEditor("testCanvas");
    });

    it("single couch renders the Small variant", () => {
        mapWith(editor, [[5, 5, COUCH]]);
        expect(variantAt(editor, 5, 5)).toBe("CouckPinkSmall");
    });

    it("two adjacent couches render Left/Right", () => {
        mapWith(editor, [
            [5, 5, COUCH],
            [6, 5, COUCH],
        ]);
        expect(variantAt(editor, 5, 5)).toBe("CouchPinkLeft");
        expect(variantAt(editor, 6, 5)).toBe("CouchPinkRight");
    });

    it("three adjacent couches render Left/Middle/Right", () => {
        mapWith(editor, [
            [5, 5, COUCH],
            [6, 5, COUCH],
            [7, 5, COUCH],
        ]);
        expect(variantAt(editor, 5, 5)).toBe("CouchPinkLeft");
        expect(variantAt(editor, 6, 5)).toBe("CouchPinkMiddle");
        expect(variantAt(editor, 7, 5)).toBe("CouchPinkRight");
    });

    it("does not wrap neighbors across row boundaries", () => {
        // (39,5) left-neighbor slot would be index 38+5*40 (fine), but its
        // right slot (40+5*40) is out of bounds and (0,6) must not count.
        mapWith(editor, [
            [39, 5, COUCH],
            [0, 6, COUCH],
        ]);
        expect(variantAt(editor, 39, 5)).toBe("CouckPinkSmall");
        expect(variantAt(editor, 0, 6)).toBe("CouckPinkSmall");
    });

    it("different IDs are not neighbors", () => {
        mapWith(editor, [
            [5, 5, COUCH],
            [6, 5, BED],
        ]);
        expect(variantAt(editor, 5, 5)).toBe("CouckPinkSmall");
        expect(variantAt(editor, 6, 5)).toBe("BedBlueSmall");
    });

    it("isolated railroad renders the default Railroad sprite", () => {
        mapWith(editor, [[5, 5, RAILROAD]]);
        expect(variantAt(editor, 5, 5)).toBe("Railroad");
    });

    it("horizontal railroad pair renders East/West suffixes", () => {
        mapWith(editor, [
            [5, 5, RAILROAD],
            [6, 5, RAILROAD],
        ]);
        expect(variantAt(editor, 5, 5)).toBe("RailroadEast");
        expect(variantAt(editor, 6, 5)).toBe("RailroadWest");
    });

    it("vertical railroad pair renders North/South suffixes", () => {
        mapWith(editor, [
            [5, 5, RAILROAD],
            [5, 6, RAILROAD],
        ]);
        expect(variantAt(editor, 5, 5)).toBe("RailroadSouth");
        expect(variantAt(editor, 5, 6)).toBe("RailroadNorth");
    });

    it("railroad cross renders the full NorthSouthEastWest suffix", () => {
        mapWith(editor, [
            [5, 5, RAILROAD],
            [5, 4, RAILROAD],
            [5, 6, RAILROAD],
            [4, 5, RAILROAD],
            [6, 5, RAILROAD],
        ]);
        expect(variantAt(editor, 5, 5)).toBe("RailroadNorthSouthEastWest");
    });

    it("velour rope barrier follows single/Left/Right/Middle rules", () => {
        mapWith(editor, [[5, 5, VELOUR]]);
        expect(variantAt(editor, 5, 5)).toBe("VelourRopeBarrier");
        mapWith(editor, [
            [5, 5, VELOUR],
            [6, 5, VELOUR],
            [7, 5, VELOUR],
        ]);
        expect(variantAt(editor, 5, 5)).toBe("VelourRopeBarrierLeft");
        expect(variantAt(editor, 6, 5)).toBe("VelourRopeBarrierMiddle");
        expect(variantAt(editor, 7, 5)).toBe("VelourRopeBarrierRight");
    });

    it("non-expandable objects keep their own style", () => {
        mapWith(editor, [
            [5, 5, CACTUS],
            [6, 5, CACTUS],
        ]);
        expect(variantAt(editor, 5, 5)).toBe("Cactus");
        expect(variantAt(editor, BLANK % MAP_WIDTH, 0)).toBeDefined();
    });

    it("joins kitchen counters across different IDs but not EmptySpace", () => {
        mapWith(editor, [
            [5, 5, KITCHEN_COUNTER],
            [6, 5, KITCHEN_SINK],
        ]);
        expect(variantAt(editor, 5, 5)).toBe("KitchenCounterLeft");
        // Legacy blank IDs are EmptySpace in R134 and must not connect.
        mapWith(editor, [
            [5, 5, KITCHEN_COUNTER],
            [6, 5, 1399],
        ]);
        expect(variantAt(editor, 5, 5)).toBe("KitchenCounterSingle");
    });

    it("alternates fence middle/post textures along a same-ID run", () => {
        mapWith(editor, [
            [3, 5, FARM_FENCE],
            [4, 5, FARM_FENCE],
            [5, 5, FARM_FENCE],
            [6, 5, FARM_FENCE],
        ]);
        expect(variantAt(editor, 3, 5)).toBe("FarmFenceLeft");
        expect(variantAt(editor, 4, 5)).toBe("FarmFenceMiddle");
        expect(variantAt(editor, 5, 5)).toBe("FarmFenceMiddlePost");
        expect(variantAt(editor, 6, 5)).toBe("FarmFenceRight");
    });
});
