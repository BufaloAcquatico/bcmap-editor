import { describe, it, expect } from "vitest";
import { lineCells } from "../../../src/line";

const path = (cells: { X: number; Y: number }[]) =>
    cells.map((c) => `${c.X},${c.Y}`).join(" ");

describe("lineCells (Bresenham)", () => {
    it("connects two cells horizontally", () => {
        expect(path(lineCells({ X: 1, Y: 1 }, { X: 4, Y: 1 }))).toBe(
            "1,1 2,1 3,1 4,1",
        );
    });

    it("connects two cells vertically", () => {
        expect(path(lineCells({ X: 2, Y: 0 }, { X: 2, Y: 3 }))).toBe(
            "2,0 2,1 2,2 2,3",
        );
    });

    it("walks a perfect diagonal", () => {
        expect(path(lineCells({ X: 0, Y: 0 }, { X: 3, Y: 3 }))).toBe(
            "0,0 1,1 2,2 3,3",
        );
    });

    it("works in either direction", () => {
        const forward = lineCells({ X: 0, Y: 0 }, { X: 3, Y: 3 });
        const backward = lineCells({ X: 3, Y: 3 }, { X: 0, Y: 0 });
        expect(backward).toEqual([...forward].reverse());
    });

    it("approximates a shallow slope without gaps", () => {
        const cells = lineCells({ X: 0, Y: 0 }, { X: 4, Y: 1 });
        expect(cells).toHaveLength(5);
        // every x from 0..4 appears exactly once
        expect(cells.map((c) => c.X).sort((a, b) => a - b)).toEqual([
            0, 1, 2, 3, 4,
        ]);
    });

    it("returns a single cell for a zero-length line", () => {
        expect(lineCells({ X: 5, Y: 5 }, { X: 5, Y: 5 })).toEqual([
            { X: 5, Y: 5 },
        ]);
    });

    it("includes both endpoints for a steep diagonal", () => {
        const cells = lineCells({ X: 0, Y: 0 }, { X: 1, Y: 4 });
        expect(cells[0]).toEqual({ X: 0, Y: 0 });
        expect(cells[cells.length - 1]).toEqual({ X: 1, Y: 4 });
    });
});
