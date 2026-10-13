import { describe, it, expect } from "vitest";
import {
    blankFirst,
    displayGroupFor,
    orderObjectGroups,
    rotationTransform,
    sectionLabelFor,
} from "../../src/picker";
import { FULL_OBJECT_CATALOG } from "../../src/catalog";

// Single source of truth: the picker groups the game mirror, so grouping
// assertions use FULL entries and their real BC types throughout.
const obj = (ID: number) => FULL_OBJECT_CATALOG.find((o) => o.ID === ID)!;

describe("picker grouping", () => {
    it("groups every item under its real game type", () => {
        expect(displayGroupFor(obj(110))).toBe("Functional"); // EntryFlag
        expect(displayGroupFor(obj(115))).toBe("Functional"); // ExitFlag
        expect(displayGroupFor(obj(5010))).toBe("Banners"); // wall banner
        expect(displayGroupFor(obj(1010))).toBe("FloorItem"); // Kennel
        // Previously re-typed entries group truthfully now.
        expect(displayGroupFor(obj(130))).toBe("LivingRoom"); // PillowPink
        expect(displayGroupFor(obj(1050))).toBe("School"); // Locker
        expect(displayGroupFor(obj(3020))).toBe("Bathroom"); // Mirror
        // The FloorDecoration* family is never merged into one bucket.
        expect(displayGroupFor(obj(595))).toBe("FloorDecorationParty");
        expect(displayGroupFor(obj(360))).toBe("FloorDecorationThemed");
        expect(displayGroupFor(obj(700))).toBe("FloorDecorationExpanding");
    });

    it("shows the standing banners next to the other banners", () => {
        // BC files these under FloorDecorationThemed; users look for them
        // with the other banners, so the display mapping moves them.
        expect(displayGroupFor(obj(390))).toBe("Banners");
        expect(displayGroupFor(obj(391))).toBe("Banners");
        expect(displayGroupFor(obj(392))).toBe("Banners");
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

describe("section labels", () => {
    it("renders readable headers for game categories", () => {
        expect(sectionLabelFor("FloorFoamTiles")).toBe("Foam Tiles");
        expect(sectionLabelFor("LivingRoom")).toBe("Living Room");
        expect(sectionLabelFor("FloorDecorationExpanding")).toBe(
            "Large Furniture",
        );
        expect(sectionLabelFor("Wall")).toBe("Walls");
        expect(sectionLabelFor("Banners")).toBe("Banners");
    });

    it("falls back to the raw type for unknown future categories", () => {
        expect(sectionLabelFor("FutureType")).toBe("FutureType");
    });

    it("labels every category the catalog actually uses", () => {
        const types = new Set(FULL_OBJECT_CATALOG.map((o) => o.Type));
        for (const type of types) {
            expect(sectionLabelFor(type).length).toBeGreaterThan(0);
        }
        expect(types.size).toBe(20);
    });
});

describe("blankFirst", () => {
    it("moves the eraser first whatever the catalog order", () => {
        const items = [
            { ID: 260, Style: "LaundryMachine" },
            { ID: 3281, Style: "Blank" },
            { ID: 3024, Style: "Sink" },
        ];
        expect(blankFirst(items).map((i) => i.ID)).toEqual([3281, 260, 3024]);
    });

    it("keeps catalog order when no Blank is present", () => {
        const items = [{ Style: "A" }, { Style: "B" }];
        expect(blankFirst(items)).toEqual(items);
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
