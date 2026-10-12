// BCMap Editor - context-sensitive help card.
//
// Renders the help overlay from the keybind registry: only the current
// surface's slice, plus mouse rows, with a toggle for the full list.
// Rows still derive from the registry so card, README and dispatcher
// cannot drift; per-surface selection is by registry key, never
// hand-maintained text. Command/chrome surfaces have no dispatcher
// bindings, so their rows are tiny static lists — plus, on command, the
// full `:` command registry. Visual selections
// survive surface changes: off-map surfaces carry a reminder while a
// region is open.

import type { AppSurface } from "./appSurface";
import type { KeybindGroup } from "./vim/keybinds";
import { fadeIn } from "./anim";

export interface HelpRegistryEntry {
    keys: string;
    description: string;
    group: KeybindGroup;
}

/** One `:` command for the command-mode slice (syntax + plain words). */
export interface CommandHelpEntry {
    syntax: string;
    description: string;
}

export interface HelpCardDeps {
    /** Overlay container (keeps its static title child). */
    card: HTMLElement;
    /** Keybind registry: the single source for rows. */
    registry: HelpRegistryEntry[];
    /** `:` command registry: listed in full on the command surface. */
    commands: CommandHelpEntry[];
    /** Current tracked surface. */
    getSurface: () => AppSurface;
    /** Whether a visual-mode region is currently open. */
    isVisualActive: () => boolean;
    /** Element factory (injectable for unit tests). */
    createElement: (tag: string) => HTMLElement;
}

export interface HelpCardRenderer {
    render: () => void;
    setShowAll: (show: boolean) => void;
}

const MOUSE_HELP_ROWS: Array<[string, string]> = [
    ["Left click / drag", "Paint tiles or objects"],
    ["Right drag", "Move the view"],
    ["Wheel", "Zoom"],
];

type HelpGroup = KeybindGroup | "mouse";

/** Display order for help sections; also drives the README table. */
export const GROUP_ORDER: HelpGroup[] = [
    "mouse",
    "cursor",
    "paint",
    "clipboard",
    "navigate",
    "command",
    "system",
];

export const GROUP_LABELS: Record<HelpGroup, string> = {
    mouse: "Mouse",
    cursor: "Cursor",
    paint: "Paint",
    clipboard: "Clipboard",
    navigate: "Navigate",
    command: "Command",
    system: "System",
};

const SURFACE_LABELS: Record<AppSurface, string> = {
    map: "Map keys",
    picker: "Sidebar keys",
    search: "Search keys",
    command: "Command line",
    chrome: "Popup",
};

/** Registry keys shown per surface; every entry must resolve in KEYBIND_HELP. */
export const SURFACE_HELP_KEYS: Record<AppSurface, string[]> = {
    map: [
        "hjkl / arrows",
        "Space / Enter",
        "v",
        "y / Y",
        "p",
        "u",
        "/",
        ":",
        "Tab",
        "?",
        "Esc",
    ],
    picker: ["arrows", "Enter", "Tab", "/", "Esc", "?"],
    search: ["Enter", "Tab", "Esc", "?"],
    command: [],
    chrome: [],
};

const COMMAND_HELP_ROWS: Array<[string, string, KeybindGroup]> = [
    ["Enter", "Run what you typed", "command"],
    ["Esc", "Cancel and go back to the map", "system"],
    ["Up / Down", "Show earlier commands", "system"],
];

/** One row inside a section: keys for the left column, text for the right. */
interface HelpItem {
    keys: string;
    text: string;
}

