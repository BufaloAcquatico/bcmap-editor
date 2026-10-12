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
    normalizeRegion,
    stepFrom,
    type GridPos,
    type Region,
} from "./motions";

export type VimMode = "normal" | "visual";

export interface VimIntents {
    /** Apply a new cursor position (editor clamps, auto-pans, re-renders). */
    setCursor: (pos: GridPos) => void;
    /** Where the cursor starts on the first vim key (last hover or center). */
    bootCursor: () => GridPos;
    /** Paint the current selection at the given cell. */
    paintAt: (at: GridPos) => void;
    /** Paint the current selection over every cell of the region. */
    paintRegion: (region: Region) => void;
    /** Capture the region into the yank buffer (both layers). */
    yankRegion: (region: Region) => void;
    /** Paste the yank buffer at the given anchor cell (clipped by editor). */
    pasteYank: (at: GridPos) => void;
    /** Tile the yank buffer over the region from its top-left, trimmed. */
    pasteYankTiled: (region: Region) => void;
    /** Close the open edit burst before an undo/mode change. */
    flushEdits: () => void;
    undo: () => void;
}

export class VimController {
    private mode: VimMode = "normal";
    private cursor: GridPos | null = null;
    private anchor: GridPos | null = null;
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
        if (this.mode === "visual") {
            const region = this.getRegion();
            const size = region
                ? ` ${region.to.X - region.from.X + 1}x${region.to.Y - region.from.Y + 1}`
                : "";
            return `-- VISUAL --${size}`;
        }
        return "-- NORMAL --";
    }

    getMode(): VimMode {
        return this.mode;
    }

    /** The visual selection, normalized, or null outside visual mode. */
    getRegion(): Region | null {
        if (this.mode !== "visual" || !this.cursor || !this.anchor) return null;
        return normalizeRegion(this.anchor, this.cursor);
    }

    private exitVisual(): void {
        this.mode = "normal";
        this.anchor = null;
    }

    private enterVisual(): void {
        const at = this.cursor ?? this.intents.bootCursor();
        if (!this.cursor) this.moveTo(at);
        this.mode = "visual";
        this.anchor = { ...at };
    }

    getCursor(): GridPos | null {
        return this.cursor;
    }

    clearCursor(): void {
        this.cursor = null;
        this.anchor = null;
        this.mode = "normal";
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

        if (key === "v") {
            if (this.mode === "visual") {
                this.exitVisual();
            } else {
                this.ensureCursorForVerb();
                this.enterVisual();
            }
            this.resetPending();
            this.notify();
            return true;
        }

        if (key === "y" || key === "Y") {
            const region = this.getRegion();
            if (region) {
                this.intents.flushEdits();
                this.intents.yankRegion(region);
                this.exitVisual();
            }
            this.resetPending();
            this.notify();
            return true;
        }

        if (key === "p") {
            const region = this.getRegion();
            if (region) {
                // Region gesture: close any open burst so the tiled paste
                // is exactly one undo entry, then paste and leave visual.
                this.intents.flushEdits();
                this.intents.pasteYankTiled(region);
                this.exitVisual();
            } else {
                const at = this.ensureCursorForVerb();
                this.intents.pasteYank(at);
            }
            this.resetPending();
            this.notify();
            return true;
        }

        if (key === "Escape") {
            // Esc cancels the innermost state: pending input first, then
            // the visual selection.
            this.resetPending();
            this.exitVisual();
            this.notify();
            return true;
        }

        if (key === " " || key === "Enter") {
            const region = this.getRegion();
            if (region) {
                // Region gesture: close any open burst so the fill is
                // exactly one undo entry, then paint and leave visual mode.
                this.intents.flushEdits();
                this.intents.paintRegion(region);
                this.exitVisual();
            } else {
                const at = this.ensureCursorForVerb();
                this.intents.paintAt(at);
            }
            this.resetPending();
            this.notify();
            return true;
        }

        if (key === "u") {
            this.intents.flushEdits();
            this.intents.undo();
            this.resetPending();
            this.notify();
            return true;
        }

        // Unrelated keys are never consumed, and never boot the cursor.
        this.resetPending();
        return false;
    }

    private ensureCursorForVerb(): GridPos {
        if (!this.cursor) {
            this.cursor = this.intents.bootCursor();
            this.intents.setCursor(this.cursor);
        }
        return this.cursor;
    }

    private resetG(): void {
        this.pendingG = false;
    }
}
