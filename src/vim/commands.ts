// BCMap Editor - `:` command line for the vim keyboard feature.
//
// Pure parsing + dispatch against injected actions, so the command set is
// unit-testable without the DOM. The registry below is also the single
// source for help text.

export interface CommandActions {
    /** Export the current map (`:w [name]`). */
    writeMap: (name?: string) => void;
    /** Open the Import modal (`:e`). */
    openImport: () => void;
    toggleHelp: () => void;
    toggleGrid: () => void;
    /** Paint a Bresenham line on the active layer (`:line x1,y1 x2,y2`). */
    drawLine: (x1: number, y1: number, x2: number, y2: number) => void;
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
        description: "Save the map",
    },
    {
        name: "write",
        syntax: ":write [name]",
        description: "Same as :w",
    },
    {
        name: "e",
        syntax: ":e",
        description: "Open a saved map",
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

/** Run one command; never throws — errors come back as {ok: false, error}. */
export function runCommand(
    input: string,
    actions: CommandActions,
): CommandResult {
    const { name, args } = parseCommand(input);
    if (!name) return { ok: false };

    switch (name) {
        case "w":
        case "write":
            actions.writeMap(args.join(" ") || undefined);
            return { ok: true };
        case "e":
            actions.openImport();
            return { ok: true };
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
