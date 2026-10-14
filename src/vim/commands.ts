// BCMap Editor - `:` command line for the vim keyboard feature.
//
// Pure parsing + dispatch against injected actions, so the command set is
// unit-testable without the DOM. The registry below is also the single
// source for help text.

import {
    sanitizeName,
    SLOT_FULL_MESSAGE,
    STORAGE_UNAVAILABLE_MESSAGE,
} from "../slots";

export interface CommandActions {
    /** Save the current map to a browser slot (`:w [name]`, `:w!`). */
    saveSlot: (name: string) => void;
    /** Open the Saved Maps window (`:e`). */
    openSlots: () => void;
    /** Load a slot directly (`:e name`, `:e!`). */
    loadSlot: (name: string) => void;
    /** Start a new map (`:enew`, `:enew!`). */
    newMap: () => void;
    /** Download the current map or a slot as a file (`:export [name]`). */
    exportMap: (name?: string) => void;
    /** Open the Import modal (`:import`). */
    openImport: () => void;
    toggleHelp: () => void;
    toggleGrid: () => void;
    /** Paint a Bresenham line on the active layer (`:line x1,y1 x2,y2`). */
    drawLine: (x1: number, y1: number, x2: number, y2: number) => void;
}

/**
 * Slot state the command layer reads but never owns: supplied by init.ts,
 * which tracks the current name, the store contents and the dirty baseline.
 */
export interface SlotState {
    /** Whether browser storage is usable at all (private mode, file://). */
    available: boolean;
    /** Name the map was saved/loaded under, if any (drives bare `:w`). */
    currentName: string | null;
    /** Case-insensitive slot lookup. */
    hasSlot: (name: string) => boolean;
    /** Whether the map differs from the last slot save/load. */
    isDirty: boolean;
    /** Whether the list already holds MAX_SLOTS entries. */
    isFull: boolean;
}

export interface CommandInfo {
    name: string;
    syntax: string;
    description: string;
}

export const COMMANDS: CommandInfo[] = [
    {
        name: "w",
        syntax: ":w [name]",
        description: "Save the map to a browser slot (add ! to overwrite)",
    },
    {
        name: "write",
        syntax: ":write [name]",
        description: "Same as :w",
    },
    {
        name: "e",
        syntax: ":e [name]",
        description: "Open a saved map (add ! to discard changes)",
    },
    {
        name: "enew",
        syntax: ":enew",
        description: "Start a new map (add ! to discard changes)",
    },
    {
        name: "export",
        syntax: ":export [name]",
        description: "Download the map as a .txt file",
    },
    {
        name: "import",
        syntax: ":import",
        description: "Import a map code",
    },
    {
        name: "help",
        syntax: ":help",
        description: "Show or hide this help",
    },
    {
        name: "grid",
        syntax: ":grid",
        description: "Show or hide the grid",
    },
    {
        name: "line",
        syntax: ":line x1,y1 x2,y2",
        description: "Draw a straight line of tiles",
    },
];

export interface CommandResult {
    ok: boolean;
    error?: string;
}

const USAGE = "usage: :line x1,y1 x2,y2 (e.g. :line 0,0 39,20)";
const E13 = "E13: File exists (add ! to override)";
const E32 = "E32: No file name";
const E37 = "E37: No write since last change (add ! to override)";
const INVALID_NAME =
    "E486: Invalid map name — use letters, numbers, dash and space (max 40).";

/** Split command line into a lowercase name and its arguments. */
export function parseCommand(input: string): { name: string; args: string[] } {
    const trimmed = input.trim().replace(/^:+/, "").trim();
    if (!trimmed) return { name: "", args: [] };
    const parts = trimmed.split(/\s+/);
    return {
        name: parts[0].toLowerCase(),
        args: parts.slice(1),
    };
}

/** Parse a "x,y" pair; returns null when malformed. */
function parsePair(arg: string): { x: number; y: number } | null {
    const match = arg.trim().match(/^(-?\d+)\s*,\s*(-?\d+)$/);
    if (!match) return null;
    return { x: Number(match[1]), y: Number(match[2]) };
}

/** A trailing `!` forces (`:w!`, `:e!`, `:enew!`); returns the base name. */
function splitBang(name: string): { base: string; force: boolean } {
    if (name.length > 1 && name.endsWith("!")) {
        return { base: name.slice(0, -1), force: true };
    }
    return { base: name, force: false };
}

/**
 * Validate a user-typed slot name against the store charset. Commands
 * reject (E486) rather than silently mutating what the user typed; the
 * store re-sanitizes as a backstop.
 */
function checkSlotName(raw: string): CommandResult | string {
    if (sanitizeName(raw) !== raw) return { ok: false, error: INVALID_NAME };
    return raw;
}

function sameName(a: string, b: string | null): boolean {
    return b !== null && a.toLowerCase() === b.toLowerCase();
}

/** Run one command; never throws — errors come back as {ok: false, error}. */
export function runCommand(
    input: string,
    actions: CommandActions,
    state: SlotState,
): CommandResult {
    const { name, args } = parseCommand(input);
    if (!name) return { ok: false };

    const { base, force } = splitBang(name);
    switch (base) {
        case "w":
        case "write": {
            if (!state.available)
                return { ok: false, error: STORAGE_UNAVAILABLE_MESSAGE };
            const raw = args.join(" ");
            const checked = raw ? checkSlotName(raw) : null;
            if (checked !== null && typeof checked !== "string") return checked;
            const target = raw || state.currentName;
            if (!target) return { ok: false, error: E32 };
            if (!force && state.isFull && !state.hasSlot(target)) {
                return { ok: false, error: SLOT_FULL_MESSAGE };
            }
            if (
                !force &&
                state.hasSlot(target) &&
                !sameName(target, state.currentName)
            ) {
                return { ok: false, error: E13 };
            }
            actions.saveSlot(target);
            return { ok: true };
        }
        case "e": {
            if (args.length === 0) {
                actions.openSlots();
                return { ok: true };
            }
            const raw = args.join(" ");
            const checked = checkSlotName(raw);
            if (typeof checked !== "string") return checked;
            if (!state.available)
                return { ok: false, error: STORAGE_UNAVAILABLE_MESSAGE };
            if (!state.hasSlot(raw)) {
                return {
                    ok: false,
                    error: `E486: No saved map named "${raw}"`,
                };
            }
            if (!force && state.isDirty) return { ok: false, error: E37 };
            actions.loadSlot(raw);
            return { ok: true };
        }
        case "enew": {
            if (!force && state.isDirty) return { ok: false, error: E37 };
            actions.newMap();
            return { ok: true };
        }
        case "export": {
            actions.exportMap(args.join(" ") || undefined);
            return { ok: true };
        }
        case "import": {
            actions.openImport();
            return { ok: true };
        }
        case "help":
            actions.toggleHelp();
            return { ok: true };
        case "grid":
            actions.toggleGrid();
            return { ok: true };
        case "line": {
            if (args.length !== 2) {
                return { ok: false, error: `E486: ${USAGE}` };
            }
            const from = parsePair(args[0]);
            const to = parsePair(args[1]);
            if (!from || !to) {
                return { ok: false, error: `E486: ${USAGE}` };
            }
            actions.drawLine(from.x, from.y, to.x, to.y);
            return { ok: true };
        }
        default:
            return { ok: false, error: `E492: Not an editor command: ${name}` };
    }
}
