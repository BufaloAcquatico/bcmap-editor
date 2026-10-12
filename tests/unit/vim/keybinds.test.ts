import { describe, it, expect, vi } from "vitest";
import {
    createKeybindDispatcher,
    isCharKey,
    isEditableTarget,
    isSidebarSurface,
    installEditorKeybinds,
    KEYBIND_HELP,
} from "../../../src/vim/keybinds";

const keyEvent = (
    key: string,
    opts: Partial<KeyboardEvent> = {},
    target?: unknown,
): KeyboardEvent =>
    ({
        key,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault: vi.fn(),
        target,
        ...opts,
    }) as unknown as KeyboardEvent;

describe("isEditableTarget", () => {
    it("treats inputs, textareas and contenteditable as editable", () => {
        expect(isEditableTarget(keyEvent("a", {}, { tagName: "INPUT" }))).toBe(
            true,
        );
        expect(
            isEditableTarget(keyEvent("a", {}, { tagName: "TEXTAREA" })),
        ).toBe(true);
        expect(
            isEditableTarget(
                keyEvent("a", {}, { tagName: "DIV", isContentEditable: true }),
            ),
        ).toBe(true);
    });

    it("does not treat canvas or body as editable", () => {
        expect(isEditableTarget(keyEvent("a", {}, { tagName: "CANVAS" }))).toBe(
            false,
        );
        expect(isEditableTarget(keyEvent("a", {}, { tagName: "BODY" }))).toBe(
            false,
        );
        expect(isEditableTarget(keyEvent("a", {}, undefined))).toBe(false);
    });
});

describe("isCharKey", () => {
    it("matches a plain character regardless of shift", () => {
        expect(isCharKey(keyEvent("g"), "g")).toBe(true);
        expect(isCharKey(keyEvent("?"), "?")).toBe(true);
    });

    it("requires no modifier keys", () => {
        expect(isCharKey(keyEvent("g", { ctrlKey: true }), "g")).toBe(false);
        expect(isCharKey(keyEvent("g", { metaKey: true }), "g")).toBe(false);
        expect(isCharKey(keyEvent("g", { altKey: true }), "g")).toBe(false);
    });
});

describe("createKeybindDispatcher", () => {
    it("stops at the first binding that consumes the key", () => {
        const first = vi.fn(() => true);
        const second = vi.fn(() => true);
        const dispatch = createKeybindDispatcher([
            {
                keys: "j",
                description: "first",
                scope: "map",
                applies: (e) => isCharKey(e, "j"),
                run: first,
            },
            {
                keys: "j",
                description: "second",
                scope: "map",
                applies: (e) => isCharKey(e, "j"),
                run: second,
            },
        ]);
        dispatch(keyEvent("j"));
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).not.toHaveBeenCalled();
    });

    it("ignores keys that match no binding", () => {
        const run = vi.fn();
        const dispatch = createKeybindDispatcher([
            {
                keys: "j",
                description: "first",
                scope: "map",
                applies: (e) => isCharKey(e, "j"),
                run,
            },
        ]);
        dispatch(keyEvent("q"));
        expect(run).not.toHaveBeenCalled();
    });
});

