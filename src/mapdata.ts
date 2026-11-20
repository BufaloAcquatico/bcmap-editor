// BCMap Editor - map data model and import/export.
//
// Pure functions over the 40x40 map format. No DOM access: the editor owns
// rendering and view state, and calls into these for serialization plus
// strict validation.
//
// Wire format (mirrors Bondage Club R134):
//   - Legacy part: LZString.compressToBase64(JSON of {Type, Tiles, Objects,
//     Fog?, CellData?}).
//   - Effects part (optional, R134 static lighting): "@" + base64 of BC's
//     packed effects bit string. Game exports append it; the game also still
//     reads a legacy `Effects` string field, which we accept on import.
//
// The editor model keeps lighting decoded as a per-cell `Effects` array, so
// rendering and painting never touch the bit-packing. See src/effects.ts.

import { compressToBase64, decompressFromBase64 } from "lz-string";
import { BitStringReader, BitStringWriter } from "./bitstring";
import { BLANK_OBJECT_ID, FULL_OBJECT_CATALOG } from "./catalog";
import { DECALS } from "./decals";
import { cleanObjectSettings } from "./objectSettings";
import {
    BLANK_EFFECT_ID,
    decodeEffects,
    encodeEffects,
    isKnownEffectId,
    readEffectsBody,
    writeEffectsBody,
} from "./effects";
import {
    type ObjectSettingsMap,
    cloneObjectSettings,
    type ObjectSettings,
    readObjectSettings,
    writeObjectSettings,
} from "./objectSettings";
export type { ObjectSettings } from "./objectSettings";

/** Configuration attached to a single cell (BC's `CellData` / `objectConfigs`). */
export interface SignCellConfig {
    Type: "Sign";
    Text: string;
}

export interface TeleporterCellConfig {
    Type: "Teleporter";
    Shared: true;
    Destination?: { X: number; Y: number };
    Color?: string;
}

export interface TetherCellConfig {
    Type: "Tether";
}

export type CellConfig =
    SignCellConfig | TeleporterCellConfig | TetherCellConfig;

/** Match BC's CommonIsColor with allowAlpha: #RGB, #RRGGBB or #RRGGBBAA. */
export function isValidHexColor(value: unknown): value is string {
    return (
        typeof value === "string" &&
        /^#(?:[0-9A-F]{3}|[0-9A-F]{6}|[0-9A-F]{8})$/i.test(value)
    );
}

/**
 * Mirror BC's #sanitizeObjectConfigs (Map.js:197-221): produce a fresh,
 * validated config object for one import entry; unknown shapes are dropped.
 */
export function sanitizeCellConfig(value: unknown): CellConfig | null {
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    if (v.Type === "Sign" && typeof v.Text === "string") {
        return { Type: "Sign", Text: v.Text.slice(0, MAP_CELL_COUNT) };
    }
    if (v.Type === "Teleporter") {
        const pad: TeleporterCellConfig = { Type: "Teleporter", Shared: true };
        const dest = v.Destination;
        if (
            dest &&
            typeof dest === "object" &&
            Number.isInteger((dest as Record<string, unknown>).X) &&
            Number.isInteger((dest as Record<string, unknown>).Y) &&
            (dest as { X: number }).X >= 0 &&
            (dest as { X: number }).X < MAP_WIDTH &&
            (dest as { Y: number }).Y >= 0 &&
            (dest as { Y: number }).Y < MAP_HEIGHT
        ) {
            const d = dest as { X: number; Y: number };
            pad.Destination = { X: d.X, Y: d.Y };
        }
        if (isValidHexColor(v.Color)) pad.Color = v.Color;
        return pad;
    }
    if (v.Type === "Tether") return { Type: "Tether" };
    return null;
}

/** Deep-clone a CellData record so undo snapshots never alias live state. */
export function cloneCellData(
    data: Record<string, CellConfig> | undefined,
): Record<string, CellConfig> | undefined {
    if (!data) return undefined;
    const out: Record<string, CellConfig> = {};
    for (const [key, config] of Object.entries(data)) {
        if (config.Type === "Teleporter") {
            out[key] = {
                ...config,
                Destination: config.Destination
                    ? { ...config.Destination }
                    : undefined,
            };
        } else {
            out[key] = { ...config };
        }
    }
    return out;
}

