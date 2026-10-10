import { describe, it, expect } from "vitest";
import { compressToBase64 } from "lz-string";
import {
    createDefaultMap,
    GRASS_TILE_ID,
    MAP_HEIGHT,
    MAP_WIDTH,
    parseMapData,
    serializeMap,
} from "../../src/mapdata";
import { FULL_OBJECT_CATALOG, FULL_TILE_CATALOG } from "../../src/catalog";

const isKnownTile = (id: number) => FULL_TILE_CATALOG.some((t) => t.ID === id);
const isKnownObject = (id: number) =>
    FULL_OBJECT_CATALOG.some((o) => o.ID === id);

const grass = String.fromCharCode(GRASS_TILE_ID);
const blank = String.fromCharCode(100);

describe("mapdata module", () => {
    it("creates a default grass/blank map", () => {
        const map = createDefaultMap();
        expect(map.Type).toBe("Always");
        expect(map.Tiles).toBe(grass.repeat(MAP_WIDTH * MAP_HEIGHT));
        expect(map.Objects).toBe(blank.repeat(MAP_WIDTH * MAP_HEIGHT));
    });

    it("round-trips through serialize/parse", () => {
        const map = createDefaultMap();
        const code = serializeMap(map);
        const back = parseMapData(code, isKnownTile, isKnownObject);
        expect(back).toEqual(map);
    });

    it("rejects unknown types, bad layers and unknown IDs", () => {
        const good = {
            Type: "Always" as const,
            Tiles: grass.repeat(1600),
            Objects: blank.repeat(1600),
        };
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
                    Tiles: String.fromCharCode(99999).repeat(1600),
                }),
                isKnownTile,
                isKnownObject,
            ),
        ).toThrow(/Invalid tile ID/);
    });

    it("drops unknown fields but keeps well-typed Effects/Fog", () => {
        const code = compressToBase64(
            JSON.stringify({
                Type: "Always",
                Tiles: grass.repeat(1600),
                Objects: blank.repeat(1600),
                admin: true,
                Effects: "E",
                Fog: true,
            }),
        );
        const back = parseMapData(code, isKnownTile, isKnownObject);
        expect(back).toEqual({
            Type: "Always",
            Tiles: grass.repeat(1600),
            Objects: blank.repeat(1600),
            Effects: "E",
            Fog: true,
        });
    });
});
