import { describe, it, expect, beforeEach, vi } from "vitest";
import { BCMapEditor } from "../../src/editor";

// Minimal DOM mock for constructor
const mockCtx = {
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    setTransform: () => {},
    drawImage: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
} as any;
const mockCanvas = {
    id: "testCanvas",
    width: 800,
    height: 600,
    getContext: () => mockCtx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener: () => {},
} as any;
global.document = {
    getElementById: (id: string) => (id === "testCanvas" ? mockCanvas : null),
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: () => ({}),
} as any;
global.window = { addEventListener: () => {} } as any;
global.Image = function () {
    this.onerror = null;
    this.onload = null;
    this.src = "";
} as any;

// Build a tiles string from a "x,y": tileID description. Everything not listed
// defaults to grass (210).
function tiles(spec: Record<string, number>): string {
    const arr = new Array(40 * 40).fill(String.fromCharCode(210));
    for (const [key, id] of Object.entries(spec)) {
        const [x, y] = key.split(",").map(Number);
        arr[y * 40 + x] = String.fromCharCode(id);
    }
    return arr.join("");
}

describe("Wall effect computation (BC ChatRoomMapView port)", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        editor = new BCMapEditor("testCanvas");
    });

    it("returns 1 for an isolated wall", () => {
        (editor as any).mapData.Tiles = tiles({ "5,5": 1000 });
        expect((editor as any).computeWallEffect(5, 5)).toBe(1);
    });

    it("returns 0 when all five neighbors are walls", () => {
        (editor as any).mapData.Tiles = tiles({
            "4,5": 1000,
            "6,5": 1000,
            "4,6": 1000,
            "5,6": 1000,
            "6,6": 1000,
            "5,5": 1000,
        });
        expect((editor as any).computeWallEffect(5, 5)).toBe(0);
    });

    it("returns 4 for a horizontal wall run with a floor in front", () => {
        (editor as any).mapData.Tiles = tiles({
            "4,5": 1000,
            "5,5": 1000,
            "6,5": 1000,
        });
        expect((editor as any).computeWallEffect(5, 5)).toBe(4);
    });

    it("treats full-catalog-only walls as walls for neighbors", () => {
        // 1227 (SpiderWeb) exists only in the FULL_TILE_CATALOG, not in the
        // display pickers. It sits to the left of a display wall at (5,5).
        (editor as any).mapData.Tiles = tiles({ "4,5": 1227, "5,5": 1000 });
        // CW = true (via full catalog), so (5,5) is a left-corner wall (3).
        expect((editor as any).computeWallEffect(5, 5)).toBe(3);
    });

    it("returns 10 for a wall with a single left-and-below connection", () => {
        // Wall to the left and below-center, everything else floor: this is
        // case 10 of ChatRoomMapViewFindWallEffectTile (not a -1 fallthrough).
        (editor as any).mapData.Tiles = tiles({
            "4,5": 1000,
            "5,5": 1000,
            "5,6": 1000,
        });
        expect((editor as any).computeWallEffect(5, 5)).toBe(10);
    });

    it("returns -1 for non-wall and out-of-bounds tiles", () => {
        (editor as any).mapData.Tiles = tiles({});
        expect((editor as any).computeWallEffect(5, 5)).toBe(-1);
        expect((editor as any).computeWallEffect(-1, 0)).toBe(-1);
        expect((editor as any).computeWallEffect(0, 40)).toBe(-1);
    });
});

describe("Floor wall effect computation (BC ChatRoomMapViewFloorWallEffect port)", () => {
    let editor: BCMapEditor;

    beforeEach(() => {
        editor = new BCMapEditor("testCanvas");
    });

    it("returns 50 for a floor above a wall with floor on both sides", () => {
        (editor as any).mapData.Tiles = tiles({ "5,6": 1000 });
        expect((editor as any).computeFloorWallEffect(5, 5)).toBe(50);
    });

    it("returns 53 when all three tiles below are walls", () => {
        (editor as any).mapData.Tiles = tiles({
            "4,6": 1000,
            "5,6": 1000,
            "6,6": 1000,
        });
        expect((editor as any).computeFloorWallEffect(5, 5)).toBe(53);
    });

    it("returns 11 for a HalfWall with a single wall below", () => {
        (editor as any).mapData.Tiles = tiles({ "5,5": 199, "5,6": 1000 });
        expect((editor as any).computeFloorWallEffect(5, 5)).toBe(11);
    });

    it("returns 0 for a HalfWall with walls below on every side", () => {
        (editor as any).mapData.Tiles = tiles({
            "5,5": 199,
            "4,6": 1000,
            "5,6": 1000,
            "6,6": 1000,
        });
        expect((editor as any).computeFloorWallEffect(5, 5)).toBe(0);
    });

    it("returns -1 with no wall underneath", () => {
        (editor as any).mapData.Tiles = tiles({});
        expect((editor as any).computeFloorWallEffect(5, 5)).toBe(-1);
    });

    it("returns -1 on the very last row", () => {
        (editor as any).mapData.Tiles = tiles({ "5,39": 210 });
        expect((editor as any).computeFloorWallEffect(5, 39)).toBe(-1);
    });
});
