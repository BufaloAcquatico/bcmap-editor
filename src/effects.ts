// BCMap Editor - Bondage Club static lighting ("effects") catalog and codec.
//
// BC stores one lighting effect per map cell (shadow / colour tint / glow),
// plus a "Blank" entry for no effect. The per-cell grid is compressed with
// the game's effects codec (RLE over remapped IDs) and base64-encoded into
// the map code; see BondageClub/Scripts/Map.js `MapEffectsCodecs[0]`. This
// module mirrors that codec and the effect table so the editor can render,
// edit and export lighting losslessly.
//
// Source: BondageClub/Assets/MapData.js `AssetsMapDataEffects` (R133).

import {
    BitStringReader,
    BitStringWriter,
    getBitsCountForUnsigned,
    maxUnsignedInBits,
} from "./bitstring";

export interface EffectDef {
    /** Game effect ID (BC's `ChatRoomMapViewEffectStartID` is 10 = Blank). */
    ID: number;
    /** Game style/name, e.g. "ShadowDark" (used for picker labels/search). */
    Style: string;
    /** Overlay colour as [r, g, b, a] with r/g/b in 0..255 and a in 0..1. */
    Color: readonly [number, number, number, number];
}

/** The eight static-lighting effects, in BC's declared order. */
export const EFFECT_CATALOG: readonly EffectDef[] = [
    { ID: 10, Style: "Blank", Color: [0, 0, 0, 0] },
    { ID: 11, Style: "ShadowLight", Color: [0, 0, 0, 0.2] },
    { ID: 12, Style: "ShadowMedium", Color: [0, 0, 0, 0.5] },
    { ID: 13, Style: "ShadowDark", Color: [0, 0, 0, 0.8] },
    { ID: 14, Style: "TintRed", Color: [255, 0, 0, 0.3] },
    { ID: 15, Style: "TintBlue", Color: [0, 0, 255, 0.3] },
    { ID: 16, Style: "TintGreen", Color: [0, 255, 0, 0.3] },
    { ID: 17, Style: "GlowYellow", Color: [255, 255, 0, 0.3] },
];

/** No-effect ID. Cells equal to this render as empty lighting. */
export const BLANK_EFFECT_ID = 10;

export const EFFECT_BY_ID = new Map<number, EffectDef>(
    EFFECT_CATALOG.map((effect) => [effect.ID, effect]),
);

/** True when `id` is a known lighting effect (including "Blank"). */
export function isKnownEffectId(id: number): boolean {
    return EFFECT_BY_ID.has(id);
}