export function createHelpRenderer(deps: HelpCardDeps): HelpCardRenderer {
    const entryByKeys = new Map(
        deps.registry.map((entry) => [entry.keys, entry]),
    );
    let showAll = false;
    let nodes: HTMLElement[] = [];

    const clearRows = () => {
        nodes.forEach((node) => node.remove());
        nodes = [];
    };

    const formatKeys = (keys: string) =>
        keys
            .split("/")
            .map((k) => k.trim())
            .filter((k) => k.length > 0)
            .map((k) => `<kbd>${k}</kbd>`)
            .join(" / ");

    // One shared grid wrapper aligns the key column across every
    // section; labels span the full row. Rows are key/desc span pairs
    // appended straight into it (never nested), so alignment holds.
    const render = () => {
        clearRows();
        const surface = deps.getSurface();
        const byGroup = new Map<HelpGroup, HelpItem[]>();
        const push = (group: HelpGroup, keys: string, text: string) => {
            const list = byGroup.get(group) ?? [];
            list.push({ keys, text });
            byGroup.set(group, list);
        };
        const pushEntry = (keys: string) => {
            const entry = entryByKeys.get(keys);
            if (entry) push(entry.group, entry.keys, entry.description);
        };
        MOUSE_HELP_ROWS.forEach(([keys, text]) => push("mouse", keys, text));
        if (showAll) {
            deps.registry.forEach((entry) =>
                push(entry.group, entry.keys, entry.description),
            );
        } else if (surface === "command") {
            COMMAND_HELP_ROWS.forEach(([keys, text, group]) =>
                push(group, keys, text),
            );
            deps.commands.forEach((command) =>
                push("command", command.syntax, command.description),
            );
        } else if (surface === "chrome") {
            push("system", "Esc", "Close and go back to the map");
        } else {
            SURFACE_HELP_KEYS[surface].forEach(pushEntry);
        }
        const label = deps.createElement("div");
        label.className = "help-surface-label";
        label.textContent = showAll ? "All keys" : SURFACE_LABELS[surface];
        deps.card.appendChild(label);
        nodes.push(label);
        const grid = deps.createElement("div");
        grid.className = "help-sections";
        for (const group of GROUP_ORDER) {
            const items = byGroup.get(group);
            if (!items || items.length === 0) continue;
            const heading = deps.createElement("div");
            heading.className = "help-section-label";
            heading.textContent = GROUP_LABELS[group];
            grid.appendChild(heading);
            for (const item of items) {
                const keysEl = deps.createElement("span");
                keysEl.className = "help-keys";
                keysEl.innerHTML = formatKeys(item.keys);
                const textEl = deps.createElement("span");
                textEl.className = "help-desc";
                textEl.textContent = item.text;
                grid.appendChild(keysEl);
                grid.appendChild(textEl);
            }
        }
        deps.card.appendChild(grid);
        nodes.push(grid);
        if (surface !== "map" && deps.isVisualActive()) {
            const note = deps.createElement("div");
            note.textContent =
                "Your selection is kept — go back to the map to use it";
            note.style.color = "#ffd479";
            deps.card.appendChild(note);
            nodes.push(note);
        }
        // The card itself is pointer-transparent so it never blocks the
        // canvas; only this toggle accepts pointer input.
        const toggle = deps.createElement("button") as HTMLButtonElement;
        toggle.type = "button";
        toggle.textContent = showAll
            ? "Show keys for this screen"
            : `Show all keys (${deps.registry.length})`;
        toggle.style.pointerEvents = "auto";
        toggle.style.cursor = "pointer";
        toggle.style.background = "none";
        toggle.style.border = "none";
        toggle.style.padding = "0";
        toggle.style.font = "inherit";
        toggle.style.fontSize = "inherit";
        toggle.style.color = "#8ea2ff";
        toggle.style.textDecoration = "underline";
        toggle.addEventListener("click", () => setShowAll(!showAll));
        deps.card.appendChild(toggle);
        nodes.push(toggle);
    };

    const setShowAll = (show: boolean) => {
        showAll = show;
        render();
        fadeIn(deps.card);
    };

    // The card breathes on every reslice; the toggle path above
    // re-renders first, so wrapping render would double-fade it.
    const renderAndBreathe = () => {
        render();
        fadeIn(deps.card);
    };

    return { render: renderAndBreathe, setShowAll };
}
