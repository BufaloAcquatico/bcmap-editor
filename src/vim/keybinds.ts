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
    run: (e: KeyboardEvent) => void;
}

/** First matching binding wins; unmatched keys fall through untouched. */
export function createKeybindDispatcher(
    bindings: KeyBinding[],
): (e: KeyboardEvent) => void {
    return (e: KeyboardEvent) => {
        for (const binding of bindings) {
            if (binding.applies(e)) {
                binding.run(e);
                return;
            }
        }
    };
}

export interface EditorKeybindActions {
    toggleGrid: () => void;
    toggleHelp: () => void;
    undo: () => void;
    redo: () => void;
    handleVimKey: (e: KeyboardEvent) => boolean;
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
 * The editor's built-in shortcuts. Returns the registry so callers can both
 * install the dispatcher and render help from the same source of truth.
 */
export function installEditorKeybinds(
    actions: EditorKeybindActions,
): KeyBinding[] {
    return [
        {
            keys: "G",
            description: "Toggle grid",
            scope: "map",
            applies: (e) =>
                e.key === "G" && !e.ctrlKey && !e.metaKey && !e.altKey,
            run: (e) => {
                e.preventDefault();
                actions.toggleGrid();
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
            },
        },
        {
            keys: "Ctrl+Y / Ctrl+Shift+Z",
            description: "Redo",
            scope: "global",
            applies: (e) => {
                const key = e.key.toLowerCase();
                const withCtrl = (e.ctrlKey || e.metaKey) && !e.altKey;
                return (
                    ((key === "y" && withCtrl) ||
                        (key === "z" && withCtrl && e.shiftKey)) &&
                    !isEditableTarget(e)
                );
            },
            run: (e) => {
                e.preventDefault();
                actions.redo();
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
            },
        },
        {
            keys: "u",
            description: "Undo",
            scope: "map",
            applies: (e) => isCharKey(e, "u") && !isEditableTarget(e),
            run: (e) => {
                e.preventDefault();
                actions.handleVimKey(e);
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
            },
        },
    ];
}
