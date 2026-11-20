import { describe, it, expect } from "vitest";
import { BitStringWriter } from "../../src/bitstring";
import { writeEffectsBody } from "../../src/effects";
import {
    writeObjectSettings,
    readObjectSettings,
    cleanObjectSettings,
    mapColorToNumber,
    mapNumberToColor,
    cloneObjectSettings,
} from "../../src/objectSettings";
import { BitStringReader } from "../../src/bitstring";
import { MAP_CELL_COUNT, serializeMap, parseMapData } from "../../src/mapdata";
import { FULL_TILE_CATALOG, FULL_OBJECT_CATALOG } from "../../src/catalog";

const BLANK_GRID = new Array(MAP_CELL_COUNT).fill(10);

describe("R134 wire format golden vectors", () => {
    it("matches the game's v0 all-blank effects tail", () => {
        const w = new BitStringWriter();
        w.writeUnsigned(0, 8);
        writeEffectsBody(w, BLANK_GRID);
        expect(w.toBase64()).toBe("EAApAIABfwb/e/9//284fg==");
    });

    it("matches the game's v1 all-blank effects + empty settings tail", () => {
        const w = new BitStringWriter();
        w.writeUnsigned(1, 8);
        writeEffectsBody(w, BLANK_GRID);
        writeObjectSettings(w, {});
        expect(w.toBase64()).toBe("EAEpAIABfwb/e/9//284fgAA");
    });
});

describe("object settings codec", () => {
    it("round-trips a full settings record", () => {
        const settings = {
            5: {
                ID: 120,
                Rotation: 45,
                Size: 150,
                Colors: ["#ABCDEF", "Default"],
                Decal: "DenOfSin",
                DecalColor: "#123456",
            },
        };
        const w = new BitStringWriter();
        writeObjectSettings(w, settings);
        const reader = BitStringReader.fromBase64(w.toBase64());
        expect(reader).not.toBeNull();
        expect(readObjectSettings(reader!, MAP_CELL_COUNT)).toEqual(settings);
    });

    it("converts colours with #RGB expansion and uppercase output", () => {
        expect(mapColorToNumber("#abc")).toBe(0xaabbcc);
        expect(mapNumberToColor(0xaabbcc)).toBe("#AABBCC");
    });

    it("cleans defaults and invalid values (BC #cleanObjectSettings)", () => {
        const layers = [
            { IsColorable: true, DefaultColor: "#FFFFFF" },
            { IsColorable: true, DefaultColor: "#000000" },
        ];
        const decals = ["DenOfSin", "BCRules"];
        expect(
            cleanObjectSettings(
                {
                    ID: 599,
                    Rotation: 0,
                    Size: 100,
                    Colors: ["Default", "Default"],
                },
                layers,
                decals,
                true,
            ),
        ).toBeNull();
        expect(
            cleanObjectSettings(
                {
                    ID: 599,
                    Rotation: 45,
                    Size: 150,
                    Colors: ["#ABCDEF", "Default"],
                    Decal: "DenOfSin",
                    DecalColor: "#123456",
                },
                layers,
                decals,
                true,
            ),
        ).toEqual({
            ID: 599,
            Rotation: 45,
            Size: 150,
            Colors: ["#ABCDEF", "Default"],
            Decal: "DenOfSin",
            DecalColor: "#123456",
        });
    });

    it("round-trips a combined v1 code with lighting, all CellData types and settings", () => {
        const tiles = String.fromCharCode(210).repeat(MAP_CELL_COUNT);
        const objects = new Array(MAP_CELL_COUNT).fill(
            String.fromCharCode(100),
        );
        objects[5] = String.fromCharCode(3520); // sign
        objects[6] = String.fromCharCode(3530); // teleporter
        objects[7] = String.fromCharCode(2005); // tether
        const map = {
            Type: "Always" as const,
            Tiles: tiles,
            Objects: objects.join(""),
            Effects: new Array(MAP_CELL_COUNT).fill(10) as number[],
            CellData: {
                "5": { Type: "Sign" as const, Text: "hello" },
                "6": {
                    Type: "Teleporter" as const,
                    Shared: true as const,
                    Destination: { X: 8, Y: 8 },
                    Color: "#AABBCC80",
                },
                "7": { Type: "Tether" as const },
            },
            ObjectSettings: {
                10: {
                    ID: 599,
                    Rotation: 45,
                    Size: 150,
                    Colors: ["#ABCDEF", "Default"],
                    Decal: "DenOfSin",
                },
            },
        };
        map.Effects[100] = 14;
        const code = serializeMap(map as any);
        const parsed = parseMapData(
            code,
            (id) => FULL_TILE_CATALOG.some((t) => t.ID === id),
            (id) => FULL_OBJECT_CATALOG.some((o) => o.ID === id),
        );
        expect(parsed.CellData).toEqual(map.CellData);
        expect(parsed.ObjectSettings).toEqual(map.ObjectSettings);
        expect(parsed.Effects).toEqual(map.Effects);
        expect(serializeMap(parsed as any)).toBe(code);
    });

    it("deep-clones settings including the Colors array", () => {
        const original = { 1: { ID: 5, Colors: ["#FFFFFF", "Default"] } };
        const clone = cloneObjectSettings(original)!;
        clone[1].Colors![0] = "#000000";
        expect(original[1].Colors![0]).toBe("#FFFFFF");
    });
});
