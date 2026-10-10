// BCMap Editor - map data model and import/export.
//
// Pure functions over the 40x40 two-layer map format (LZString-compressed,
// same as ropeybot). No DOM access: the editor owns rendering and view
// state, and calls into these for serialization plus strict validation.
//
// Extracted from BCMapEditor (src/editor.ts); behavior is unchanged.

import { compressToBase64, decompressFromBase64 } from "lz-string";
import { BLANK_OBJECT_ID } from "./catalog";

export interface MapData {
    Type: "Always" | "Hybrid" | "Never";
    Tiles: string; // 1600 chars, each char = tile ID charCode
    Objects: string; // 1600 chars, each char = object ID charCode
    Effects?: string;
    Fog?: boolean;
}

export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 40;
export const GRASS_TILE_ID = 210;

export function createDefaultMap(): MapData {
    const grassChar = String.fromCharCode(GRASS_TILE_ID);
    const tiles = grassChar.repeat(MAP_WIDTH * MAP_HEIGHT);
    const objects = String.fromCharCode(BLANK_OBJECT_ID).repeat(
        MAP_WIDTH * MAP_HEIGHT,
    );
    return {
        Type: "Always",
        Tiles: tiles,
        Objects: objects,
    };
}

/** Serialize map layers to an importable/exportable code string. */
export function serializeMap(
    data: Pick<MapData, "Type" | "Tiles" | "Objects">,
): string {
    return compressToBase64(JSON.stringify(data));
}

/**
 * Parse and strictly validate an import code, returning a fresh MapData.
 * Rejects unknown map types, non-string or wrong-length layers, and IDs
 * outside the known game catalogs. Unknown/extra fields are dropped;
 * Effects/Fog carry over only when well-typed.
 */
export function parseMapData(
    code: string,
    isKnownTileId: (id: number) => boolean,
    isKnownObjectId: (id: number) => boolean,
): MapData {
    const jsonStr = decompressFromBase64(code);
    if (!jsonStr) throw new Error("Invalid map code");
    const parsed: unknown = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid map format");
    }
    const { Type, Tiles, Objects } = parsed as Record<string, unknown>;
    if (Type !== "Always" && Type !== "Hybrid" && Type !== "Never") {
        throw new Error("Invalid map type");
    }
    if (
        typeof Tiles !== "string" ||
        typeof Objects !== "string" ||
        Tiles.length !== MAP_WIDTH * MAP_HEIGHT ||
        Objects.length !== MAP_WIDTH * MAP_HEIGHT
    ) {
        throw new Error("Invalid map dimensions");
    }
    for (let i = 0; i < Tiles.length; i++) {
        if (!isKnownTileId(Tiles.charCodeAt(i))) {
            throw new Error("Invalid tile ID at index " + i);
        }
    }
    for (let i = 0; i < Objects.length; i++) {
        if (!isKnownObjectId(Objects.charCodeAt(i))) {
            throw new Error("Invalid object ID at index " + i);
        }
    }
    const raw = parsed as Record<string, unknown>;
    const next: MapData = { Type, Tiles, Objects };
    if (typeof raw.Effects === "string") next.Effects = raw.Effects;
    if (typeof raw.Fog === "boolean") next.Fog = raw.Fog;
    return next;
}