/** CSS `rgba(...)` string for an effect overlay, or null for "Blank"/unknown. */
export function effectColorCss(id: number): string | null {
    const effect = EFFECT_BY_ID.get(id);
    if (!effect) return null;
    const [r, g, b, a] = effect.Color;
    if (a <= 0) return null;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// --- effects codec (MapEffectsCodecs v0) -------------------------------------

/** Version tag written before the effects body (BC's MAP_SYNC_VERSION_BIT_SIZE). */
const MAP_SYNC_VERSION_BIT_SIZE = 8;
const EFFECTS_CODEC_VERSION = 0;

// RLE runs: blank cells tolerate long runs (8-bit count), filled cells short
// ones (4-bit count). +2 because a run encodes lengths >= 2 only.
const RLE_BITS_EMPTY = 8;
const RLE_MAX_EMPTY = maxUnsignedInBits(RLE_BITS_EMPTY) + 2;
const RLE_COUNT_BITS_EMPTY = getBitsCountForUnsigned(RLE_MAX_EMPTY);
const RLE_BITS_FILLED = 4;
const RLE_MAX_FILLED = maxUnsignedInBits(RLE_BITS_FILLED) + 2;
const RLE_COUNT_BITS_FILLED = getBitsCountForUnsigned(RLE_MAX_FILLED);

// Width fields (in bits) for the dynamic settings header.
const BIT_LEN_BITS = 6;
const ARRAY_LEN_IN_BYTES_BITS = 2;

interface CodecSettings {
    baseIdBits: number;
    shiftedIdBits: number;
    remappedIdBits: number;
    effectIdMin: number;
    /** Distinct effect IDs present, each shifted by `effectIdMin`, sorted asc. */
    effectIdsShifted: number[];
    /** shift -> remap index, tuple-of-arrays to keep this allocation-free. */
    shiftedToRemap: Map<number, number>;
    /** remap index -> shift. */
    remapToShifted: Map<number, number>;
    effectsLength: number;
}

function buildSettings(effectIds: readonly number[]): CodecSettings {
    const unique = [...new Set(effectIds)].sort((a, b) => a - b);
    const effectIdMin = unique[0] ?? 0;
    const effectIdShiftedMax = (unique[unique.length - 1] ?? 0) - effectIdMin;
    const shiftedToRemap = new Map<number, number>();
    const remapToShifted = new Map<number, number>();
    unique.forEach((id, remapId) => {
        const shifted = id - effectIdMin;
        shiftedToRemap.set(shifted, remapId);
        remapToShifted.set(remapId, shifted);
    });
    return {
        baseIdBits: getBitsCountForUnsigned(effectIdMin),
        shiftedIdBits: getBitsCountForUnsigned(effectIdShiftedMax),
        remappedIdBits: getBitsCountForUnsigned(unique.length - 1),
        effectIdMin,
        effectIdsShifted: unique.map((id) => id - effectIdMin),
        shiftedToRemap,
        remapToShifted,
        effectsLength: effectIds.length,
    };
}

function rleSettings(effectId: number): {
    maxRun: number;
    rleCountBits: number;
} {
    return effectId === BLANK_EFFECT_ID
        ? { maxRun: RLE_MAX_EMPTY, rleCountBits: RLE_COUNT_BITS_EMPTY }
        : { maxRun: RLE_MAX_FILLED, rleCountBits: RLE_COUNT_BITS_FILLED };
}

function runLength(start: number, effectIds: readonly number[]): number {
    const id = effectIds[start];
    let index = start + 1;
    while (index < effectIds.length && effectIds[index] === id) index++;
    return index - start;
}

function writeArrayLength(length: number, writer: BitStringWriter): void {
    const lenBytes = Math.ceil(getBitsCountForUnsigned(length) / 8) | 0;
    writer.writeUnsigned(lenBytes, ARRAY_LEN_IN_BYTES_BITS);
    writer.writeUnsigned(length, lenBytes * 8);
}

function readArrayLength(reader: BitStringReader): number {
    const lenBytes = reader.readUnsigned(ARRAY_LEN_IN_BYTES_BITS);
    return reader.readUnsigned(lenBytes * 8);
}

function writeArray(
    array: readonly number[],
    elementBits: number,
    writer: BitStringWriter,
): void {
    writeArrayLength(array.length, writer);
    for (const value of array) writer.writeUnsigned(value, elementBits);
}

function readArray(
    reader: BitStringReader,
    elementBits: number,
    maxLen: number,
): number[] {
    const len = readArrayLength(reader);
    if (len > maxLen) throw new Error(`effects: array too long (${len})`);
    const out: number[] = [];
    for (let i = 0; i < len; i++) out.push(reader.readUnsigned(elementBits));
    return out;
}

/**
 * Encode a per-cell effect-ID list into BC's base64 effects string.
 *
 * The list is expected to be one entry per map cell (any length); the game's
 * decoder validates the length against 40x40 on read.
 */
export function encodeEffects(effectIds: readonly number[]): string {
    const writer = new BitStringWriter();
    writer.writeUnsigned(EFFECTS_CODEC_VERSION, MAP_SYNC_VERSION_BIT_SIZE);

    const settings = buildSettings(effectIds);
    writer.writeUnsigned(settings.baseIdBits, BIT_LEN_BITS);
    writer.writeUnsigned(settings.shiftedIdBits, BIT_LEN_BITS);
    writer.writeUnsigned(settings.remappedIdBits, BIT_LEN_BITS);
    writer.writeUnsigned(settings.effectIdMin, settings.baseIdBits);
    writeArray(settings.effectIdsShifted, settings.shiftedIdBits, writer);
    writeArrayLength(settings.effectsLength, writer);

    let i = 0;
    while (i < effectIds.length) {
        const id = effectIds[i];
        writer.writeUnsigned(
            settings.shiftedToRemap.get(id - settings.effectIdMin) ?? 0,
            settings.remappedIdBits,
        );
        const { maxRun, rleCountBits } = rleSettings(id);
        const run = Math.min(runLength(i, effectIds), maxRun);
        if (run >= 2) {
            writer.writeBool(true);
            writer.writeUnsigned(run - 2, rleCountBits);
            i += run;
        } else {
            writer.writeBool(false);
            i++;
        }
    }
    return writer.toBase64();
}

/**
 * Decode a BC base64 effects string into a per-cell effect-ID list. Returns
 * null (rather than throwing) on any malformed/incompatible input, so callers
 * can fall back to all-blank lighting.
 */
export function decodeEffects(
    encoded: string,
    expectedLength: number,
): number[] | null {
    if (!encoded) return null;
    const reader = BitStringReader.fromBase64(encoded);
    if (!reader) return null;
    try {
        const version = reader.readUnsigned(MAP_SYNC_VERSION_BIT_SIZE);
        if (version !== EFFECTS_CODEC_VERSION) return null;

        const baseIdBits = reader.readUnsigned(BIT_LEN_BITS);
        const shiftedIdBits = reader.readUnsigned(BIT_LEN_BITS);
        const remappedIdBits = reader.readUnsigned(BIT_LEN_BITS);
        const effectIdMin = reader.readUnsigned(baseIdBits);
        const effectIdsShifted = readArray(
            reader,
            shiftedIdBits,
            EFFECT_CATALOG.length,
        );
        const effectsLength = readArrayLength(reader);
        if (effectsLength !== expectedLength) return null;

        const remapToShifted = new Map<number, number>();
        effectIdsShifted.forEach((shifted, remapId) =>
            remapToShifted.set(remapId, shifted),
        );

        const out: number[] = [];
        while (out.length < effectsLength) {
            const remappedId = reader.readUnsigned(remappedIdBits);
            const effectId =
                (remapToShifted.get(remappedId) ?? 0) + effectIdMin;
            const isRle = reader.readBool();
            const run = isRle
                ? reader.readUnsigned(rleSettings(effectId).rleCountBits) + 2
                : 1;
            for (let i = 0; i < run; i++) out.push(effectId);
        }
        // A well-formed writer never overshoots, but tolerate a hostile or
        // truncated tail by trimming to the declared length (BC ignores the
        // extra cells anyway: rendering only indexes 0..1599).
        return out.slice(0, effectsLength);
    } catch {
        return null;
    }
}
