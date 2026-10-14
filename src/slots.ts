// BCMap Editor - browser save-slot store.
//
// Versioned single-key localStorage store for named map slots: each save
// rewrites one blob, so a slot write is atomic (no half-written index vs.
// orphaned values). Entries that fail validation are dropped individually,
// so one corrupt slot can never brick the rest.
//
// DOM-free on purpose: init.ts owns the UI, the editor owns thumbnails; this
// module only moves plain data in and out of storage. The storage backend is
// injected (localStorage in the app, an in-memory fake in tests), which also
// keeps this importable in a node test env where localStorage is undefined.
// Type-only import: erased at compile time, so the embed script needs no
// new require mapping for this module.

import type { MapData } from "./mapdata";

export const SLOTS_STORAGE_KEY = "bcmap.v1.slots";
export const STORE_VERSION = 1;
/** Hard cap: worst-case full house stays well under a quarter of quota. */
export const MAX_SLOTS = 30;
export const MAX_NAME_LENGTH = 40;
export const SLOT_FULL_MESSAGE =
    "Slot list full (30/30) — delete a saved map or export one to a file first";
export const INVALID_NAME_MESSAGE =
    "Invalid map name — use letters, numbers, dash and space (max 40).";
export const STORAGE_FULL_MESSAGE =
    "Browser storage is full — export a map to a file to free space.";

export interface SlotEntry {
    code: string;
    savedAt: number;
    thumbnail: string;
}

export interface SlotMeta extends SlotEntry {
    name: string;
}

/** Everything the store touches: localStorage satisfies this as-is. */
export type MinimalStorage = Pick<
    Storage,
    "getItem" | "setItem" | "removeItem"
>;

export type SaveResult =
    { ok: true; name: string } | { ok: false; error: string };

type SlotTable = Record<string, SlotEntry>;

/**
 * Reduce a raw name to the storable form: letters, numbers, dash and space
 * only, single internal spaces, no leading/trailing dashes or spaces, max
 * 40 chars. Returns "" when nothing valid remains (caller rejects).
 */
export function sanitizeName(raw: string): string {
    const cleaned = raw
        .replace(/\s+/g, " ")
        .replace(/[^A-Za-z0-9 \-]/g, "")
        .replace(/^[\- ]+|[\- ]+$/g, "");
    return cleaned.slice(0, MAX_NAME_LENGTH);
}

/** Probe whether a storage backend actually accepts writes. Never throws. */
export function isStorageAvailable(storage: MinimalStorage): boolean {
    const probeKey = "__bcmap_probe__";
    try {
        storage.setItem(probeKey, "1");
        storage.removeItem(probeKey);
        return true;
    } catch {
        return false;
    }
}

function isValidEntry(value: unknown): value is SlotEntry {
    if (!value || typeof value !== "object") return false;
    const entry = value as Record<string, unknown>;
    return (
        typeof entry.code === "string" &&
        typeof entry.thumbnail === "string" &&
        typeof entry.savedAt === "number" &&
        Number.isFinite(entry.savedAt)
    );
}

/** Read the table, dropping corrupt entries; a corrupt blob reads as empty. */
function readTable(storage: MinimalStorage): SlotTable {
    let raw: string | null = null;
    try {
        raw = storage.getItem(SLOTS_STORAGE_KEY);
    } catch {
        return {};
    }
    if (!raw) return {};
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    if (!parsed || typeof parsed !== "object") return {};
    const slots = (parsed as Record<string, unknown>).slots;
    if (!slots || typeof slots !== "object") return {};
    const table: SlotTable = {};
    for (const [name, value] of Object.entries(slots)) {
        if (isValidEntry(value)) table[name] = value;
    }
    return table;
}

function findKey(table: SlotTable, name: string): string | null {
    const lowered = name.toLowerCase();
    for (const key of Object.keys(table)) {
        if (key.toLowerCase() === lowered) return key;
    }
    return null;
}

function isQuotaError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const err = error as { name?: unknown; code?: unknown };
    return (
        err.name === "QuotaExceededError" ||
        err.code === 22 ||
        err.code === 1014
    );
}

/** Slots newest-first. */
export function listSlots(storage: MinimalStorage): SlotMeta[] {
    return Object.entries(readTable(storage))
        .map(([name, entry]) => ({ name, ...entry }))
        .sort((a, b) => b.savedAt - a.savedAt);
}

/** Case-insensitive lookup; null when missing or storage is unreadable. */
export function loadSlot(
    storage: MinimalStorage,
    name: string,
): SlotEntry | null {
    const table = readTable(storage);
    const key = findKey(table, name);
    return key === null ? null : table[key];
}

/**
 * Store a slot. Overwriting is case-insensitive and keeps the original
 * casing; a genuinely new name past MAX_SLOTS is refused (overwrites always
 * succeed). Storage failures surface as {ok: false}, never throw — except
 * nothing here throws at all.
 */
export function saveSlot(
    storage: MinimalStorage,
    rawName: string,
    entry: SlotEntry,
): SaveResult {
    const name = sanitizeName(rawName);
    if (!name) return { ok: false, error: INVALID_NAME_MESSAGE };
    const table = readTable(storage);
    const existing = findKey(table, name);
    const key = existing ?? name;
    if (existing === null && Object.keys(table).length >= MAX_SLOTS) {
        return { ok: false, error: SLOT_FULL_MESSAGE };
    }
    table[key] = entry;
    try {
        storage.setItem(
            SLOTS_STORAGE_KEY,
            JSON.stringify({ version: STORE_VERSION, slots: table }),
        );
    } catch (error) {
        return {
            ok: false,
            error: isQuotaError(error)
                ? STORAGE_FULL_MESSAGE
                : `Failed to save "${key}": ${error instanceof Error ? error.message : String(error)}`,
        };
    }
    return { ok: true, name: key };
}

/** Case-insensitive delete; false when the name is unknown. */
export function deleteSlot(storage: MinimalStorage, name: string): boolean {
    const table = readTable(storage);
    const key = findKey(table, name);
    if (key === null) return false;
    delete table[key];
    try {
        storage.setItem(
            SLOTS_STORAGE_KEY,
            JSON.stringify({ version: STORE_VERSION, slots: table }),
        );
    } catch {
        return false;
    }
    return true;
}

export type MapSnapshot = Pick<MapData, "Type" | "Tiles" | "Objects">;

/** Comparable baseline of the editable map state for dirty checking. */
export function snapshotMap(data: MapSnapshot): string {
    return JSON.stringify({
        Type: data.Type,
        Tiles: data.Tiles,
        Objects: data.Objects,
    });
}

/** True when the map differs from a baseline taken by snapshotMap. */
export function isDirty(baseline: string, data: MapSnapshot): boolean {
    return snapshotMap(data) !== baseline;
}

/** "just now" / "5m ago" / "3h ago" / "2d ago" / "3w ago" / "2mo ago" / "1y ago". */
export function formatRelativeTime(savedAt: number, now: number): string {
    const seconds = Math.max(0, Math.floor((now - savedAt) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
}

/** Absolute timestamp in the client's locale and timezone. */
export function formatAbsoluteTime(savedAt: number): string {
    return new Date(savedAt).toLocaleString();
}
