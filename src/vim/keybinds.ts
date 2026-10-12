// BCMap Editor - single keybind dispatcher + registry.
//
// One window keydown listener owns all editor shortcuts. Each binding
// declares its keys, help text and scope (map / sidebar / global), so the
// same array drives both behavior and any cheatsheet/README rendering.

/** True when the event target is a text field: editor keys must not fire. */
export function isEditableTarget(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || !!target?.isContentEditable;
}

/** True for a bare character key with no Ctrl/Cmd/Alt (Shift allowed, e.g. "?"). */
export function isCharKey(e: KeyboardEvent, key: string): boolean {
    return (
        e.key.toLowerCase() === key.toLowerCase() &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
    );
}

/** A keyboard shortcut: matching predicate + action + documentation. */
export interface KeyBinding {
    keys: string;
    description: string;
    scope: "map" | "sidebar" | "global";
    group: KeybindGroup;
    applies: (e: KeyboardEvent) => boolean;
    /** Returns true when the key was consumed; false lets the next binding try. */
    run: (e: KeyboardEvent) => boolean;
}

/**
 * Plain-data view of every shortcut: the single source for the in-app help
 * card (init.ts renders it) and the README Controls table
 * (scripts/render-keybinds-doc.js). A unit test guards it against drift
 * from the installEditorKeybinds definitions.
 */
export type KeybindGroup =
    "cursor" | "paint" | "clipboard" | "navigate" | "command" | "system";

export const KEYBIND_HELP: {
    keys: string;
    description: string;
    scope: "map" | "sidebar" | "global";
    group: KeybindGroup;
}[] = [
    {
        keys: "hjkl / arrows",
        description: "Move around the map",
        scope: "map",
        group: "cursor",
    },
    {
        keys: "Space / Enter",
        description: "Paint tiles on the map",
        scope: "map",
        group: "paint",
    },
    {
        keys: "v",
        description: "Select an area",
        scope: "map",
        group: "paint",
    },
    {
        keys: "y / Y",
        description: "Copy the selected area",
        scope: "map",
        group: "clipboard",
    },
    {
        keys: "p",
        description: "Paste what you copied",
        scope: "map",
        group: "clipboard",
    },
    {
        keys: "u",
        description: "Undo the last change",
        scope: "map",
        group: "clipboard",
    },
    {
        keys: "Esc",
        description: "Cancel",
        scope: "map",
        group: "system",
    },
    {
        keys: ":",
        description: "Type a command",
        scope: "global",
        group: "command",
    },
    {
        keys: "/",
        description: "Search for tiles and objects",
        scope: "map",
        group: "navigate",
    },
    {
        keys: "arrows",
        description: "Move through the tile list",
        scope: "sidebar",
        group: "navigate",
    },
    {
        keys: "Tab",
        description: "Switch between the map and the sidebar",
        scope: "global",
        group: "navigate",
    },
    {
        keys: "Enter",
        description: "Pick the tile",
        scope: "sidebar",
        group: "navigate",
    },
    {
        keys: "G",
        description: "Show or hide the grid",
        scope: "map",
        group: "navigate",
    },
    {
        keys: "+ / =",
        description: "Zoom in",
        scope: "map",
        group: "navigate",
    },
    {
        keys: "-",
        description: "Zoom out",
        scope: "map",
        group: "navigate",
    },
    {
        keys: "?",
        description: "Show or hide this help",
        scope: "map",
        group: "system",
    },
    {
        keys: "Ctrl+Z",
        description: "Undo the last change",
        scope: "global",
        group: "system",
    },
    {
        keys: "Ctrl+Y / Ctrl+Shift+Z / Ctrl+R",
        description: "Redo",
        scope: "global",
        group: "system",
    },
];

/**
 * Bindings are tried in order; the first whose `applies` matches AND whose
 * `run` returns true consumes the key. A binding that declines (e.g. the
 * sidebar router sees a key it does not own) lets later bindings try.
 */
export function createKeybindDispatcher(
    bindings: KeyBinding[],
): (e: KeyboardEvent) => void {
    return (e: KeyboardEvent) => {
        for (const binding of bindings) {
            if (!binding.applies(e)) continue;
            if (binding.run(e)) return;
        }
    };
}

