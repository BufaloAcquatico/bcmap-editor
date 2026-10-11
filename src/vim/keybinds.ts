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
export const KEYBIND_HELP: {
    keys: string;
    description: string;
    scope: "map" | "sidebar" | "global";
}[] = [
    {
        keys: "hjkl / arrows",
        description: "Move cursor (counts, 0, $, gg)",
        scope: "map",
    },
    {
        keys: "Space / Enter",
        description: "Paint selection at cursor",
        scope: "map",
    },
    { keys: "x", description: "Erase cursor cell", scope: "map" },
    { keys: "v", description: "Visual mode (select region)", scope: "map" },
    { keys: "y / Y", description: "Yank region (both layers)", scope: "map" },
    { keys: "d", description: "Delete visual region", scope: "map" },
    { keys: "p", description: "Paste yank at cursor", scope: "map" },
    { keys: "u", description: "Undo (vim alias)", scope: "map" },
    {
        keys: "Esc",
        description: "Cancel selection / pending state",
        scope: "map",
    },
    {
        keys: ":",
        description: "Command line (w/e/help/grid/line)",
        scope: "map",
    },
    { keys: "/", description: "Focus the picker search", scope: "map" },
    {
        keys: "arrows",
        description: "Navigate picker (groups: collapse/expand)",
        scope: "sidebar",
    },
    { keys: "G", description: "Toggle grid", scope: "map" },
    { keys: "?", description: "Toggle help overlay", scope: "map" },
    { keys: "Ctrl+Z", description: "Undo", scope: "global" },
    {
        keys: "Ctrl+Y / Ctrl+Shift+Z / Ctrl+R",
        description: "Redo",
        scope: "global",
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
    toggleHelp: () => void;
    undo: () => void;
    redo: () => void;
    handleVimKey: (e: KeyboardEvent) => boolean;
    /** Open the `:` command prompt in the status bar. */
    openCommandPrompt: () => void;
    /** Focus the picker search box (`/`). */
    focusSearch: () => void;
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
 * so G/?/undo keep working no matter where focus is (D10).
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
            description: "Navigate picker (groups: collapse/expand)",
            scope: "sidebar",
            applies: (e) =>
                isSidebarSurface(e) && !e.ctrlKey && !e.metaKey && !e.altKey,
            run: (e) => actions.handleSidebarKey(e),
        },
        {
            keys: "G",
            description: "Toggle grid",
            scope: "map",
            applies: (e) =>
                e.key === "G" && !e.ctrlKey && !e.metaKey && !e.altKey,
            run: (e) => {
                e.preventDefault();
                actions.toggleGrid();
                return true;
            },
        },
        {
            keys: "?",
            description: "Toggle help overlay",
            scope: "map",
            applies: (e) => isCharKey(e, "?") && !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.toggleHelp();
                return true;
            },
        },
        {
            keys: "Ctrl+Z",
            description: "Undo",
            scope: "global",
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
            description: "Move cursor (counts, 0, $, gg)",
            scope: "map",
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
            keys: "x",
            description: "Erase cursor cell",
            scope: "map",
            applies: (e) => isCharKey(e, "x") && !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.handleVimKey(e);
                return true;
            },
        },
        {
            keys: "Space / Enter",
            description: "Paint selection at cursor",
            scope: "map",
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
            description: "Undo (vim alias)",
            scope: "map",
            applies: (e) => isCharKey(e, "u") && !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.handleVimKey(e);
                return true;
            },
        },
        {
            keys: "v",
            description: "Visual mode (select region)",
            scope: "map",
            applies: (e) => isCharKey(e, "v") && !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.handleVimKey(e);
                return true;
            },
        },
        {
            keys: "y / Y",
            description: "Yank region (both layers)",
            scope: "map",
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
            keys: "d",
            description: "Delete visual region",
            scope: "map",
            applies: (e) => isCharKey(e, "d") && !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.handleVimKey(e);
                return true;
            },
        },
        {
            keys: "p",
            description: "Paste yank at cursor",
            scope: "map",
            applies: (e) => isCharKey(e, "p") && !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.handleVimKey(e);
                return true;
            },
        },
        {
            keys: "Esc",
            description: "Cancel selection / pending state",
            scope: "map",
            applies: (e) => e.key === "Escape" && !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.handleVimKey(e);
                return true;
            },
        },
        {
            keys: ":",
            description: "Command line (w/e/help/grid/line)",
            scope: "map",
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
            description: "Focus the picker search",
            scope: "map",
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