describe("installEditorKeybinds", () => {
    it("wires G to grid, ? to help, Ctrl+Z to undo, Ctrl+Y and Ctrl+Shift+Z to redo", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey: vi.fn(() => true),
        };
        const bindings = installEditorKeybinds(actions);
        const dispatch = createKeybindDispatcher(bindings);

        dispatch(keyEvent("G"));
        expect(actions.toggleGrid).toHaveBeenCalledTimes(1);

        dispatch(keyEvent("g"));
        expect(actions.handleVimKey).toHaveBeenCalledTimes(1);
        expect(actions.toggleGrid).toHaveBeenCalledTimes(1);

        dispatch(keyEvent("?"));
        expect(actions.toggleHelp).toHaveBeenCalledTimes(1);

        dispatch(keyEvent("z", { ctrlKey: true }));
        expect(actions.undo).toHaveBeenCalledTimes(1);

        dispatch(keyEvent("y", { ctrlKey: true }));
        expect(actions.redo).toHaveBeenCalledTimes(1);

        dispatch(keyEvent("Z", { ctrlKey: true, shiftKey: true }));
        expect(actions.redo).toHaveBeenCalledTimes(2);
    });

    it("ignores plain keys while a text field has focus", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey: vi.fn(() => true),
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        const input = { tagName: "INPUT" } as unknown;

        dispatch(keyEvent("g", {}, input));
        dispatch(keyEvent("G", {}, input));
        dispatch(keyEvent("?", {}, input));
        expect(actions.toggleGrid).not.toHaveBeenCalled();
        expect(actions.toggleHelp).not.toHaveBeenCalled();

        dispatch(keyEvent("z", { ctrlKey: true }, input));
        dispatch(keyEvent("y", { ctrlKey: true }, input));
        expect(actions.undo).not.toHaveBeenCalled();
        expect(actions.redo).not.toHaveBeenCalled();
    });

    it("keeps undo/redo distinct: Ctrl+Z has no redo, Ctrl+Shift+Z is not undo", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey: vi.fn(() => true),
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );

        dispatch(keyEvent("Z", { ctrlKey: true, shiftKey: true }));
        expect(actions.undo).not.toHaveBeenCalled();
        expect(actions.redo).toHaveBeenCalledTimes(1);

        dispatch(keyEvent("z", { ctrlKey: true }));
        expect(actions.undo).toHaveBeenCalledTimes(1);
        expect(actions.redo).toHaveBeenCalledTimes(1);
    });

    it("routes vim motion keys, counts and arrows to the vim controller", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey: vi.fn(() => true),
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        dispatch(keyEvent("3"));
        dispatch(keyEvent("j"));
        dispatch(keyEvent("ArrowDown"));
        dispatch(keyEvent("0"));
        dispatch(keyEvent("$"));
        expect(actions.handleVimKey).toHaveBeenCalledTimes(5);
    });

    it("routes verb keys to the vim controller", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey: vi.fn(() => true),
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        dispatch(keyEvent(" "));
        dispatch(keyEvent("u"));
        dispatch(keyEvent("v"));
        dispatch(keyEvent("y"));
        dispatch(keyEvent("Y"));
        dispatch(keyEvent("p"));
        dispatch(keyEvent("Escape"));
        expect(actions.handleVimKey).toHaveBeenCalledTimes(7);
    });

    it("does not route unbound letter keys to the vim controller", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey: vi.fn(() => true),
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        dispatch(keyEvent("z"));
        dispatch(keyEvent("q"));
        dispatch(keyEvent("x"));
        dispatch(keyEvent("d"));
        expect(actions.handleVimKey).not.toHaveBeenCalled();
    });

    it("never steals Space/Enter from a focused button", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey: vi.fn(() => true),
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        const button = { tagName: "BUTTON" } as unknown;
        dispatch(keyEvent(" ", {}, button));
        dispatch(keyEvent("Enter", {}, button));
        expect(actions.handleVimKey).not.toHaveBeenCalled();
    });

    it("routes : to the command prompt and / to the search box", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey: vi.fn(() => true),
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        dispatch(keyEvent(":"));
        expect(actions.openCommandPrompt).toHaveBeenCalledTimes(1);
        dispatch(keyEvent("/"));
        expect(actions.focusSearch).toHaveBeenCalledTimes(1);
    });

    it("does not open the command prompt while typing in a field", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey: vi.fn(() => true),
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        dispatch(keyEvent(":", {}, { tagName: "INPUT" }));
        expect(actions.openCommandPrompt).not.toHaveBeenCalled();
    });

    it("describes every binding for the help registry", () => {
        const bindings = installEditorKeybinds({
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey: vi.fn(() => true),
        });
        for (const binding of bindings) {
            expect(binding.keys.length).toBeGreaterThan(0);
            expect(binding.description.length).toBeGreaterThan(0);
            expect(["map", "sidebar", "global"]).toContain(binding.scope);
        }
        expect(bindings).toHaveLength(16);
    });
});

