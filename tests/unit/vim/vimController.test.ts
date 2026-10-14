import { describe, it, expect, beforeEach, vi } from "vitest";
import { VimController } from "../../../src/vim/vimController";
import type { GridPos } from "../../../src/vim/motions";

function makeController(boot: GridPos = { X: 20, Y: 20 }) {
    let cursor: GridPos | null = null;
    const intents = {
        setCursor: (pos: GridPos) => {
            cursor = pos;
        },
        bootCursor: () => boot,
        paintAt: vi.fn(),
        paintRegion: vi.fn(),
        yankRegion: vi.fn(),
        pasteYank: vi.fn(),
        pasteYankTiled: vi.fn(),
        flushEdits: vi.fn(),
        undo: vi.fn(),
    };
    const controller = new VimController(intents);
    return { controller, cursor: () => cursor, intents };
}

describe("VimController motions (normal mode)", () => {
    let ctx: ReturnType<typeof makeController>;
    beforeEach(() => {
        ctx = makeController();
    });

    it("initializes the cursor at boot position on the first motion", () => {
        expect(ctx.controller.handleKey("j")).toBe(true);
        expect(ctx.cursor()).toEqual({ X: 20, Y: 21 });
    });

    it("moves one cell per hjkl key", () => {
        ctx.controller.handleKey("j");
        ctx.controller.handleKey("k");
        expect(ctx.cursor()).toEqual({ X: 20, Y: 20 });
        ctx.controller.handleKey("l");
        expect(ctx.cursor()).toEqual({ X: 21, Y: 20 });
        ctx.controller.handleKey("h");
        expect(ctx.cursor()).toEqual({ X: 20, Y: 20 });
    });

    it("applies count prefixes", () => {
        ctx.controller.handleKey("3");
        expect(ctx.controller.handleKey("j")).toBe(true);
        expect(ctx.cursor()).toEqual({ X: 20, Y: 23 });
    });

    it("ignores a leading 0 as count and treats it as the row-start motion", () => {
        ctx.controller.handleKey("l");
        ctx.controller.handleKey("l");
        ctx.controller.handleKey("0");
        expect(ctx.cursor()).toEqual({ X: 0, Y: 20 });
    });

    it("supports 0 as part of a longer count", () => {
        ctx.controller.handleKey("2");
        ctx.controller.handleKey("0");
        ctx.controller.handleKey("j");
        expect(ctx.cursor()).toEqual({ X: 20, Y: 39 }); // clamped at bottom edge
    });

    it("supports $ as the row-end motion", () => {
        ctx.controller.handleKey("h");
        ctx.controller.handleKey("$");
        expect(ctx.cursor()).toEqual({ X: 39, Y: 20 });
    });

    it("supports gg for the top-left corner", () => {
        ctx.controller.handleKey("j");
        ctx.controller.handleKey("g");
        expect(ctx.cursor()).toEqual({ X: 20, Y: 21 }); // g alone does not move
        expect(ctx.controller.handleKey("g")).toBe(true);
        expect(ctx.cursor()).toEqual({ X: 0, Y: 0 });
    });

    it("cancels a pending g when another key follows", () => {
        ctx.controller.handleKey("g");
        ctx.controller.handleKey("j");
        expect(ctx.cursor()).toEqual({ X: 20, Y: 21 });
        ctx.controller.handleKey("g");
        ctx.controller.handleKey("g");
        expect(ctx.cursor()).toEqual({ X: 0, Y: 0 });
    });

    it("arrows work as motions too", () => {
        ctx.controller.handleKey("ArrowDown");
        expect(ctx.cursor()).toEqual({ X: 20, Y: 21 });
        ctx.controller.handleKey("ArrowRight");
        expect(ctx.cursor()).toEqual({ X: 21, Y: 21 });
    });

    it("does not consume unrelated keys", () => {
        expect(ctx.controller.handleKey("?")).toBe(false);
        expect(ctx.controller.handleKey("z")).toBe(false);
        expect(ctx.controller.handleKey("q")).toBe(false);
    });

    it("resets pending state after an unconsumed key", () => {
        ctx.controller.handleKey("3");
        ctx.controller.handleKey("?");
        ctx.controller.handleKey("j");
        expect(ctx.cursor()).toEqual({ X: 20, Y: 21 });
    });
});

