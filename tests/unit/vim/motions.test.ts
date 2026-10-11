import { describe, it, expect } from "vitest";
import {
    clipRegion,
    isCountDigit,
    lineEnd,
    lineStart,
    motionDelta,
    normalizeRegion,
    regionCells,
    regionSize,
    stepFrom,
    type GridPos,
} from "../../../src/vim/motions";

const MAP_W = 40;
const MAP_H = 40;

describe("motionDelta", () => {
    it("maps hjkl and arrows to unit vectors", () => {
        expect(motionDelta("h")).toEqual([-1, 0]);
        expect(motionDelta("j")).toEqual([0, 1]);
        expect(motionDelta("k")).toEqual([0, -1]);
        expect(motionDelta("l")).toEqual([1, 0]);
        expect(motionDelta("ArrowLeft")).toEqual([-1, 0]);
        expect(motionDelta("ArrowDown")).toEqual([0, 1]);
        expect(motionDelta("ArrowUp")).toEqual([0, -1]);
        expect(motionDelta("ArrowRight")).toEqual([1, 0]);
    });

    it("returns null for non-motion keys", () => {
        expect(motionDelta("x")).toBeNull();
        expect(motionDelta("0")).toBeNull();
        expect(motionDelta("$")).toBeNull();
        expect(motionDelta("Enter")).toBeNull();
        expect(motionDelta("H")).toBeNull();
    });
});

describe("isCountDigit", () => {
    it("accepts 1-9 as count starts", () => {
        expect(isCountDigit("1")).toBe(true);
        expect(isCountDigit("9")).toBe(true);
    });

    it("rejects 0, letters and empty input", () => {
        expect(isCountDigit("0")).toBe(false);
        expect(isCountDigit("g")).toBe(false);
        expect(isCountDigit("")).toBe(false);
        expect(isCountDigit("12")).toBe(false);
    });
});

describe("stepFrom", () => {
    it("moves by count cells", () => {
        expect(stepFrom({ X: 5, Y: 5 }, 0, 1, 3, MAP_W, MAP_H)).toEqual({
            X: 5,
            Y: 8,
        });
        expect(stepFrom({ X: 5, Y: 5 }, 1, 0, 1, MAP_W, MAP_H)).toEqual({
            X: 6,
            Y: 5,
        });
    });

    it("clamps at the map edges", () => {
        expect(stepFrom({ X: 38, Y: 0 }, 1, 0, 5, MAP_W, MAP_H)).toEqual({
            X: 39,
            Y: 0,
        });
        expect(stepFrom({ X: 0, Y: 2 }, -1, 0, 9, MAP_W, MAP_H)).toEqual({
            X: 0,
            Y: 2,
        });
        expect(stepFrom({ X: 39, Y: 39 }, 0, 1, 9, MAP_W, MAP_H)).toEqual({
            X: 39,
            Y: 39,
        });
    });

    it("treats a zero or negative count as one step", () => {
        expect(stepFrom({ X: 5, Y: 5 }, 0, 1, 0, MAP_W, MAP_H)).toEqual({
            X: 5,
            Y: 6,
        });
    });
});

describe("line bounds", () => {
    it("lineStart snaps to column 0 keeping the row", () => {
        expect(lineStart({ X: 17, Y: 3 })).toEqual({ X: 0, Y: 3 });
    });

    it("lineEnd snaps to the last column of the row", () => {
        expect(lineEnd({ X: 4, Y: 3 }, MAP_W)).toEqual({ X: 39, Y: 3 });
    });
});

describe("region helpers", () => {
    it("normalizes a backwards drag", () => {
        const r = normalizeRegion({ X: 10, Y: 8 }, { X: 4, Y: 2 });
        expect(r.from).toEqual({ X: 4, Y: 2 });
        expect(r.to).toEqual({ X: 10, Y: 8 });
    });

    it("keeps a forward drag as-is", () => {
        const r = normalizeRegion({ X: 4, Y: 2 }, { X: 10, Y: 8 });
        expect(r.from).toEqual({ X: 4, Y: 2 });
        expect(r.to).toEqual({ X: 10, Y: 8 });
    });

    it("reports inclusive region size", () => {
        expect(
            regionSize(normalizeRegion({ X: 4, Y: 2 }, { X: 6, Y: 3 })),
        ).toEqual({ width: 3, height: 2 });
    });

    it("iterates every cell of the region", () => {
        const cells = regionCells(
            normalizeRegion({ X: 4, Y: 2 }, { X: 5, Y: 3 }),
        );
        expect(cells).toHaveLength(4);
        expect(cells).toContainEqual({ X: 4, Y: 2 });
        expect(cells).toContainEqual({ X: 5, Y: 3 });
    });

    it("clips a region that runs past the map edge", () => {
        const clipped = clipRegion(
            normalizeRegion({ X: 36, Y: 36 }, { X: 44, Y: 44 }),
            MAP_W,
            MAP_H,
        );
        expect(clipped).toEqual({
            from: { X: 36, Y: 36 },
            to: { X: 39, Y: 39 },
        });
    });

    it("returns null when the region lies fully outside the map", () => {
        expect(
            clipRegion(
                normalizeRegion({ X: -5, Y: 36 }, { X: -1, Y: 44 }),
                MAP_W,
                MAP_H,
            ),
        ).toBeNull();
    });
});
