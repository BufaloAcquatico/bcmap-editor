import { describe, it, expect } from "vitest";
import vectors from "./fixtures/effects-vectors.json";
import {
    EFFECT_CATALOG,
    BLANK_EFFECT_ID,
    decodeEffects,
    effectColorCss,
    encodeEffects,
    isKnownEffectId,
} from "../../src/effects";

const MAP_CELLS = 1600;

/**
 * `effects-vectors.json` is generated from Bondage Club R133's own
 * `BitString.js` + `MapEffectsCodecs[0]`: each entry is { name, ids, base64 }.
 * Matching it byte-for-byte is what proves game compatibility. Regenerate with
 * the reference script noted in the repo's effects tests.
 */
const VECTORS = vectors as Array<{
    name: string;
    ids: number[];
    base64: string;
}>;

describe("effects catalog", () => {
    it("lists the eight R133 lighting effects with IDs 10..17", () => {
        expect(EFFECT_CATALOG.map((e) => e.ID)).toEqual([
            10, 11, 12, 13, 14, 15, 16, 17,
        ]);
    });

    it("knows only catalog IDs", () => {
        expect(isKnownEffectId(10)).toBe(true);
        expect(isKnownEffectId(17)).toBe(true);
        expect(isKnownEffectId(9)).toBe(false);
        expect(isKnownEffectId(18)).toBe(false);
    });

    it("renders a colour for lit effects and nothing for Blank", () => {
        expect(effectColorCss(BLANK_EFFECT_ID)).toBeNull();
        expect(effectColorCss(11)).toBe("rgba(0, 0, 0, 0.2)");
        expect(effectColorCss(13)).toBe("rgba(0, 0, 0, 0.8)");
        expect(effectColorCss(14)).toBe("rgba(255, 0, 0, 0.3)");
        expect(effectColorCss(17)).toBe("rgba(255, 255, 0, 0.3)");
        expect(effectColorCss(999)).toBeNull();
    });
});

describe("effects codec (game compatibility)", () => {
    it("has a non-trivial vector set", () => {
        expect(VECTORS.length).toBeGreaterThanOrEqual(6);
    });

    for (const vec of VECTORS) {
        it(`encodes "${vec.name}" byte-identically to BC`, () => {
            expect(encodeEffects(vec.ids)).toBe(vec.base64);
        });

        it(`decodes "${vec.name}" produced by BC`, () => {
            expect(decodeEffects(vec.base64, MAP_CELLS)).toEqual(vec.ids);
        });
    }

    it("round-trips every effect ID", () => {
        const ids = Array.from({ length: MAP_CELLS }, (_, i) => 10 + (i % 8));
        expect(decodeEffects(encodeEffects(ids), MAP_CELLS)).toEqual(ids);
    });

    it("rejects malformed input instead of throwing", () => {
        expect(decodeEffects("", MAP_CELLS)).toBeNull();
        expect(decodeEffects("!!!not base64!!!", MAP_CELLS)).toBeNull();
        expect(decodeEffects("AAAA", MAP_CELLS)).toBeNull();
    });

    it("rejects a grid whose length is not the map size", () => {
        const shortGrid = new Array(16).fill(BLANK_EFFECT_ID);
        const encoded = encodeEffects(shortGrid);
        // 16 cells encode fine in isolation but BC expects 40x40 = 1600.
        expect(decodeEffects(encoded, MAP_CELLS)).toBeNull();
        expect(decodeEffects(encoded, 16)).toEqual(shortGrid);
    });

    it("rejects an unknown codec version", () => {
        const encoded = encodeEffects(
            new Array(MAP_CELLS).fill(BLANK_EFFECT_ID),
        );
        const raw = Buffer.from(encoded, "base64");
        raw[0] = 1; // version byte is the first byte (8 bits, little-endian)
        expect(decodeEffects(raw.toString("base64"), MAP_CELLS)).toBeNull();
    });
});
