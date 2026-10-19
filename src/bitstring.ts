// BCMap Editor - minimal port of Bondage Club's BitString module.
//
// The game encodes per-cell map effects as a packed bit string (see
// `BondageClub/Scripts/BitString.js`) and base64-encodes it. To read and
// write game-compatible effect data we must reproduce that packing exactly,
// so this is a faithful (but trimmed) port of the sections we use: unsigned
// writes/reads plus a single-bit helper. Behaviour and byte layout match the
// original; the extensive invariant checks from upstream are dropped.
//
// Layout: a sequence of 16-bit little-endian code units, packed with values
// written lowest-bit-first. Base64 is applied byte-wise (low byte then high
// byte) via `btoa`/`atob`, exactly like the game's `_BitStringHelperInternal`.

const CHAR_BITS = 16;
const CHAR_MASK = 0xffff;
const SAFE_INTEGER_BITS = 53;

/** Minimal bits needed to store an unsigned value (0 => 0 bits). */
export function getBitsCountForUnsigned(value: number): number {
    return value === 0 ? 0 : Math.floor(Math.log2(value)) + 1;
}

/** Largest unsigned value that fits in `bits` bits. */
export function maxUnsignedInBits(bits: number): number {
    return Math.pow(2, bits) - 1;
}

/** Packs variable-width unsigned integers into a little-endian bit stream. */
export class BitStringWriter {
    private buffer: number[] = [];
    private freeBitsLastChar = 0;

    writeUnsigned(value: number, bits: number): this {
        if (bits < 0 || bits > SAFE_INTEGER_BITS) {
            throw new Error(`BitStringWriter: invalid bit width ${bits}`);
        }
        if (value < 0) {
            throw new Error(`BitStringWriter: negative value ${value}`);
        }
        if (value > maxUnsignedInBits(bits)) {
            throw new Error(
                `BitStringWriter: value ${value} does not fit in ${bits} bits`,
            );
        }
        // Zero-width fields are a no-op (the value must be 0, checked above).
        if (bits === 0) return this;

        // 1. Fill the free bits of the current last code unit.
        if (this.freeBitsLastChar > 0) {
            const bitsToWrite = Math.min(this.freeBitsLastChar, bits);
            this.freeBitsLastChar -= bitsToWrite;
            const last = this.buffer.length - 1;
            this.buffer[last] +=
                (value & maxUnsignedInBits(bitsToWrite)) *
                Math.pow(2, this.freeBitsLastChar);
            bits -= bitsToWrite;
            value = Math.floor(value / Math.pow(2, bitsToWrite));
        }

        // 2. Emit whole code units.
        while (bits >= CHAR_BITS) {
            this.buffer.push(value & CHAR_MASK);
            this.freeBitsLastChar = 0;
            bits -= CHAR_BITS;
            value = Math.floor(value / Math.pow(2, CHAR_BITS));
        }

        // 3. Emit the remaining bits into a fresh last code unit.
        if (bits > 0) {
            this.freeBitsLastChar = CHAR_BITS - bits;
            this.buffer.push(value * Math.pow(2, this.freeBitsLastChar));
        }
        return this;
    }

    writeBool(value: boolean): this {
        if (this.freeBitsLastChar <= 0) {
            this.buffer.push(0);
            this.freeBitsLastChar = CHAR_BITS;
        }
        this.freeBitsLastChar -= 1;
        if (value) {
            this.buffer[this.buffer.length - 1] += Math.pow(
                2,
                this.freeBitsLastChar,
            );
        }
        return this;
    }

    toBase64(): string {
        return u16ArrayToBase64(this.buffer);
    }
}

/** Reads unsigned integers back out of a bit stream written by the game. */
export class BitStringReader {
    private charPos = 0;
    private bitPosLastChar = 0;

    constructor(private buffer: string) {}

    static fromBase64(b64: string): BitStringReader | null {
        const str = base64ToU16String(b64);
        return str === null ? null : new BitStringReader(str);
    }

    /** Bits still readable (not counting already-consumed ones). */
    get bitsAvailable(): number {
        return (
            (this.buffer.length - this.charPos) * CHAR_BITS -
            this.bitPosLastChar
        );
    }

    readUnsigned(bits: number): number {
        if (bits === 0) return 0;
        if (bits < 0 || bits > SAFE_INTEGER_BITS) {
            throw new Error(`BitStringReader: invalid bit width ${bits}`);
        }
        if (this.bitsAvailable < bits) {
            throw new Error(
                `BitStringReader: requested ${bits} bits, only ${this.bitsAvailable} available`,
            );
        }
        const requested = bits;
        const bitsToReadLastChar = Math.min(
            bits,
            CHAR_BITS - this.bitPosLastChar,
        );
        let acc = this.readBitsLastChar(bitsToReadLastChar);
        let accBitRead = bitsToReadLastChar;
        bits -= bitsToReadLastChar;
        while (bits >= CHAR_BITS) {
            acc += this.readFullChar() * Math.pow(2, accBitRead);
            accBitRead += CHAR_BITS;
            bits -= CHAR_BITS;
        }
        if (bits > 0) {
            acc += this.readBitsLastChar(bits) * Math.pow(2, accBitRead);
            accBitRead += bits;
        }
        if (accBitRead !== requested) {
            throw new Error("BitStringReader: internal read mismatch");
        }
        return acc;
    }

    readBool(): boolean {
        if (this.charPos >= this.buffer.length) {
            throw new Error("BitStringReader: no more bits to read");
        }
        const skipLowBits = CHAR_BITS - this.bitPosLastChar - 1;
        const bit = (this.buffer.charCodeAt(this.charPos) >> skipLowBits) & 1;
        this.advanceBits(1);
        return bit === 1;
    }

    /** Reads `bits` (< CHAR_BITS) from the current code unit. */
    private readBitsLastChar(bits: number): number {
        if (bits > CHAR_BITS - this.bitPosLastChar) {
            throw new Error("BitStringReader: read past current code unit");
        }
        const mask = maxUnsignedInBits(bits);
        const skipLowBits = CHAR_BITS - this.bitPosLastChar - bits;
        const res =
            (this.buffer.charCodeAt(this.charPos) >> skipLowBits) & mask;
        this.advanceBits(bits);
        return res;
    }

    private readFullChar(): number {
        if (this.bitPosLastChar !== 0 || this.charPos >= this.buffer.length) {
            throw new Error("BitStringReader: unaligned full read");
        }
        const res = this.buffer.charCodeAt(this.charPos);
        this.charPos += 1;
        return res;
    }

    private advanceBits(bits: number): void {
        const pos = this.bitPosLastChar + bits;
        this.bitPosLastChar = pos % CHAR_BITS;
        this.charPos += Math.floor(pos / CHAR_BITS);
    }
}

/** 16-bit code units -> base64, one code unit per two little-endian bytes. */
function u16ArrayToBase64(buffer: number[]): string {
    let byteString = "";
    for (const codeUnit of buffer) {
        byteString += String.fromCharCode(codeUnit & 0xff);
        byteString += String.fromCharCode((codeUnit >> 8) & 0xff);
    }
    return btoa(byteString);
}

/** Inverse of {@link u16ArrayToBase64}; null on malformed base64. */
function base64ToU16String(b64: string): string | null {
    let byteString: string;
    try {
        byteString = atob(b64);
    } catch {
        return null;
    }
    let out = "";
    for (let i = 0; i + 1 < byteString.length; i += 2) {
        out += String.fromCharCode(
            byteString.charCodeAt(i) | (byteString.charCodeAt(i + 1) << 8),
        );
    }
    return out;
}
