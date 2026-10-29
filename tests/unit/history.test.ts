import { describe, it, expect, vi } from "vitest";
import { MapHistory, type MapSnapshot } from "../../src/history";

const snap = (
    tiles: string,
    objects: string,
    effects = "",
    showEffects = true,
    fog = false,
): MapSnapshot => ({ tiles, objects, effects, showEffects, fog });

const A = snap("a-tiles", "a-objects");
const B = snap("b-tiles", "b-objects");

describe("MapHistory", () => {
    it("undo on an empty stack is a no-op without notify", () => {
        const h = new MapHistory();
        const cb = vi.fn();
        h.onChange = cb;
        expect(h.undo(A)).toBeNull();
        expect(h.redo(A)).toBeNull();
        expect(cb).not.toHaveBeenCalled();
        expect(h.canUndo()).toBe(false);
        expect(h.canRedo()).toBe(false);
    });

    it("a stroke round-trips through undo/redo", () => {
        const h = new MapHistory();
        h.beginStroke(A);
        h.markDirty();
        h.endStroke();
        expect(h.canUndo()).toBe(true);
        expect(h.undo(B)).toEqual(A);
        expect(h.canRedo()).toBe(true);
        expect(h.redo(A)).toEqual(B);
        expect(h.canRedo()).toBe(false);
    });

    it("an empty stroke rolls back and restores the redo stack", () => {
        const h = new MapHistory();
        h.beginStroke(A);
        h.markDirty();
        h.endStroke();
        h.undo(B); // one redo entry
        h.beginStroke(B); // no-op stroke
        h.endStroke();
        expect(h.canUndo()).toBe(false);
        expect(h.canRedo()).toBe(true);
    });

    it("keeps a mid-stroke undo's redo entry on endStroke", () => {
        const h = new MapHistory();
        h.beginStroke(A);
        h.markDirty();
        h.endStroke();
        h.beginStroke(B); // no-op stroke opens
        h.undo(B); // consumes the no-op entry mid-stroke
        h.endStroke(); // must not wipe the redo entry just created
        expect(h.canRedo()).toBe(true);
    });

    it("trims stacks to the cap", () => {
        const h = new MapHistory(3);
        for (let i = 0; i < 5; i++) {
            h.beginStroke(snap(`t${i}`, `o${i}`));
            h.markDirty();
            h.endStroke();
        }
        // 5 pre-stroke states pushed with cap 3: stack holds [t2,t3,t4].
        expect(h.undo(snap("x", "x"))).toEqual(snap("t4", "o4"));
        expect(h.undo(snap("x", "x"))).toEqual(snap("t3", "o3"));
    });

    it("notifies when a dirty stroke ends so content views can sync", () => {
        const h = new MapHistory();
        const cb = vi.fn();
        h.onChange = cb;
        h.beginStroke(A);
        h.markDirty();
        cb.mockClear();
        h.endStroke();
        expect(cb).toHaveBeenCalledTimes(1);
    });

    it("clearRedo drops the lineage and notifies", () => {
        const h = new MapHistory();
        const cb = vi.fn();
        h.onChange = cb;
        h.beginStroke(A);
        h.markDirty();
        h.endStroke();
        h.undo(B);
        expect(h.canRedo()).toBe(true);
        h.clearRedo();
        expect(h.canRedo()).toBe(false);
        expect(cb).toHaveBeenCalled();
    });

    it("commit pushes a one-shot entry and clears the redo stack", () => {
        const h = new MapHistory();
        h.beginStroke(A);
        h.markDirty();
        h.endStroke();
        h.undo(B); // now a redo entry exists
        expect(h.canRedo()).toBe(true);
        const toggled = snap("b-tiles", "b-objects", "", false);
        h.commit(B); // e.g. toggling the lighting overlay off
        expect(h.canRedo()).toBe(false);
        expect(h.undo(toggled)).toEqual(B);
    });

    it("carries lighting and its visibility through undo/redo", () => {
        const h = new MapHistory();
        const lit = snap("t", "o", String.fromCharCode(10, 11, 13), true);
        const dark = snap("t", "o", String.fromCharCode(10, 10, 10), false);
        h.commit(lit);
        const restored = h.undo(dark);
        expect(restored).toEqual(lit);
        expect(restored!.effects.charCodeAt(2)).toBe(13);
        expect(restored!.showEffects).toBe(true);
    });

    it("carries fog through undo/redo", () => {
        const h = new MapHistory();
        const foggy = snap("t", "o", "", true, true);
        const clear = snap("t", "o", "", true, false);
        h.commit(foggy);
        const restored = h.undo(clear);
        expect(restored).toEqual(foggy);
        expect(restored!.fog).toBe(true);
        expect(h.redo(foggy)).toEqual(clear);
    });
});
