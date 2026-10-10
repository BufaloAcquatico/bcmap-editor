import { describe, it, expect } from "vitest";
import {
    EXPANDABLE_LEFT_RIGHT,
    findFloorWallEffect,
    findWallEffectTile,
    RAILROAD_PREVIEW_ID,
    railroadStyleName,
    resolveExpandableVariant,
} from "../../src/render";

// No DOM/canvas mocks needed: every function under test is pure.

describe("findWallEffectTile (BC truth table)", () => {
    const cases: Array<
        [[boolean, boolean, boolean, boolean, boolean], number]
    > = [
        [[true, true, true, true, true], 0],
        [[false, false, false, false, false], 1],
        [[false, true, false, false, false], 2],
        [[true, false, false, false, false], 3],
        [[true, true, false, false, false], 4],
        [[false, false, true, true, true], 5],
        [[false, false, true, true, false], 6],
        [[false, false, false, true, true], 7],
        [[true, true, false, true, false], 8],
        [[false, true, false, true, false], 9],
        [[true, false, false, true, false], 10],
        [[false, false, false, true, false], 11],
        [[false, true, true, true, true], 14],
        [[true, false, true, true, true], 15],
        [[true, false, true, true, false], 16],
        [[false, true, false, true, true], 17],
        [[true, true, true, true, false], 18],
        [[true, true, false, true, true], 19],
        [[false, true, true, true, false], 20],
        [[true, false, false, true, true], 21],
    ];
    for (const [flags, expected] of cases) {
        it(`resolves ${flags.map((f) => (f ? 1 : 0)).join("")} to ${expected}`, () => {
            expect(findWallEffectTile(...flags)).toBe(expected);
        });
    }

    it("keeps BC's branch shadowing verbatim (rules 12/13 unreachable)", () => {
        // Rule 12's pattern matches rule 10 first; rule 13's matches rule 9.
        expect(findWallEffectTile(true, false, false, true, false)).toBe(10);
        expect(findWallEffectTile(false, true, false, true, false)).toBe(9);
    });
});

describe("findFloorWallEffect", () => {
    it("resolves the 50-53 floor set", () => {
        expect(findFloorWallEffect(false, true, false, false)).toBe(50);
        expect(findFloorWallEffect(false, true, true, false)).toBe(51);
        expect(findFloorWallEffect(true, true, false, false)).toBe(52);
        expect(findFloorWallEffect(true, true, true, false)).toBe(53);
    });

    it("resolves the HalfWall 0/11-13 set", () => {
        expect(findFloorWallEffect(false, true, false, true)).toBe(11);
        expect(findFloorWallEffect(false, true, true, true)).toBe(12);
        expect(findFloorWallEffect(true, true, false, true)).toBe(13);
        expect(findFloorWallEffect(true, true, true, true)).toBe(0);
    });

    it("falls through to -1 with no southern wall", () => {
        expect(findFloorWallEffect(false, false, false, false)).toBe(-1);
        // HalfWall with no match falls through to the floor set (no match).
        expect(findFloorWallEffect(false, false, false, true)).toBe(-1);
        expect(findFloorWallEffect(true, false, true, false)).toBe(-1);
    });
});

describe("expandable variants", () => {
    it("maps neighbors to Middle/Right/Left/Single", () => {
        expect(resolveExpandableVariant("CouchPink", "S", true, true)).toBe(
            "CouchPinkMiddle",
        );
        expect(resolveExpandableVariant("CouchPink", "S", true, false)).toBe(
            "CouchPinkRight",
        );
        expect(resolveExpandableVariant("CouchPink", "S", false, true)).toBe(
            "CouchPinkLeft",
        );
        expect(resolveExpandableVariant("CouchPink", "S", false, false)).toBe(
            "S",
        );
    });

    it("covers the known expandable catalog IDs", () => {
        expect(EXPANDABLE_LEFT_RIGHT.get(710)?.prefix).toBe("CouchPink");
        expect(EXPANDABLE_LEFT_RIGHT.get(2033)?.prefix).toBe(
            "VelourRopeBarrier",
        );
        expect(RAILROAD_PREVIEW_ID).toBe(750);
    });
});

describe("railroadStyleName", () => {
    it("builds suffixes in strict N/S/E/W order", () => {
        expect(railroadStyleName([false, false, false, false])).toBe(
            "Railroad",
        );
        expect(railroadStyleName([true, false, false, false])).toBe(
            "RailroadNorth",
        );
        expect(railroadStyleName([true, true, false, false])).toBe(
            "RailroadNorthSouth",
        );
        expect(railroadStyleName([false, true, false, true])).toBe(
            "RailroadSouthWest",
        );
        expect(railroadStyleName([true, true, true, true])).toBe(
            "RailroadNorthSouthEastWest",
        );
    });

    it("produces 16 unique names over all masks", () => {
        const names = new Set<string>();
        for (let mask = 0; mask < 16; mask++) {
            names.add(
                railroadStyleName([
                    !!(mask & 1),
                    !!(mask & 2),
                    !!(mask & 4),
                    !!(mask & 8),
                ]),
            );
        }
        expect(names.size).toBe(16);
    });
});