describe("VimController status text", () => {
    it("shows the normal mode label by default", () => {
        expect(makeController().controller.statusModeText()).toBe("NORMAL");
    });

    it("shows pending count digits while typing a count", () => {
        const { controller } = makeController();
        controller.handleKey("1");
        controller.handleKey("2");
        expect(controller.statusModeText()).toBe("12");
    });

    it("shows pending g", () => {
        const { controller } = makeController();
        controller.handleKey("g");
        expect(controller.statusModeText()).toBe("g");
    });

    it("clears pending state once the motion resolves", () => {
        const { controller } = makeController();
        controller.handleKey("3");
        controller.handleKey("j");
        expect(controller.statusModeText()).toBe("NORMAL");
    });
});

describe("VimController verbs (normal mode)", () => {
    it("x is retired: not consumed and erases nothing", () => {
        const { controller, intents } = makeController();
        controller.handleKey("j");
        expect(controller.handleKey("x")).toBe(false);
        expect(intents.paintAt).not.toHaveBeenCalled();
    });

    it("boots the cursor when a verb arrives as the first key", () => {
        const { controller, intents } = makeController();
        controller.handleKey(" ");
        expect(intents.paintAt).toHaveBeenCalledWith({ X: 20, Y: 20 });
    });

    it("paints at the cursor on Space and Enter", () => {
        const { controller, intents } = makeController();
        controller.handleKey("j");
        intents.paintAt.mockClear();
        expect(controller.handleKey(" ")).toBe(true);
        expect(intents.paintAt).toHaveBeenCalledWith({ X: 20, Y: 21 });
        controller.handleKey("l");
        intents.paintAt.mockClear();
        expect(controller.handleKey("Enter")).toBe(true);
        expect(intents.paintAt).toHaveBeenCalledWith({ X: 21, Y: 21 });
    });

    it("u closes the current burst and undoes", () => {
        const { controller, intents } = makeController();
        expect(controller.handleKey("u")).toBe(true);
        expect(intents.flushEdits).toHaveBeenCalledTimes(1);
        expect(intents.undo).toHaveBeenCalledTimes(1);
    });

    it("counts do not leak into verb behavior", () => {
        const { controller, intents } = makeController();
        controller.handleKey("2");
        intents.paintAt.mockClear();
        controller.handleKey(" ");
        expect(intents.paintAt).toHaveBeenCalledWith({ X: 20, Y: 20 });
    });
});

