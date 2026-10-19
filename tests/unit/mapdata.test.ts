import { describe, it, expect } from "vitest";
import { compressToBase64, decompressFromBase64 } from "lz-string";
import {
    createDefaultMap,
    hasVisibleEffects,
    MAP_CELL_COUNT,
    GRASS_TILE_ID,
    MAP_HEIGHT,
    MAP_WIDTH,
    parseMapData,
    serializeMap,
} from "../../src/mapdata";
import { FULL_OBJECT_CATALOG, FULL_TILE_CATALOG } from "../../src/catalog";
import { BLANK_EFFECT_ID, encodeEffects } from "../../src/effects";
import vectors from "./fixtures/effects-vectors.json";

const isKnownTile = (id: number) => FULL_TILE_CATALOG.some((t) => t.ID === id);
const isKnownObject = (id: number) =>
    FULL_OBJECT_CATALOG.some((o) => o.ID === id);

const grass = String.fromCharCode(GRASS_TILE_ID);
const blank = String.fromCharCode(100);

const baseMap = () => ({
    Type: "Always" as const,
    Tiles: grass.repeat(MAP_CELL_COUNT),
    Objects: blank.repeat(MAP_CELL_COUNT),
});

describe("mapdata module", () => {
    it("creates a default grass/blank map", () => {
        const map = createDefaultMap();
        expect(map.Type).toBe("Always");
        expect(map.Tiles).toBe(grass.repeat(MAP_WIDTH * MAP_HEIGHT));
        expect(map.Objects).toBe(blank.repeat(MAP_WIDTH * MAP_HEIGHT));
        expect(map.Effects).toBeUndefined();
    });

    it("round-trips through serialize/parse", () => {
        const map = createDefaultMap();
        const code = serializeMap(map);
        const back = parseMapData(code, isKnownTile, isKnownObject);
        expect(back).toEqual(map);
    });

    it("rejects unknown types, bad layers and unknown IDs", () => {
        const good = baseMap();
        expect(() =>
            parseMapData(
                serializeMap({ ...good, Type: "Sometimes" as any }),
                isKnownTile,
                isKnownObject,
            ),
        ).toThrow(/Invalid map type/);
        expect(() =>
            parseMapData(
                compressToBase64(JSON.stringify({ ...good, Tiles: "short" })),
                isKnownTile,
                isKnownObject,
            ),
        ).toThrow(/Invalid map dimensions/);
        expect(() =>
            parseMapData(
                serializeMap({
                    ...good,
                    Tiles: String.fromCharCode(99999).repeat(MAP_CELL_COUNT),
                }),
                isKnownTile,
                isKnownObject,
            ),
        ).toThrow(/Invalid tile ID/);
    });

    it("drops unknown fields but keeps well-typed Fog", () => {
        const code = compressToBase64(
            JSON.stringify({
                ...baseMap(),
                admin: true,
                Fog: true,
            }),
        );
        const back = parseMapData(code, isKnownTile, isKnownObject);
        expect(back).toEqual({ ...baseMap(), Fog: true });
    });

    it("carries CellData (sign text) through serialize/parse", () => {
        const map = {
            ...baseMap(),
            CellData: { "42": { Type: "Sign" as const, Text: "Hello" } },
        };
        const code = serializeMap(map);
        const back = parseMapData(code, isKnownTile, isKnownObject);
        expect(back.CellData).toEqual({
            "42": { Type: "Sign", Text: "Hello" },
        });
    });

    it("drops invalid CellData entries", () => {
        const code = compressToBase64(
            JSON.stringify({
                ...baseMap(),
                CellData: {
                    "42": { Type: "Sign", Text: "ok" },
                    bad: { Type: "Sign", Text: "x" },
                    "7": { Type: "Other", Text: "x" },
                    "8": { Type: "Sign", Text: 5 },
                    "99999": { Type: "Sign", Text: "x" },
                },
            }),
        );
        const back = parseMapData(code, isKnownTile, isKnownObject);
        expect(back.CellData).toEqual({
            "42": { Type: "Sign", Text: "ok" },
        });
    });

    it("omits empty CellData on serialize", () => {
        const code = serializeMap({ ...baseMap(), CellData: {} });
        const back = parseMapData(code, isKnownTile, isKnownObject);
        expect(back.CellData).toBeUndefined();
    });
});