describe("Keybind registry help-sync", () => {
    const bindingsWith = (handleSidebarKey: (e: KeyboardEvent) => boolean) =>
        installEditorKeybinds({
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey,
        });

    it("keeps every binding documented in KEYBIND_HELP", () => {
        for (const binding of bindingsWith(() => true)) {
            const entry = KEYBIND_HELP.find((h) => h.keys === binding.keys);
            expect(
                entry,
                `${binding.keys} missing from KEYBIND_HELP`,
            ).toBeDefined();
            expect(entry!.description).toBe(binding.description);
            expect(entry!.scope).toBe(binding.scope);
        }
    });

    it("has no stale help entries", () => {
        const bindings = bindingsWith(() => true);
        for (const entry of KEYBIND_HELP) {
            expect(
                bindings.some((b) => b.keys === entry.keys),
                `${entry.keys} has no binding`,
            ).toBe(true);
        }
    });
});

describe("Sidebar surface routing", () => {
    const sidebar = () => {
        const target = {
            tagName: "BUTTON",
            closest: (sel: string) => (sel === "#sidebar" ? {} : null),
        };
        return target as unknown;
    };
    const map = () => ({ tagName: "CANVAS" }) as unknown;

    it("detects sidebar focus via the #sidebar ancestor", () => {
        expect(isSidebarSurface(keyEvent("j", {}, sidebar()))).toBe(true);
        expect(isSidebarSurface(keyEvent("j", {}, map()))).toBe(false);
        expect(isSidebarSurface(keyEvent("j", {}, undefined))).toBe(false);
    });

    it("offers sidebar keys to the sidebar router first", () => {
        const handleSidebarKey = vi.fn(() => true);
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey,
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        dispatch(keyEvent("j", {}, sidebar()));
        expect(handleSidebarKey).toHaveBeenCalledTimes(1);
        expect(actions.handleVimKey).not.toHaveBeenCalled();
    });

    it("falls through to later bindings when the sidebar router declines", () => {
        const handleSidebarKey = vi.fn(() => false);
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey,
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        dispatch(keyEvent("G", {}, sidebar()));
        expect(handleSidebarKey).toHaveBeenCalledTimes(1);
        expect(actions.toggleGrid).toHaveBeenCalledTimes(1);
    });

    it("routes Tab on the map to the picker and Tab in search to the map", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey: vi.fn(() => false),
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        dispatch(keyEvent("Tab", {}, map()));
        expect(actions.focusPicker).toHaveBeenCalledTimes(1);
        expect(actions.focusMap).not.toHaveBeenCalled();

        const searchInput = {
            tagName: "INPUT",
            id: "searchInput",
            closest: (sel: string) => (sel === "#sidebar" ? {} : null),
        } as unknown;
        dispatch(keyEvent("Tab", {}, searchInput));
        expect(actions.focusMap).toHaveBeenCalledTimes(1);
    });

    it("routes Enter in search to the first match", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey: vi.fn(() => false),
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        const searchInput = {
            tagName: "INPUT",
            id: "searchInput",
            closest: (sel: string) => (sel === "#sidebar" ? {} : null),
        } as unknown;
        dispatch(keyEvent("Enter", {}, searchInput));
        expect(actions.focusFirstMatch).toHaveBeenCalledTimes(1);
        expect(actions.handleVimKey).not.toHaveBeenCalled();
    });

    it("treats Shift+Tab exactly like Tab (no reverse navigation)", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
            openCommandPrompt: vi.fn(),
            focusSearch: vi.fn(),
            focusPicker: vi.fn(),
            focusMap: vi.fn(),
            focusFirstMatch: vi.fn(),
            handleSidebarKey: vi.fn(() => false),
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        dispatch(keyEvent("Tab", { shiftKey: true }, map()));
        expect(actions.focusPicker).toHaveBeenCalledTimes(1);
        const searchInput = {
            tagName: "INPUT",
            id: "searchInput",
            closest: (sel: string) => (sel === "#sidebar" ? {} : null),
        } as unknown;
        dispatch(keyEvent("Tab", { shiftKey: true }, searchInput));
        expect(actions.focusMap).toHaveBeenCalledTimes(1);
    });
});
