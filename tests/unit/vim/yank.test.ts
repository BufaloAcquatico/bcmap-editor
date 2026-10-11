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
const region = (fx: number, fy: number, tx: number, ty: number): Region => ({
    from: { X: fx, Y: fy },
    to: { X: tx, Y: ty },
});

describe("captureRegion", () => {
    it("captures both layers row-major for a 2x2 region", () => {
        const yanked = captureRegion(tiles, objects, region(1, 0, 2, 1), 4, 4);
        expect(yanked).toEqual({
            width: 2,
            height: 2,
            tiles: "BCFG",
            objects: "bcfg",
        });
    });

    it("captures a single cell", () => {
        const yanked = captureRegion(tiles, objects, region(2, 2, 2, 2), 4, 4);
        expect(yanked.tiles).toBe("K");
        expect(yanked.objects).toBe("k");
        expect(yanked.width).toBe(1);
        expect(yanked.height).toBe(1);
    });

    it("handles regions that run to the map edge", () => {
        const yanked = captureRegion(tiles, objects, region(2, 1, 3, 2), 4, 4);
        expect(yanked.tiles).toBe("GHKL");
        expect(yanked.objects).toBe("ghkl");
    });

    it("keeps layer order (tiles, objects)", () => {
        const yanked = captureRegion(tiles, objects, region(0, 0, 0, 0), 4, 4);
        expect(yanked.tiles).toBe("A");
        expect(yanked.objects).toBe("a");
    });
});

describe("normalizeYankSize", () => {
    it("renders the region size label", () => {
        const buffer: YankBuffer = {
            width: 3,
            height: 2,
            tiles: "",
            objects: "",
        };
        expect(normalizeYankSize(buffer)).toBe("3x2");
    });

    it("returns null when nothing was yanked", () => {
        expect(normalizeYankSize(null)).toBeNull();
    });
});