describe("mapdata lighting (effects)", () => {
    const lighting = () =>
        Array.from({ length: MAP_CELL_COUNT }, (_, i) =>
            i < 400 ? BLANK_EFFECT_ID : i < 800 ? 13 : 14,
        );

    it("round-trips a lighting grid through serialize/parse", () => {
        const map = { ...baseMap(), Effects: lighting() };
        const code = serializeMap(map);
        const back = parseMapData(code, isKnownTile, isKnownObject);
        expect(back.Effects).toEqual(lighting());
    });

    it("writes the combined '<legacy>@<effects>' format when lit", () => {
        const map = { ...baseMap(), Effects: lighting() };
        const code = serializeMap(map);
        const sep = code.indexOf("@");
        expect(sep).toBeGreaterThan(0);
        const legacy = JSON.parse(decompressFromBase64(code.slice(0, sep))!);
        expect(legacy.Effects).toBeUndefined(); // lighting is not in the JSON
        expect(code.slice(sep + 1)).toBe(encodeEffects(lighting()));
    });

    it("omits the '@' part when lighting is entirely Blank", () => {
        const map = {
            ...baseMap(),
            Effects: new Array(MAP_CELL_COUNT).fill(BLANK_EFFECT_ID),
        };
        expect(hasVisibleEffects(map.Effects)).toBe(false);
        expect(serializeMap(map).includes("@")).toBe(false);
    });

    it("omits the '@' part when there is no lighting at all", () => {
        expect(serializeMap(baseMap()).includes("@")).toBe(false);
    });

    it("imports lighting from a game-produced combined code", () => {
        const fixture = (
            vectors as Array<{ name: string; base64: string }>
        ).find((v) => v.name === "four quadrants")!;
        const code = serializeMap(baseMap()) + "@" + fixture.base64;
        const back = parseMapData(code, isKnownTile, isKnownObject);
        expect(back.Effects).toBeDefined();
        expect(
            back.Effects!.slice(0, 400).every((x) => x === BLANK_EFFECT_ID),
        ).toBe(true);
        expect(back.Effects![400]).toBe(11);
        expect(back.Effects![800]).toBe(12);
        expect(back.Effects![1200]).toBe(13);
    });

    it("still reads a legacy JSON Effects string", () => {
        const code = compressToBase64(
            JSON.stringify({
                ...baseMap(),
                Effects: encodeEffects(lighting()),
            }),
        );
        const back = parseMapData(code, isKnownTile, isKnownObject);
        expect(back.Effects).toEqual(lighting());
    });

    it("drops malformed lighting instead of failing the whole import", () => {
        const code = compressToBase64(
            JSON.stringify({ ...baseMap(), Effects: "not a valid bit string" }),
        );
        const back = parseMapData(code, isKnownTile, isKnownObject);
        expect(back.Effects).toBeUndefined();
        expect(back.Tiles).toBe(grass.repeat(MAP_CELL_COUNT));
    });

    it("sanitizes unknown effect IDs to Blank (mirrors BC)", () => {
        // Encode a grid using an out-of-catalog ID; BC treats unknown as blank.
        const grid = new Array(MAP_CELL_COUNT).fill(BLANK_EFFECT_ID);
        grid[0] = 99;
        grid[1] = 12;
        const code = serializeMap(baseMap()) + "@" + encodeEffects(grid);
        const back = parseMapData(code, isKnownTile, isKnownObject);
        expect(back.Effects).toBeDefined();
        expect(back.Effects![0]).toBe(BLANK_EFFECT_ID);
        expect(back.Effects![1]).toBe(12);
    });

    it("keeps Fog alongside lighting", () => {
        const map = { ...baseMap(), Fog: true, Effects: lighting() };
        const code = serializeMap(map);
        const back = parseMapData(code, isKnownTile, isKnownObject);
        expect(back.Fog).toBe(true);
        expect(back.Effects).toEqual(lighting());
    });
});