export interface EditorKeybindActions {
    toggleGrid: () => void;
    /** Zoom the map canvas in one step (`+` / `=`). */
    zoomIn: () => void;
    /** Zoom the map canvas out one step (`-`). */
    zoomOut: () => void;
    toggleHelp: () => void;
    undo: () => void;
    redo: () => void;
    handleVimKey: (e: KeyboardEvent) => boolean;
    /** Open the `:` command prompt in the status bar. */
    openCommandPrompt: () => void;
    /** Focus the picker search box (`/`). */
    focusSearch: () => void;
    /** Focus the picker resume spot (`Tab` from the map). */
    focusPicker: () => void;
    /** Return focus to the map canvas (`Tab`/`Esc` from picker/search). */
    focusMap: () => void;
    /** Focus the first matching sprite (`Enter` in search). */
    focusFirstMatch: () => void;
    /**
     * Sidebar key router: navigate/collapse with arrows, printable keys to
     * the search box, Esc back to the map surface. Returns false for keys it
     * does not own so later bindings (G, ?, …) still apply.
     */
    handleSidebarKey: (e: KeyboardEvent) => boolean;
}

/** Bare keys owned by the vim controller (motions, counts, row bounds, gg). */
const VIM_MOTION_KEYS =
    /^([hjkl0-9$g]|ArrowLeft|ArrowDown|ArrowUp|ArrowRight)$/;

/** Space/Enter must not steal activation from focused buttons/links. */
function isInteractiveTarget(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    return (
        tag === "BUTTON" || tag === "A" || tag === "SELECT" || tag === "SUMMARY"
    );
}

/**
 * True when focus sits inside the picker sidebar (a sprite button or a
 * category header). The sidebar router binding runs first and may decline,
 * so G/?/undo keep working no matter where focus is.
 */
export function isSidebarSurface(e: KeyboardEvent): boolean {
    const target = e.target as HTMLElement | null;
    return !!target?.closest?.("#sidebar");
}

/**
 * The editor's built-in shortcuts. Returns the registry so callers can both
 * install the dispatcher and render help from the same source of truth.
 */
