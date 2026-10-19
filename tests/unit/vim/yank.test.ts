import { describe, it, expect } from "vitest";
import {
    captureRegion,
    normalizeYankSize,
    type YankBuffer,
} from "../../../src/vim/yank";
import type { Region } from "../../../src/vim/motions";

// 4x4 map: tiles "ABCDEFGHIJKLMNOP", objects "abcdefghijklmnop"
const tiles = "ABCDEFGHIJKLMNOP";
const objects = "abcdefghijklmnop";
// Lighting grid: per-cell chars (charCode = effect ID). 10 = blank.
const effects = String.fromCharCode(
    10,
    11,
    12,
    13,
    11,
    12,
    13,
    14,
    12,
    13,
    14,
    15,
    13,
    14,
    15,
    16,
);
const region = (fx: number, fy: number, tx: number, ty: number): Region => ({
    from: { X: fx, Y: fy },
    to: { X: tx, Y: ty },
});

describe("captureRegion", () => {
    it("captures all layers row-major for a 2x2 region", () => {
        const yanked = captureRegion(
            tiles,
            objects,
            effects,
            region(1, 0, 2, 1),
            4,
            4,
        );
        expect(yanked).toEqual({
            width: 2,
            height: 2,
            tiles: "BCFG",
            objects: "bcfg",
            effects: String.fromCharCode(11, 12, 12, 13),
        });
    });

    it("captures a single cell", () => {
        const yanked = captureRegion(
            tiles,
            objects,
            effects,
            region(2, 2, 2, 2),
            4,
            4,
        );
        expect(yanked.tiles).toBe("K");
        expect(yanked.objects).toBe("k");
        expect(yanked.effects.charCodeAt(0)).toBe(14);
        expect(yanked.width).toBe(1);
        expect(yanked.height).toBe(1);
    });

    it("handles regions that run to the map edge", () => {
        const yanked = captureRegion(
            tiles,
            objects,
            effects,
            region(2, 1, 3, 2),
            4,
            4,
        );
        expect(yanked.tiles).toBe("GHKL");
        expect(yanked.objects).toBe("ghkl");
        expect(yanked.effects.charCodeAt(0)).toBe(13);
    });

    it("keeps layer order (tiles, objects, effects)", () => {
        const yanked = captureRegion(
            tiles,
            objects,
            effects,
            region(0, 0, 0, 0),
            4,
            4,
        );
        expect(yanked.tiles).toBe("A");
        expect(yanked.objects).toBe("a");
        expect(yanked.effects.charCodeAt(0)).toBe(10);
    });
});

describe("normalizeYankSize", () => {
    it("renders the region size label", () => {
        const buffer: YankBuffer = {
            width: 3,
            height: 2,
            tiles: "",
            objects: "",
            effects: "",
        };
        expect(normalizeYankSize(buffer)).toBe("3x2");
    });

    it("returns null when nothing was yanked", () => {
        expect(normalizeYankSize(null)).toBeNull();
    });
});
