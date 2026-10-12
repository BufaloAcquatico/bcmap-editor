// BCMap Editor - context-sensitive help card.
//
// Renders the help overlay from the keybind registry: only the current
// surface's slice, plus mouse rows, with a toggle for the full list.
// Rows still derive from the registry so card, README and dispatcher
// cannot drift; per-surface selection is by registry key, never
// hand-maintained text. Command/chrome surfaces have no dispatcher
// bindings, so their rows are tiny static lists. Visual selections
// survive surface changes: off-map surfaces carry a reminder while a
// region is open.

import type { AppSurface } from "./appSurface";

export interface HelpRegistryEntry {
    keys: string;
    description: string;
}

export interface HelpCardDeps {
    /** Overlay container (keeps its static title child). */
    card: HTMLElement;
    /** Keybind registry: the single source for rows. */
    registry: HelpRegistryEntry[];
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
    ["Left click / drag", "Paint tile or object"],
    ["Right drag", "Pan"],
    ["Wheel", "Zoom"],
];

const SURFACE_HELP_KEYS: Record<AppSurface, string[]> = {
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

const COMMAND_HELP_ROWS: Array<[string, string]> = [
    ["Enter", "Run the command"],
    ["Esc", "Cancel, back to the map"],
    ["Up / Down", "Recall command history"],
];

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

    const addRow = (keys: string, description: string) => {
        const row = deps.createElement("div");
        const kbds = keys
            .split("/")
            .map((k) => k.trim())
            .filter((k) => k.length > 0)
            .map((k) => `<kbd>${k}</kbd>`)
            .join(" / ");
        row.innerHTML = `${kbds} &mdash; ${description}`;
        deps.card.appendChild(row);
        nodes.push(row);
    };

    const render = () => {
        clearRows();
        addRow("Left click / drag", "Paint tile or object");
        addRow("Right drag", "Pan");
        addRow("Wheel", "Zoom");
        const surface = deps.getSurface();
        if (showAll) {
            deps.registry.forEach((entry) =>
                addRow(entry.keys, entry.description),
            );
        } else if (surface === "command") {
            COMMAND_HELP_ROWS.forEach(([keys, text]) => addRow(keys, text));
        } else if (surface === "chrome") {
            addRow("Esc", "Close the dialog, back to the map");
        } else {
            SURFACE_HELP_KEYS[surface].forEach((keys) => {
                const entry = entryByKeys.get(keys);
                if (entry) addRow(entry.keys, entry.description);
            });
        }
        if (surface !== "map" && deps.isVisualActive()) {
            const note = deps.createElement("div");
            note.textContent =
                "Visual selection kept — return to the map to use it";
            note.style.color = "#ffd479";
            deps.card.appendChild(note);
            nodes.push(note);
        }
        // The card itself is pointer-transparent so it never blocks the
        // canvas; only this toggle accepts pointer input.
        const toggle = deps.createElement("button") as HTMLButtonElement;
        toggle.type = "button";
        toggle.textContent = showAll
            ? "Show contextual keys"
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
    };

    return { render, setShowAll };
}
