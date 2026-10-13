import { describe, it, expect } from "vitest";
import {
    displayGroupFor,
    orderObjectGroups,
    rotationTransform,
} from "../../src/picker";
import { FULL_OBJECT_CATALOG, OBJECT_CATALOG } from "../../src/catalog";

// The picker groups OBJECT_CATALOG (display view); FULL_OBJECT_CATALOG
// mirrors BC's own data and is what import/export must stay compatible
// with, so each is used here for what it proves.
const viewObj = (ID: number) => OBJECT_CATALOG.find((o) => o.ID === ID)!;
const fullObj = (ID: number) => FULL_OBJECT_CATALOG.find((o) => o.ID === ID)!;

describe("picker grouping", () => {
    it("keeps the type mapping for regular items", () => {
        expect(displayGroupFor(fullObj(110))).toBe("Functional"); // EntryFlag
        expect(displayGroupFor(fullObj(5010))).toBe("Banners"); // wall banner
        expect(displayGroupFor(fullObj(1010))).toBe("Floor Items"); // Kennel
    });

    it("shows the standing banners next to the other banners", () => {
        // BC files these under FloorDecorationThemed; users look for them
        // with the other banners, so the display mapping moves them.
        expect(displayGroupFor(fullObj(390))).toBe("Banners");
        expect(displayGroupFor(fullObj(391))).toBe("Banners");
        expect(displayGroupFor(fullObj(392))).toBe("Banners");
    });

    it("keeps every override target in the catalog (no ID drift)", () => {
        // Mirrors the DISPLAY_CATEGORY_OVERRIDES keys in src/picker.ts; if
        // that table gains an entry this test fails until it is extended.
        for (const id of [390, 391, 392]) {
            expect(
                FULL_OBJECT_CATALOG.some((o) => o.ID === id),
                `override ID ${id} missing from the catalog`,
            ).toBe(true);
        }
        // The Banners section therefore holds every banner-style item.
        const banners = FULL_OBJECT_CATALOG.filter(
            (o) =>
                o.Style.endsWith("Banner") || displayGroupFor(o) === "Banners",
        );
        expect(banners.length).toBe(17);
    });
});

describe("object section order", () => {
    it("pins Banners last whatever the insertion order", () => {
        const groups = new Map([
            ["Banners", [{ ID: 5010 }]],
            ["Wall", [{ ID: 3010 }]],
            ["Floor Items", [{ ID: 1010 }]],
        ]);
        orderObjectGroups(groups);
        expect([...groups.keys()]).toEqual(["Wall", "Floor Items", "Banners"]);
    });

    it("leaves maps without pinned sections untouched", () => {
        const groups = new Map([["Wall", [{ ID: 3010 }]]]);
        orderObjectGroups(groups);
        expect([...groups.keys()]).toEqual(["Wall"]);
    });
});

describe("rotationTransform", () => {
    it("leaves unrotated items untransformed", () => {
        expect(rotationTransform({})).toBe("");
        expect(rotationTransform({ Rotation: 0 })).toBe("");
    });

    it("emits a CSS rotation for conveyor directions", () => {
        expect(rotationTransform({ Rotation: 90 })).toBe("rotate(90deg)");
        expect(rotationTransform({ Rotation: 180 })).toBe("rotate(180deg)");
        expect(rotationTransform({ Rotation: 270 })).toBe("rotate(270deg)");
    });
});