export interface MapData {
    Type: "Always" | "Hybrid" | "Never";
    Tiles: string; // 1600 chars, each char = tile ID charCode
    Objects: string; // 1600 chars, each char = object ID charCode
    /** Decoded per-cell lighting effect IDs (10..17), 1600 entries.
     *  Undefined means no lighting, equivalent to an all-Blank grid. */
    Effects?: number[];
    Fog?: boolean;
    /** Per-cell object configuration. Keys are cell indices as strings. */
    CellData?: Record<string, CellConfig>;
    /** Per-cell object transform/colour/decal settings (R134 v1). */
    ObjectSettings?: ObjectSettingsMap;
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

/** Clean imported settings against each object's capabilities (BC parity). */
function sanitizeImportedSettings(
    settings: ObjectSettingsMap,
): ObjectSettingsMap {
    const out: ObjectSettingsMap = {};
    for (const [index, s] of Object.entries(settings)) {
        const i = Number(index);
        if (!Number.isInteger(i) || i < 0 || i >= MAP_CELL_COUNT) continue;
        const obj = FULL_OBJECT_CATALOG.find((o) => o.ID === s.ID);
        if (!obj || obj.ID !== s.ID) continue;
        const clean = cleanObjectSettings(
            s,
            obj.Layers ?? [],
            DECALS.map((d) => d.name),
            !!obj.DecalArea,
            obj.CanBeCustomized !== false,
            !obj.JoinsNeighbors && !obj.CanPlaceOnWalls,
        );
        if (clean) (out as Record<string, ObjectSettings>)[index] = clean;
    }
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
        | "Type"
        | "Tiles"
        | "Objects"
        | "CellData"
        | "Effects"
        | "Fog"
        | "ObjectSettings"
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

    // Settings force v1 even with no lighting: v1 still writes the full
    // (blank) effects body so old clients can read the effects (Map.js:988).
    const settings = data.ObjectSettings;
    const hasSettings = !!settings && Object.keys(settings).length > 0;
    if (!hasVisibleEffects(data.Effects) && !hasSettings) return legacy;

    const writer = new BitStringWriter();
    writer.writeUnsigned(hasSettings ? 1 : 0, 8);
    writeEffectsBody(
        writer,
        hasVisibleEffects(data.Effects)
            ? (data.Effects as number[])
            : new Array<number>(MAP_CELL_COUNT).fill(BLANK_EFFECT_ID),
    );
    if (hasSettings && !writeObjectSettings(writer, settings!)) {
        // BC refuses to export a map with an unencodable decal name
        // (Map.js:1178-1181); fall back to a pure legacy map.
        return legacy;
    }
    return legacy + "@" + writer.toBase64();
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
    // Only Fog:true is meaningful (BC writes only that); normalize an
    // explicit false to absent so the dirty baseline and export agree.
    if (raw.Fog === true) next.Fog = true;

    // Lighting + settings: the combined "@" part is authoritative and starts
    // with a one-byte map version (0 = effects only, 1 = effects + settings).
    // Fall back to the legacy JSON `Effects`/`ObjectSettings` strings.
    if (effectsPart) {
        try {
            const reader = BitStringReader.fromBase64(effectsPart);
            if (reader) {
                const version = reader.readUnsigned(8);
                const decoded = readEffectsBody(reader, MAP_CELL_COUNT);
                if (decoded) {
                    const sanitized = decoded.map((id) =>
                        isKnownEffectId(id) ? id : BLANK_EFFECT_ID,
                    );
                    if (hasVisibleEffects(sanitized)) next.Effects = sanitized;
                }
                if (version === 1 && decoded) {
                    const settings = readObjectSettings(reader, MAP_CELL_COUNT);
                    if (Object.keys(settings).length) {
                        const cleaned = sanitizeImportedSettings(settings);
                        if (Object.keys(cleaned).length)
                            next.ObjectSettings = cleaned;
                    }
                }
            }
        } catch {
            // Malformed modern part: drop it entirely (game behaviour).
        }
    } else {
        if (typeof raw.Effects === "string") {
            const decoded = decodeEffects(raw.Effects, MAP_CELL_COUNT);
            if (decoded) {
                const sanitized = decoded.map((id) =>
                    isKnownEffectId(id) ? id : BLANK_EFFECT_ID,
                );
                if (hasVisibleEffects(sanitized)) next.Effects = sanitized;
            }
        }
        if (typeof raw.ObjectSettings === "string") {
            try {
                const reader = BitStringReader.fromBase64(raw.ObjectSettings);
                if (reader && reader.readUnsigned(8) === 0) {
                    const settings = readObjectSettings(reader, MAP_CELL_COUNT);
                    if (Object.keys(settings).length) {
                        const cleaned = sanitizeImportedSettings(settings);
                        if (Object.keys(cleaned).length)
                            next.ObjectSettings = cleaned;
                    }
                }
            } catch {
                // Legacy malformed settings are dropped.
            }
        }
    }

    // Carry over CellData configs. sanitizeCellConfig mirrors BC's
    // #sanitizeObjectConfigs for Sign, Teleporter and Tether entries.
    if (rawCellData && typeof rawCellData === "object") {
        const cellData: Record<string, CellConfig> = {};
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
            const config = sanitizeCellConfig(value);
            if (config) cellData[key] = config;
        }
        if (Object.keys(cellData).length > 0) next.CellData = cellData;
    }
    return next;
}
