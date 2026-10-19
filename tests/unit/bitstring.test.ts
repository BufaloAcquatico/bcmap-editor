import { describe, it, expect } from "vitest";
import {
    BitStringReader,
    BitStringWriter,
    getBitsCountForUnsigned,
    maxUnsignedInBits,
} from "../../src/bitstring";

describe("getBitsCountForUnsigned / maxUnsignedInBits", () => {
    it("returns 0 bits for zero", () => {
        expect(getBitsCountForUnsigned(0)).toBe(0);
    });

    it("returns minimal widths", () => {
        expect(getBitsCountForUnsigned(1)).toBe(1);
        expect(getBitsCountForUnsigned(2)).toBe(2);
        expect(getBitsCountForUnsigned(3)).toBe(2);
        expect(getBitsCountForUnsigned(255)).toBe(8);
        expect(getBitsCountForUnsigned(256)).toBe(9);
    });

    it("computes masks", () => {
        expect(maxUnsignedInBits(0)).toBe(0);
        expect(maxUnsignedInBits(4)).toBe(15);
        expect(maxUnsignedInBits(8)).toBe(255);
    });
});

describe("BitString writer/reader", () => {
    it("round-trips a single value through base64", () => {
        const writer = new BitStringWriter();
        writer.writeUnsigned(42, 15);
        const reader = BitStringReader.fromBase64(writer.toBase64())!;
        expect(reader.readUnsigned(15)).toBe(42);
    });

    it("round-trips values of every width, including zero-width", () => {
        const widths = [0, 1, 2, 3, 7, 8, 15, 16, 17, 31, 32, 33, 53];
        const writer = new BitStringWriter();
        const expected: number[] = [];
        for (const bits of widths) {
            const value = bits === 0 ? 0 : maxUnsignedInBits(bits) - (bits % 3);
            writer.writeUnsigned(value, bits);
            expected.push(value);
        }
        const reader = BitStringReader.fromBase64(writer.toBase64())!;
        for (const bits of widths) {
            expect(reader.readUnsigned(bits)).toBe(expected.shift());
        }
    });

    it("interleaves booleans with numbers", () => {
        const writer = new BitStringWriter();
        writer.writeBool(true);
        writer.writeUnsigned(5, 3);
        writer.writeBool(false);
        writer.writeBool(true);
        writer.writeUnsigned(1600, 16);
        const reader = BitStringReader.fromBase64(writer.toBase64())!;
        expect(reader.readBool()).toBe(true);
        expect(reader.readUnsigned(3)).toBe(5);
        expect(reader.readBool()).toBe(false);
        expect(reader.readBool()).toBe(true);
        expect(reader.readUnsigned(16)).toBe(1600);
    });

    it("round-trips across many code units", () => {
        const writer = new BitStringWriter();
        const values = Array.from({ length: 5000 }, (_, i) => i % 1000);
        for (const v of values) writer.writeUnsigned(v, 10);
        const reader = BitStringReader.fromBase64(writer.toBase64())!;
        for (const v of values) expect(reader.readUnsigned(10)).toBe(v);
    });

    it("reports how many bits are available", () => {
        const writer = new BitStringWriter();
        writer.writeUnsigned(1, 1);
        writer.writeUnsigned(1, 1);
        writer.writeUnsigned(1, 1);
        const reader = BitStringReader.fromBase64(writer.toBase64())!;
        // 3 bits written, rounded up to one 16-bit code unit.
        expect(reader.bitsAvailable).toBe(16);
        reader.readUnsigned(3);
        expect(reader.bitsAvailable).toBe(13);
    });

    it("throws when reading past the end", () => {
        const writer = new BitStringWriter();
        writer.writeUnsigned(1, 1);
        const reader = BitStringReader.fromBase64(writer.toBase64())!;
        reader.readUnsigned(16);
        expect(() => reader.readUnsigned(1)).toThrow();
    });

    it("throws on overflow and negative values", () => {
        const writer = new BitStringWriter();
        expect(() => writer.writeUnsigned(16, 4)).toThrow();
        expect(() => writer.writeUnsigned(-1, 4)).toThrow();
        expect(() => writer.writeUnsigned(0, 64)).toThrow();
    });

    it("returns null for malformed base64", () => {
        expect(BitStringReader.fromBase64("!!!")).toBeNull();
    });
});
