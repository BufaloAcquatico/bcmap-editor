// BCMap Editor - vim-style input controller (normal mode in this slice).
//
// Owns all vim state: cursor, pending count, pending g, visual anchor.
// Resolves keys through the pure motions module and emits intents to the
// editor, which applies them (clamping, auto-pan, render, history).
// No DOM access here — keep it unit-testable against a fake.

import {
    lineEnd,
    lineStart,
    motionDelta,
    stepFrom,
    type GridPos,
} from "./motions";

export type VimMode = "normal" | "visual";

export interface VimIntents {
    /** Apply a new cursor position (editor clamps, auto-pans, re-renders). */
    setCursor: (pos: GridPos) => void;
    /** Where the cursor starts on the first vim key (last hover or center). */
    bootCursor: () => GridPos;
}

export class VimController {
    private mode: VimMode = "normal";
    private cursor: GridPos | null = null;
    private count = "";
    private pendingG = false;

    onStateChange: (() => void) | null = null;

    constructor(private intents: VimIntents) {}

    private notify(): void {
        this.onStateChange?.();
    }

    private resetPending(): void {
        this.count = "";
        this.pendingG = false;
    }

    private countValue(): number {
        return this.count === "" ? 1 : parseInt(this.count, 10);
    }

    /** Ensure a cursor exists, booting at the intents' default position. */
    private ensureCursor(): GridPos {
        if (!this.cursor) {
            this.cursor = this.intents.bootCursor();
        }
        return this.cursor;
    }

    private moveTo(pos: GridPos): void {
        this.cursor = pos;
        this.intents.setCursor(pos);
    }

    /** Status-bar label, vim showcmd style (pending count / g / mode). */
    statusModeText(): string {
        if (this.pendingG) return "g";
        if (this.count !== "") return this.count;
        return this.mode === "visual" ? "-- VISUAL --" : "-- NORMAL --";
    }

    getMode(): VimMode {
        return this.mode;
    }

    getCursor(): GridPos | null {
        return this.cursor;
    }

    clearCursor(): void {
        this.cursor = null;
        this.resetPending();
        this.notify();
    }

    /** Handle one keypress. Returns true when the controller consumed it. */
    handleKey(key: string): boolean {
        // Count prefix: leading digit 1-9 (0 is the row-start motion).
        if (this.count === "" && key.length === 1 && key >= "1" && key <= "9") {
            this.count = key;
            this.resetG();
            this.notify();
            return true;
        }
        if (this.count !== "" && key.length === 1 && key >= "0" && key <= "9") {
            if (this.count.length < 3) this.count += key;
            this.notify();
            return true;
        }

        if (key === "g") {
            if (this.pendingG) {
                this.resetPending();
                this.moveTo({ X: 0, Y: 0 });
            } else {
                this.count = "";
                this.pendingG = true;
            }
            this.notify();
            return true;
        }

        const count = this.countValue();

        const delta = motionDelta(key);
        if (delta) {
            this.resetPending();
            this.moveTo(
                stepFrom(
                    this.ensureCursor(),
                    delta[0],
                    delta[1],
                    count,
                    40,
                    40,
                ),
            );
            this.notify();
            return true;
        }

        if (key === "0") {
            this.resetPending();
            this.moveTo(lineStart(this.ensureCursor()));
            this.notify();
            return true;
        }

        if (key === "$") {
            this.resetPending();
            this.moveTo(lineEnd(this.ensureCursor(), 40));
            this.notify();
            return true;
        }

        // Unrelated keys are never consumed, and never boot the cursor.
        this.resetPending();
        return false;
    }

    private resetG(): void {
        this.pendingG = false;
    }
}