describe("VimController visual mode", () => {
    let ctx: ReturnType<typeof makeController>;
    beforeEach(() => {
        ctx = makeController();
    });

    const region = () => ctx.controller.getRegion();
    const mode = () => ctx.controller.getMode();

    it("v enters visual mode anchored at the cursor", () => {
        expect(ctx.controller.handleKey("v")).toBe(true);
        expect(mode()).toBe("visual");
        expect(region()).toEqual({
            from: { X: 20, Y: 20 },
            to: { X: 20, Y: 20 },
        });
    });

    it("motions extend the selection", () => {
        ctx.controller.handleKey("v");
        ctx.controller.handleKey("2");
        ctx.controller.handleKey("l");
        expect(region()).toEqual({
            from: { X: 20, Y: 20 },
            to: { X: 22, Y: 20 },
        });
        expect(ctx.controller.statusModeText()).toBe("VISUAL 3x1");
    });

    it("dragging backwards normalizes the region", () => {
        ctx.controller.handleKey("v");
        ctx.controller.handleKey("l");
        ctx.controller.handleKey("l");
        ctx.controller.handleKey("h");
        ctx.controller.handleKey("h");
        ctx.controller.handleKey("h");
        expect(region()).toEqual({
            from: { X: 19, Y: 20 },
            to: { X: 20, Y: 20 },
        });
    });

    it("v again leaves visual mode", () => {
        ctx.controller.handleKey("v");
        ctx.controller.handleKey("l");
        ctx.controller.handleKey("v");
        expect(mode()).toBe("normal");
        expect(region()).toBeNull();
    });

    it("Escape leaves visual mode and drops the selection", () => {
        ctx.controller.handleKey("v");
        ctx.controller.handleKey("l");
        expect(ctx.controller.handleKey("Escape")).toBe(true);
        expect(mode()).toBe("normal");
        expect(region()).toBeNull();
    });

    it("y yanks the region (both layers) and exits visual", () => {
        ctx.controller.handleKey("v");
        ctx.controller.handleKey("l");
        ctx.controller.handleKey("y");
        expect(ctx.intents.yankRegion).toHaveBeenCalledWith({
            from: { X: 20, Y: 20 },
            to: { X: 21, Y: 20 },
        });
        expect(mode()).toBe("normal");
        expect(region()).toBeNull();
    });

    it("Y is an alias of y", () => {
        ctx.controller.handleKey("v");
        ctx.controller.handleKey("Y");
        expect(ctx.intents.yankRegion).toHaveBeenCalledWith({
            from: { X: 20, Y: 20 },
            to: { X: 20, Y: 20 },
        });
    });

    it("d is retired: not consumed, visual mode kept", () => {
        ctx.controller.handleKey("v");
        ctx.controller.handleKey("2");
        ctx.controller.handleKey("j");
        expect(ctx.controller.handleKey("d")).toBe(false);
        expect(mode()).toBe("visual");
        expect(region()).toEqual({
            from: { X: 20, Y: 20 },
            to: { X: 20, Y: 22 },
        });
    });

    it("Space fills the region and exits visual", () => {
        ctx.controller.handleKey("v");
        ctx.controller.handleKey("2");
        ctx.controller.handleKey("l");
        expect(ctx.controller.handleKey(" ")).toBe(true);
        expect(ctx.intents.paintRegion).toHaveBeenCalledWith({
            from: { X: 20, Y: 20 },
            to: { X: 22, Y: 20 },
        });
        expect(ctx.intents.paintAt).not.toHaveBeenCalled();
        expect(mode()).toBe("normal");
        expect(region()).toBeNull();
    });

    it("Enter fills the region just like Space", () => {
        ctx.controller.handleKey("v");
        ctx.controller.handleKey("j");
        expect(ctx.controller.handleKey("Enter")).toBe(true);
        expect(ctx.intents.paintRegion).toHaveBeenCalledWith({
            from: { X: 20, Y: 20 },
            to: { X: 20, Y: 21 },
        });
        expect(mode()).toBe("normal");
    });

    it("p pastes at the cursor in normal mode", () => {
        ctx.controller.handleKey("l");
        expect(ctx.controller.handleKey("p")).toBe(true);
        expect(ctx.intents.pasteYank).toHaveBeenCalledWith({ X: 21, Y: 20 });
        expect(ctx.intents.pasteYankTiled).not.toHaveBeenCalled();
    });

    it("p tiles the yank over the region and exits visual", () => {
        ctx.controller.handleKey("v");
        ctx.controller.handleKey("2");
        ctx.controller.handleKey("l");
        expect(ctx.controller.handleKey("p")).toBe(true);
        expect(ctx.intents.pasteYankTiled).toHaveBeenCalledWith({
            from: { X: 20, Y: 20 },
            to: { X: 22, Y: 20 },
        });
        expect(ctx.intents.pasteYank).not.toHaveBeenCalled();
        expect(mode()).toBe("normal");
        expect(region()).toBeNull();
    });

    it("region is null in normal mode", () => {
        expect(region()).toBeNull();
        expect(mode()).toBe("normal");
    });
});
