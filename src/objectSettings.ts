// BCMap Editor - R134 per-object settings model and bit-packed codec.
//
// Wire format (Map.js:1154-1188): legacy JSON + "@" + base64 bitstring:
//   [8-bit map version = 1][static-effects BODY][object-settings BODY]
// There is no version inside the object-settings section of the "@" tail;
// the legacy JSON `ObjectSettings` field does carry its own 8-bit codec
// version. See src/effects.ts for the effects body codec.

import { BitStringReader, BitStringWriter } from "./bitstring";

export interface ObjectSettings {
    ID: number;
    Rotation?: number;
    Size?: number;
    Colors?: string[];
    Decal?: string;
    DecalColor?: string;
}

export type ObjectSettingsMap = Record<number, ObjectSettings>;

const INDEX_BITS = 16;
const ID_BITS = 16;
const ROTATION_BITS = 9;
const SIZE_BITS = 8;
const COLOR_COUNT_BITS = 8;
const COLOR_BITS = 24;
const DECAL_LENGTH_BITS = 6;
const DECAL_CHAR_BITS = 7;

/** #RGB -> #RRGGBB, upper-cased (Map.js:3202-3205). */
export function normalizeColor(color: string): string {
    let c = color.toUpperCase();
    if (/^#[0-9A-F]{3}$/.test(c)) {
        c = "#" + [...c.slice(1)].map((ch) => ch + ch).join("");
    }
    return c;
}

export function mapColorToNumber(color: string): number {
    return parseInt(normalizeColor(color).slice(1), 16);
}

export function mapNumberToColor(value: number): string {
    return "#" + value.toString(16).toUpperCase().padStart(6, "0");
}

/** Write the object-settings BODY (no version prefix). */
export function writeObjectSettings(
    writer: BitStringWriter,
    settings: ObjectSettingsMap,
): boolean {
    const entries = Object.entries(settings);
    writer.writeUnsigned(entries.length, INDEX_BITS);
    for (const [index, s] of entries) {
        writer.writeUnsigned(Number(index), INDEX_BITS);
        writer.writeUnsigned(s.ID, ID_BITS);
        writer.writeBool(s.Rotation != null);
        if (s.Rotation != null) writer.writeUnsigned(s.Rotation, ROTATION_BITS);
        writer.writeBool(s.Size != null);
        if (s.Size != null) writer.writeUnsigned(s.Size, SIZE_BITS);
        writer.writeBool(s.Colors != null);
        if (s.Colors != null) {
            writer.writeUnsigned(s.Colors.length, COLOR_COUNT_BITS);
            for (const color of s.Colors) {
                const isDefault = color === "Default";
                writer.writeBool(isDefault);
                if (!isDefault)
                    writer.writeUnsigned(mapColorToNumber(color), COLOR_BITS);
            }
        }
        writer.writeBool(s.Decal != null);
        if (s.Decal != null) {
            if (
                s.Decal.length >= 2 ** DECAL_LENGTH_BITS ||
                [...s.Decal].some(
                    (c) => c.charCodeAt(0) >= 2 ** DECAL_CHAR_BITS,
                )
            )
                return false;
            writer.writeUnsigned(s.Decal.length, DECAL_LENGTH_BITS);
            for (const ch of s.Decal)
                writer.writeUnsigned(ch.charCodeAt(0), DECAL_CHAR_BITS);
            writer.writeBool(s.DecalColor != null);
            if (s.DecalColor != null)
                writer.writeUnsigned(
                    mapColorToNumber(s.DecalColor),
                    COLOR_BITS,
                );
        }
    }
    return true;
}

/** Read an object-settings BODY from an already-positioned reader. */
export function readObjectSettings(
    reader: BitStringReader,
    cellCount: number,
): ObjectSettingsMap {
    const out: ObjectSettingsMap = {};
    const count = reader.readUnsigned(INDEX_BITS);
    for (let i = 0; i < count; i++) {
        const index = reader.readUnsigned(INDEX_BITS);
        const settings: ObjectSettings = { ID: reader.readUnsigned(ID_BITS) };
        if (reader.readBool())
            settings.Rotation = reader.readUnsigned(ROTATION_BITS);
        if (reader.readBool()) settings.Size = reader.readUnsigned(SIZE_BITS);
        if (reader.readBool()) {
            const colorCount = reader.readUnsigned(COLOR_COUNT_BITS);
            settings.Colors = [];
            for (let c = 0; c < colorCount; c++) {
                settings.Colors.push(
                    reader.readBool()
                        ? "Default"
                        : mapNumberToColor(reader.readUnsigned(COLOR_BITS)),
                );
            }
        }
        if (reader.readBool()) {
            const length = reader.readUnsigned(DECAL_LENGTH_BITS);
            let decal = "";
            for (let c = 0; c < length; c++) {
                decal += String.fromCharCode(
                    reader.readUnsigned(DECAL_CHAR_BITS),
                );
            }
            settings.Decal = decal;
            if (reader.readBool()) {
                settings.DecalColor = mapNumberToColor(
                    reader.readUnsigned(COLOR_BITS),
                );
            }
        }
        if (index < cellCount) out[index] = settings;
    }
    return out;
}

/**
 * Mirror BC's #cleanObjectSettings (Map.js:1897-1911): keep only values the
 * object can take, drop defaults, and return null when nothing remains.
 */
export function cleanObjectSettings(
    settings: ObjectSettings,
    layers: readonly { IsColorable: boolean; DefaultColor?: string }[],
    decals: readonly string[],
    hasDecalArea: boolean,
    canBeCustomized = true,
    canTransform = true,
): ObjectSettings | null {
    if (!canBeCustomized) return null;
    const clean: ObjectSettings = { ID: settings.ID };
    if (
        canTransform &&
        Number.isInteger(settings.Rotation) &&
        settings.Rotation! >= 1 &&
        settings.Rotation! <= 359
    ) {
        clean.Rotation = settings.Rotation;
    }
    if (
        canTransform &&
        Number.isInteger(settings.Size) &&
        settings.Size! >= 50 &&
        settings.Size! <= 200 &&
        settings.Size !== 100
    ) {
        clean.Size = settings.Size;
    }
    const colorLayers = layers.filter((l) => l.IsColorable);
    if (
        settings.Colors &&
        settings.Colors.length === colorLayers.length &&
        settings.Colors.some((c) => c !== "Default") &&
        settings.Colors.every(
            (c) => c === "Default" || /^#(?:[0-9A-F]{3}|[0-9A-F]{6})$/i.test(c),
        )
    ) {
        clean.Colors = settings.Colors.map((c) =>
            c === "Default" ? c : c.toUpperCase(),
        );
    }
    if (hasDecalArea && settings.Decal && decals.includes(settings.Decal)) {
        clean.Decal = settings.Decal;
        if (
            settings.DecalColor &&
            /^#(?:[0-9A-F]{3}|[0-9A-F]{6})$/i.test(settings.DecalColor)
        ) {
            clean.DecalColor = settings.DecalColor.toUpperCase();
        }
    }
    return Object.keys(clean).length > 1 ? clean : null;
}

/** Deep clone settings records so undo snapshots never alias live state. */
export function cloneObjectSettings(
    settings: ObjectSettingsMap | undefined,
): ObjectSettingsMap | undefined {
    if (!settings) return undefined;
    const out: Record<string, ObjectSettings> = {};
    for (const [key, s] of Object.entries(settings)) {
        out[key] = {
            ...s,
            Colors: s.Colors ? [...s.Colors] : undefined,
        };
    }
    return out as ObjectSettingsMap;
}
