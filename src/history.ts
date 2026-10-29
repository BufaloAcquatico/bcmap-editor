// BCMap Editor - stroke-coalesced undo/redo over whole-editor snapshots.
//
// A snapshot captures every piece of map state the user can edit: the tile and
// object layer strings, the lighting grid, and whether the lighting overlay is
// visible (toggling it is undoable too). A whole press/drag stroke shares one
// undo entry: beginStroke() pushes the pre-stroke state once, paint calls
// markDirty(), and endStroke() rolls the entry back when the stroke changed
// nothing, so empty presses never cost an undo step. One-shot actions (the
// lighting toggle) use commit() instead of a stroke.
//
// Snapshots are plain immutable values (all strings/booleans), so the stacks
// never alias live editor state. The editor owns the MapData and applies
// snapshots; onChange fires whenever stack state changes so the UI can sync
// undo/redo button states.

/** A whole-editor snapshot. `effects` is a per-cell char grid ("" = none). */
export interface MapSnapshot {
    tiles: string;
    objects: string;
    effects: string;
    showEffects: boolean;
    /** Whether map-level fog is enabled (carried through undo/redo). */
    fog: boolean;
}

export class MapHistory {
    private undoStack: MapSnapshot[] = [];
    private redoStack: MapSnapshot[] = [];
    private strokeOpen = false;
    private strokeDirty = false;
    private strokeEntry: MapSnapshot | null = null;
    private strokeSavedRedo: MapSnapshot[] = [];

    onChange: (() => void) | null = null;

    constructor(private cap = 1000) {}

    private notify(): void {
        this.onChange?.();
    }

    beginStroke(snapshot: MapSnapshot): void {
        this.strokeOpen = true;
        this.strokeDirty = false;
        this.strokeSavedRedo = this.redoStack;
        this.strokeEntry = snapshot;
        this.undoStack.push(snapshot);
        this.undoStack = this.undoStack.slice(-this.cap);
        this.redoStack = [];
        this.notify();
    }

    /** Record that the open stroke changed at least one cell. */
    markDirty(): void {
        this.strokeDirty = true;
    }

    endStroke(): void {
        if (!this.strokeOpen) return;
        this.strokeOpen = false;
        if (!this.strokeDirty && this.strokeEntry) {
            // Roll back the entry pushed by beginStroke (by identity, so a
            // mid-stroke undo or a cap-trim can never pop the wrong state).
            // The saved redo stack is restored only when the entry was
            // actually removed: if undo() already consumed it mid-stroke,
            // the redo entry it created must survive.
            const at = this.undoStack.lastIndexOf(this.strokeEntry);
            if (at >= 0) {
                this.undoStack.splice(at, 1);
                this.redoStack = this.strokeSavedRedo;
                this.notify();
            }
        } else if (this.strokeDirty) {
            // A kept entry changed the map content after beginStroke
            // already notified: content-synced views (dirty markers) need
            // one more signal now that the paint has landed.
            this.notify();
        }
        this.strokeEntry = null;
        this.strokeSavedRedo = [];
    }

    /**
     * Push a one-shot undo entry (pre-action state) for a discrete change such
     * as toggling the lighting overlay. Unlike a stroke this always keeps the
     * entry (there is no "changed nothing" case).
     */
    commit(snapshot: MapSnapshot): void {
        this.undoStack.push(snapshot);
        this.undoStack = this.undoStack.slice(-this.cap);
        this.redoStack = [];
        this.notify();
    }

    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    /** Pop the previous snapshot, stashing `current` on the redo stack. */
    undo(current: MapSnapshot): MapSnapshot | null {
        if (this.undoStack.length === 0) return null;
        const prev = this.undoStack.pop()!;
        this.redoStack.push(current);
        this.redoStack = this.redoStack.slice(-this.cap);
        this.notify();
        return prev;
    }

    /** Pop the next snapshot, stashing `current` on the undo stack. */
    redo(current: MapSnapshot): MapSnapshot | null {
        if (this.redoStack.length === 0) return null;
        const next = this.redoStack.pop()!;
        this.undoStack.push(current);
        this.undoStack = this.undoStack.slice(-this.cap);
        this.notify();
        return next;
    }

    /** Drop the redo lineage (import/new map start a new lineage). */
    clearRedo(): void {
        this.redoStack = [];
        this.notify();
    }
}
