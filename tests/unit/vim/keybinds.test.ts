import { describe, it, expect, vi } from "vitest";
import {
    createKeybindDispatcher,
    isCharKey,
    isEditableTarget,
    installEditorKeybinds,
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
    it("runs the first matching binding only", () => {
        const first = vi.fn();
        const second = vi.fn();
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
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        const input = { tagName: "INPUT" } as unknown;

        dispatch(keyEvent("g", {}, input));
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
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        dispatch(keyEvent("x"));
        dispatch(keyEvent(" "));
        dispatch(keyEvent("u"));
        dispatch(keyEvent("v"));
        dispatch(keyEvent("y"));
        dispatch(keyEvent("Y"));
        dispatch(keyEvent("d"));
        dispatch(keyEvent("p"));
        dispatch(keyEvent("Escape"));
        expect(actions.handleVimKey).toHaveBeenCalledTimes(9);
    });

    it("does not route unbound letter keys to the vim controller", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        dispatch(keyEvent("z"));
        dispatch(keyEvent("q"));
        expect(actions.handleVimKey).not.toHaveBeenCalled();
    });

    it("never steals Space/Enter from a focused button", () => {
        const actions = {
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
        };
        const dispatch = createKeybindDispatcher(
            installEditorKeybinds(actions),
        );
        const button = { tagName: "BUTTON" } as unknown;
        dispatch(keyEvent(" ", {}, button));
        dispatch(keyEvent("Enter", {}, button));
        expect(actions.handleVimKey).not.toHaveBeenCalled();
    });

    it("describes every binding for the help registry", () => {
        const bindings = installEditorKeybinds({
            toggleGrid: vi.fn(),
            toggleHelp: vi.fn(),
            undo: vi.fn(),
            redo: vi.fn(),
            handleVimKey: vi.fn(() => true),
        });
        for (const binding of bindings) {
            expect(binding.keys.length).toBeGreaterThan(0);
            expect(binding.description.length).toBeGreaterThan(0);
            expect(["map", "sidebar", "global"]).toContain(binding.scope);
        }
        expect(bindings).toHaveLength(13);
    });
});
