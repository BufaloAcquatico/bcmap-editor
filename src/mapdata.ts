// BCMap Editor - map data model and import/export.
//
// Pure functions over the 40x40 map format. No DOM access: the editor owns
// rendering and view state, and calls into these for serialization plus
// strict validation.
//
// Wire format (mirrors Bondage Club R133):
//   - Legacy part: LZString.compressToBase64(JSON of {Type, Tiles, Objects,
//     Fog?, CellData?}).
//   - Effects part (optional, R133 static lighting): "@" + base64 of BC's
//     packed effects bit string. Game exports append it; the game also still
//     reads a legacy `Effects` string field, which we accept on import.
//
// The editor model keeps lighting decoded as a per-cell `Effects` array, so
// rendering and painting never touch the bit-packing. See src/effects.ts.

import { compressToBase64, decompressFromBase64 } from "lz-string";
import { BLANK_OBJECT_ID } from "./catalog";
import {
    BLANK_EFFECT_ID,
    decodeEffects,
    encodeEffects,
    isKnownEffectId,
} from "./effects";

/** Configuration attached to a single cell. Currently only sign text (BC's
 *  `CellData` / `objectConfigs`), introduced with the R133 signs. */
export interface SignCellConfig {
    Type: "Sign";
    Text: string;
}

export interface MapData {
    Type: "Always" | "Hybrid" | "Never";
    Tiles: string; // 1600 chars, each char = tile ID charCode
    Objects: string; // 1600 chars, each char = object ID charCode
    /** Decoded per-cell lighting effect IDs (10..17), 1600 entries.
     *  Undefined means no lighting, equivalent to an all-Blank grid. */
    Effects?: number[];
    Fog?: boolean;
    /** Per-cell configuration (sign text). Keys are cell indices as strings. */
    CellData?: Record<string, SignCellConfig>;
}

export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 40;
export const MAP_CELL_COUNT = MAP_WIDTH * MAP_HEIGHT;
export const GRASS_TILE_ID = 210;

export function createDefaultMap(): MapData {
    const grassChar = String.fromCharCode(GRASS_TILE_ID);
    const tiles = grassChar.repeat(MAP_CELL_COUNT);
    const objects = String.fromCharCode(BLANK_OBJECT_ID).repeat(MAP_CELL_COUNT);
    return {
        Type: "Always",
        Tiles: tiles,
        Objects: objects,
    };
}

/** True when a lighting grid holds at least one non-Blank effect. */
export function hasVisibleEffects(
    effects: readonly number[] | undefined,
): boolean {
    return !!effects && effects.some((id) => id !== BLANK_EFFECT_ID);
}

/**
 * Pack a decoded lighting grid into a per-cell char string (one char per
 * cell, charCode = effect ID). Returns "" for no lighting. Used by the
 * undo snapshots, which keep everything as immutable strings.
 */
export function effectsToGrid(effects: readonly number[] | undefined): string {
    if (!effects || effects.length === 0) return "";
    let out = "";
    for (const id of effects) out += String.fromCharCode(id);
    return out;
}

/** Inverse of {@link effectsToGrid}; "" maps back to undefined (no lighting). */
export function gridToEffects(grid: string): number[] | undefined {
    if (!grid) return undefined;
    const out = new Array<number>(grid.length);
    for (let i = 0; i < grid.length; i++) out[i] = grid.charCodeAt(i);
    return out;
}

/** Serialize a map to an importable/exportable code string. */
export function serializeMap(
    data: Pick<
        MapData,
        "Type" | "Tiles" | "Objects" | "CellData" | "Effects" | "Fog"
    >,
): string {
    const out: Record<string, unknown> = {
        Type: data.Type,
        Tiles: data.Tiles,
        Objects: data.Objects,
    };
    if (data.Fog) out.Fog = true;
    if (data.CellData && Object.keys(data.CellData).length > 0) {
        out.CellData = data.CellData;
    }
    const legacy = compressToBase64(JSON.stringify(out));
    if (hasVisibleEffects(data.Effects)) {
        return legacy + "@" + encodeEffects(data.Effects as number[]);
    }
    return legacy;
}

/**
 * Parse and strictly validate an import code, returning a fresh MapData.
 * Rejects unknown map types, non-string or wrong-length layers, and IDs
 * outside the known game catalogs. Unknown/extra fields are dropped.
 * Lighting is read from the combined "@" part when present, otherwise from a
 * legacy JSON `Effects` string; unknown effect IDs are sanitized to Blank.
 */
export function parseMapData(
    code: string,
    isKnownTileId: (id: number) => boolean,
    isKnownObjectId: (id: number) => boolean,
): MapData {
    // The combined format is `<legacy>@<effects>`; LZString ignores trailing
    // data, but we split first so we can decode the effects part ourselves.
    const sep = code.indexOf("@");
    const legacyCode = sep >= 0 ? code.slice(0, sep) : code;
    const effectsPart = sep >= 0 ? code.slice(sep + 1) : null;

    const jsonStr = decompressFromBase64(legacyCode);
    if (!jsonStr) throw new Error("Invalid map code");
    const parsed: unknown = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== "object") {
        throw new Error("Invalid map format");
    }
    const { Type, Tiles, Objects } = parsed as Record<string, unknown>;
    const raw = parsed as Record<string, unknown>;
    const rawCellData = raw.CellData;
    if (Type !== "Always" && Type !== "Hybrid" && Type !== "Never") {
        throw new Error("Invalid map type");
    }
    if (
        typeof Tiles !== "string" ||
        typeof Objects !== "string" ||
        Tiles.length !== MAP_CELL_COUNT ||
        Objects.length !== MAP_CELL_COUNT
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
    const next: MapData = { Type, Tiles, Objects };
    if (typeof raw.Fog === "boolean") next.Fog = raw.Fog;

    // Lighting: the combined "@" part is authoritative; fall back to a legacy
    // `Effects` string on the JSON object. Malformed data is dropped silently.
    const rawEffects =
        effectsPart ?? (typeof raw.Effects === "string" ? raw.Effects : null);
    if (rawEffects) {
        const decoded = decodeEffects(rawEffects, MAP_CELL_COUNT);
        if (decoded) {
            const sanitized = decoded.map((id) =>
                isKnownEffectId(id) ? id : BLANK_EFFECT_ID,
            );
            // Keep the invariant that Effects is either absent or holds at
            // least one non-Blank cell; sanitizing can blank an all-unknown
            // grid, which should read as "no lighting".
            if (hasVisibleEffects(sanitized)) next.Effects = sanitized;
        }
    }

    // Carry over sign text (CellData). Validate shape; drop invalid entries.
    // Matches BC's #sanitizeObjectConfigs: only Type === "Sign" with a string
    // Text survive, sliced to the game's accepted maximum.
    if (rawCellData && typeof rawCellData === "object") {
        const cellData: Record<string, SignCellConfig> = {};
        for (const [key, value] of Object.entries(
            rawCellData as Record<string, unknown>,
        )) {
            const index = Number(key);
            if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= MAP_CELL_COUNT
            )
                continue;
            if (!value || typeof value !== "object") continue;
            const v = value as Record<string, unknown>;
            if (v.Type !== "Sign" || typeof v.Text !== "string") continue;
            cellData[key] = {
                Type: "Sign",
                Text: v.Text.slice(0, 1600),
            };
        }
        if (Object.keys(cellData).length > 0) next.CellData = cellData;
    }
    return next;
}