export function installEditorKeybinds(
    actions: EditorKeybindActions,
): KeyBinding[] {
    return [
        {
            keys: "arrows",
            description: "Move through the tile list",
            scope: "sidebar",
            group: "navigate",
            applies: (e) =>
                isSidebarSurface(e) && !e.ctrlKey && !e.metaKey && !e.altKey,
            run: (e) => actions.handleSidebarKey(e),
        },
        {
            keys: "Enter",
            description: "Pick the tile",
            scope: "sidebar",
            group: "navigate",
            applies: (e) => {
                if (e.ctrlKey || e.metaKey || e.altKey) return false;
                if (e.key !== "Enter") return false;
                const target = e.target as HTMLElement | null;
                return (
                    target?.tagName === "INPUT" &&
                    (target as HTMLInputElement).id === "searchInput"
                );
            },
            run: (e) => {
                e.preventDefault();
                actions.focusFirstMatch();
                return true;
            },
        },
        {
            keys: "Tab",
            description: "Switch between the map and the sidebar",
            scope: "global",
            group: "navigate",
            applies: (e) => {
                if (e.ctrlKey || e.metaKey || e.altKey) return false;
                if (e.key !== "Tab") return false;
                const target = e.target as HTMLElement | null;
                // Search-box Tab → map (Enter → picker is the binding above).
                if (
                    target?.tagName === "INPUT" &&
                    (target as HTMLInputElement).id === "searchInput"
                )
                    return true;
                // Map-surface Tab → picker resume spot. Sidebar-surface Tab
                // is owned by the sidebar router (Tab → map, no commit).
                return !isEditableTarget(e) && !isSidebarSurface(e);
            },
            run: (e) => {
                e.preventDefault();
                const target = e.target as HTMLElement | null;
                // Search-box Tab → map; map-surface Tab → picker resume.
                // Sidebar-surface Tab never reaches here (sidebar router owns
                // it: Tab → map, no commit).
                if (
                    target?.tagName === "INPUT" &&
                    (target as HTMLInputElement).id === "searchInput"
                ) {
                    actions.focusMap();
                    return true;
                }
                actions.focusPicker();
                return true;
            },
        },
        {
            keys: "G",
            description: "Show or hide the grid",
            scope: "map",
            group: "navigate",
            // Text fields own their keys: without this guard, typing a
            // capital G in search (or a modal) would toggle the grid and
            // swallow the character.
            applies: (e) =>
                e.key === "G" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.toggleGrid();
                return true;
            },
        },
        {
            keys: "+ / =",
            description: "Zoom in",
            scope: "map",
            group: "navigate",
            // Text fields own their keys, and Ctrl+= is the browser's
            // own zoom: without these guards typing or browser-zooming
            // would move the map instead.
            applies: (e) =>
                (e.key === "+" || e.key === "=") &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.zoomIn();
                return true;
            },
        },
        {
            keys: "-",
            description: "Zoom out",
            scope: "map",
            group: "navigate",
            applies: (e) =>
                e.key === "-" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.zoomOut();
                return true;
            },
        },
        {
            keys: "?",
            description: "Show or hide this help",
            scope: "map",
            group: "system",
            applies: (e) => isCharKey(e, "?") && !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.toggleHelp();
                return true;
            },
        },
        {
            keys: "Ctrl+Z",
            description: "Undo the last change",
            scope: "global",
            group: "system",
            applies: (e) => {
                const key = e.key.toLowerCase();
                return (
                    key === "z" &&
                    (e.ctrlKey || e.metaKey) &&
                    !e.shiftKey &&
                    !e.altKey &&
                    !isEditableTarget(e)
                );
            },
            run: (e) => {
                e.preventDefault();
                actions.undo();
                return true;
            },
        },
        {
            keys: "Ctrl+Y / Ctrl+Shift+Z / Ctrl+R",
            description: "Redo",
            scope: "global",
            group: "system",
            applies: (e) => {
                const key = e.key.toLowerCase();
                const withCtrl = (e.ctrlKey || e.metaKey) && !e.altKey;
                return (
                    ((key === "y" && withCtrl) ||
                        (key === "z" && withCtrl && e.shiftKey) ||
                        (key === "r" && withCtrl)) &&
                    !isEditableTarget(e)
                );
            },
            run: (e) => {
                e.preventDefault();
                actions.redo();
                return true;
            },
        },
        {
            keys: "hjkl / arrows",
            description: "Move around the map",
            scope: "map",
            group: "cursor",
            applies: (e) =>
                VIM_MOTION_KEYS.test(e.key) &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !isEditableTarget(e),
            run: (e) => {
                // Matched keys are vim-owned (motions/counts); prevent the
                // browser default (e.g. arrow-key page scroll) regardless.
                e.preventDefault();
                actions.handleVimKey(e);
                return true;
            },
        },
        {
            keys: "Space / Enter",
            description: "Paint tiles on the map",
            scope: "map",
            group: "paint",
            applies: (e) =>
                (e.key === " " || e.key === "Enter") &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !isEditableTarget(e) &&
                !isInteractiveTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.handleVimKey(e);
                return true;
            },
        },
        {
            keys: "u",
            description: "Undo the last change",
            scope: "map",
            group: "clipboard",
            applies: (e) => isCharKey(e, "u") && !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.handleVimKey(e);
                return true;
            },
        },
        {
            keys: "v",
            description: "Select an area",
            scope: "map",
            group: "paint",
            applies: (e) => isCharKey(e, "v") && !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.handleVimKey(e);
                return true;
            },
        },
        {
            keys: "y / Y",
            description: "Copy the selected area",
            scope: "map",
            group: "clipboard",
            applies: (e) =>
                !isEditableTarget(e) &&
                (isCharKey(e, "y") || isCharKey(e, "Y")),
            run: (e) => {
                e.preventDefault();
                actions.handleVimKey(e);
                return true;
            },
        },
        {
            keys: "p",
            description: "Paste what you copied",
            scope: "map",
            group: "clipboard",
            applies: (e) => isCharKey(e, "p") && !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.handleVimKey(e);
                return true;
            },
        },
        {
            keys: "Esc",
            description: "Cancel",
            scope: "map",
            group: "system",
            applies: (e) => e.key === "Escape" && !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.handleVimKey(e);
                return true;
            },
        },
        {
            keys: ":",
            description: "Type a command",
            scope: "global",
            group: "command",
            applies: (e) =>
                e.key === ":" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.openCommandPrompt();
                return true;
            },
        },
        {
            keys: "/",
            description: "Search for tiles and objects",
            scope: "map",
            group: "navigate",
            applies: (e) =>
                e.key === "/" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.focusSearch();
                return true;
            },
        },
    ];
}
