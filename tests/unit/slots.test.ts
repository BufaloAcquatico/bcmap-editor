import { describe, it, expect } from "vitest";
import {
    MAX_SLOTS,
    SLOT_FULL_MESSAGE,
    deleteSlot,
    formatAbsoluteTime,
    formatRelativeTime,
    isDirty,
    isStorageAvailable,
    listSlots,
    loadSlot,
    sanitizeName,
    saveSlot,
    snapshotMap,
    type MinimalStorage,
    type SlotEntry,
} from "../../src/slots";

// In-memory Storage stand-in: the store only touches get/set/remove, so a
// Map-backed fake covers every path without touching real localStorage.
function makeMemoryStorage(): MinimalStorage {
    const data = new Map<string, string>();
    return {
        getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
        setItem: (key: string, value: string) => {
            data.set(key, String(value));
        },
        removeItem: (key: string) => {
            data.delete(key);
        },
    };
}

function quotaStorage(): MinimalStorage {
    const inner = makeMemoryStorage();
    const quotaError = Object.assign(new Error("Quota exceeded"), {
        name: "QuotaExceededError",
    });
    return {
        ...inner,
        setItem: () => {
            throw quotaError;
        },
    };
}

function brokenStorage(): MinimalStorage {
    return {
        getItem: () => {
            throw new Error("denied");
        },
        setItem: () => {
            throw new Error("denied");
        },
        removeItem: () => {
            throw new Error("denied");
        },
    };
}

const entry = (overrides: Partial<SlotEntry> = {}): SlotEntry => ({
    code: "map-code-1",
    savedAt: 1_780_000_000_000,
    thumbnail: "data:image/jpeg;base64,AAA",
    ...overrides,
});

const mapLike = (tiles: string) => ({
    Type: "Always" as const,
    Tiles: tiles,
    Objects: "o".repeat(tiles.length),
});

describe("sanitizeName", () => {
    it("trims surrounding whitespace", () => {
        expect(sanitizeName("  garage-wip  ")).toBe("garage-wip");
    });

    it("drops characters outside letters, numbers, dash and space", () => {
        expect(sanitizeName("my/map:name.txt!")).toBe("mymapnametxt");
    });

    it("collapses internal whitespace runs to a single space", () => {
        expect(sanitizeName("a   b\tc")).toBe("a b c");
    });

    it("strips leading and trailing dashes and spaces", () => {
        expect(sanitizeName("-- garage --")).toBe("garage");
    });

    it("truncates to 40 characters", () => {
        expect(sanitizeName("a".repeat(50))).toBe("a".repeat(40));
    });

    it("returns an empty string when nothing valid remains", () => {
        expect(sanitizeName("")).toBe("");
        expect(sanitizeName("   ")).toBe("");
        expect(sanitizeName("///")).toBe("");
    });

    it("preserves casing and single internal dashes", () => {
        expect(sanitizeName("Garage WIP-2")).toBe("Garage WIP-2");
    });
});

