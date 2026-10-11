import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EditSession } from "../../../src/vim/editSession";

describe("EditSession", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    const makeSession = (quietMs = 400) => {
        const calls: string[] = [];
        const dirty: boolean[] = [];
        const session = new EditSession(
            {
                begin: () => calls.push("begin"),
                markDirty: () => dirty.push(true),
                end: () => calls.push("end"),
            },
            quietMs,
        );
        return { session, calls, dirty };
    };

    it("coalesces a burst of edits into one begin/end pair", () => {
        const { session, calls, dirty } = makeSession();
        for (let i = 0; i < 100; i++) session.runEdit(() => true);
        expect(calls).toEqual(["begin"]);
        expect(dirty).toHaveLength(100);
        vi.advanceTimersByTime(401);
        expect(calls).toEqual(["begin", "end"]);
    });

    it("keeps edits in the same entry while they arrive inside the window", () => {
        const { session, calls } = makeSession();
        session.runEdit(() => true);
        vi.advanceTimersByTime(300);
        session.runEdit(() => true);
        vi.advanceTimersByTime(300);
        session.runEdit(() => true);
        expect(calls).toEqual(["begin"]);
        vi.advanceTimersByTime(401);
        expect(calls).toEqual(["begin", "end"]);
    });

    it("starts a new entry once the quiet window elapsed", () => {
        const { session, calls } = makeSession();
        session.runEdit(() => true);
        vi.advanceTimersByTime(401);
        session.runEdit(() => true);
        vi.advanceTimersByTime(401);
        expect(calls).toEqual(["begin", "end", "begin", "end"]);
    });

    it("rolls back cleanly when no edit changed anything", () => {
        const { session, calls } = makeSession();
        session.runEdit(() => false);
        vi.advanceTimersByTime(401);
        expect(calls).toEqual(["begin", "end"]);
    });

    it("flushes immediately on demand (verb change, Esc, undo)", () => {
        const { session, calls } = makeSession();
        session.runEdit(() => true);
        session.flush();
        expect(calls).toEqual(["begin", "end"]);
        vi.advanceTimersByTime(1000);
        expect(calls).toEqual(["begin", "end"]);
        session.flush();
        expect(calls).toEqual(["begin", "end"]);
    });

    it("holds the entry open while a drag is held (no quiet timeout)", () => {
        const { session, calls } = makeSession();
        session.hold();
        session.runEdit(() => true);
        vi.advanceTimersByTime(5000);
        session.runEdit(() => true);
        expect(calls).toEqual(["begin"]);
        session.release();
        session.flush();
        expect(calls).toEqual(["begin", "end"]);
    });

    it("reports open state", () => {
        const { session } = makeSession();
        expect(session.isOpen()).toBe(false);
        session.runEdit(() => true);
        expect(session.isOpen()).toBe(true);
        vi.advanceTimersByTime(401);
        expect(session.isOpen()).toBe(false);
    });

    it("ignores edits after flush until the next edit call", () => {
        const { session, calls } = makeSession();
        session.runEdit(() => true);
        session.flush();
        vi.advanceTimersByTime(1000);
        expect(calls).toEqual(["begin", "end"]);
    });
});