describe("slot store", () => {
    it("round-trips a saved slot with code, timestamp and thumbnail", () => {
        const storage = makeMemoryStorage();
        const saved = entry();
        expect(saveSlot(storage, "garage", saved).ok).toBe(true);
        expect(loadSlot(storage, "garage")).toEqual(saved);
    });

    it("lists slots newest-first", () => {
        const storage = makeMemoryStorage();
        saveSlot(storage, "old", entry({ savedAt: 1000 }));
        saveSlot(storage, "new", entry({ savedAt: 2000 }));
        expect(listSlots(storage).map((s) => s.name)).toEqual(["new", "old"]);
    });

    it("overwrites case-insensitively and keeps the original casing", () => {
        const storage = makeMemoryStorage();
        saveSlot(storage, "garage", entry({ code: "v1" }));
        const result = saveSlot(storage, "GARAGE", entry({ code: "v2" }));
        expect(result).toEqual({ ok: true, name: "garage" });
        expect(loadSlot(storage, "garage")).toMatchObject({ code: "v2" });
        expect(listSlots(storage)).toHaveLength(1);
    });

    it("loads and deletes case-insensitively", () => {
        const storage = makeMemoryStorage();
        saveSlot(storage, "Garage", entry());
        expect(loadSlot(storage, "GARAGE")).toEqual(entry());
        expect(deleteSlot(storage, "gArAgE")).toBe(true);
        expect(listSlots(storage)).toHaveLength(0);
    });

    it("returns null and false for unknown names", () => {
        const storage = makeMemoryStorage();
        expect(loadSlot(storage, "nope")).toBeNull();
        expect(deleteSlot(storage, "nope")).toBe(false);
    });

    it("rejects an empty name after sanitizing", () => {
        const storage = makeMemoryStorage();
        const result = saveSlot(storage, "///", entry());
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/name/i);
        expect(listSlots(storage)).toHaveLength(0);
    });

    it(`refuses the ${MAX_SLOTS + 1}th slot without touching existing data`, () => {
        const storage = makeMemoryStorage();
        for (let i = 0; i < MAX_SLOTS; i++) {
            expect(saveSlot(storage, `map ${i}`, entry()).ok).toBe(true);
        }
        const result = saveSlot(storage, "one-too-many", entry());
        expect(result).toEqual({ ok: false, error: SLOT_FULL_MESSAGE });
        expect(listSlots(storage)).toHaveLength(MAX_SLOTS);
    });

    it("still allows overwriting an existing slot when full", () => {
        const storage = makeMemoryStorage();
        for (let i = 0; i < MAX_SLOTS; i++) {
            saveSlot(storage, `map ${i}`, entry());
        }
        expect(saveSlot(storage, "map 0", entry({ code: "v2" })).ok).toBe(true);
    });

    it("treats a wholly corrupt blob as empty without throwing", () => {
        const storage = makeMemoryStorage();
        storage.setItem("bcmap.v1.slots", "not-json{{{");
        expect(listSlots(storage)).toEqual([]);
        expect(loadSlot(storage, "anything")).toBeNull();
    });

    it("drops a corrupt entry but keeps the healthy ones", () => {
        const storage = makeMemoryStorage();
        saveSlot(storage, "good", entry());
        storage.setItem(
            "bcmap.v1.slots",
            JSON.stringify({
                version: 1,
                slots: {
                    good: entry(),
                    bad: { code: 42, savedAt: "yesterday" },
                },
            }),
        );
        expect(listSlots(storage).map((s) => s.name)).toEqual(["good"]);
    });

    it("reports a quota failure and leaves existing data intact", () => {
        const inner = makeMemoryStorage();
        saveSlot(inner, "kept", entry());
        const result = saveSlot(quotaStorage(), "doomed", entry());
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toMatch(/full/i);
        expect(loadSlot(inner, "kept")).toEqual(entry());
    });

    it("probes storage availability without throwing", () => {
        expect(isStorageAvailable(makeMemoryStorage())).toBe(true);
        expect(isStorageAvailable(brokenStorage())).toBe(false);
    });
});

describe("dirty baseline", () => {
    it("is clean for identical map data", () => {
        const data = mapLike("a".repeat(1600));
        expect(isDirty(snapshotMap(data), data)).toBe(false);
    });

    it("is dirty when any layer changes", () => {
        const before = mapLike("a".repeat(1600));
        const baseline = snapshotMap(before);
        expect(isDirty(baseline, mapLike("b" + "a".repeat(1599)))).toBe(true);
        expect(isDirty(baseline, { ...before, Type: "Hybrid" as const })).toBe(
            true,
        );
    });
});

describe("time formatters", () => {
    const NOW = 1_780_000_000_000;

    it("renders relative times from seconds to years", () => {
        expect(formatRelativeTime(NOW - 10_000, NOW)).toBe("just now");
        expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe("5m ago");
        expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe("3h ago");
        expect(formatRelativeTime(NOW - 2 * 86_400_000, NOW)).toBe("2d ago");
        expect(formatRelativeTime(NOW - 3 * 7 * 86_400_000, NOW)).toBe(
            "3w ago",
        );
        expect(formatRelativeTime(NOW - 60 * 86_400_000, NOW)).toBe("2mo ago");
        expect(formatRelativeTime(NOW - 360 * 86_400_000, NOW)).toBe("1y ago");
        expect(formatRelativeTime(NOW - 400 * 86_400_000, NOW)).toBe("1y ago");
    });

    it("clamps future timestamps to just now", () => {
        expect(formatRelativeTime(NOW + 60_000, NOW)).toBe("just now");
    });

    it("renders an absolute local timestamp containing the year", () => {
        const text = formatAbsoluteTime(NOW);
        expect(typeof text).toBe("string");
        expect(text.length).toBeGreaterThan(0);
        expect(text).toMatch(/2026/);
    });
});
