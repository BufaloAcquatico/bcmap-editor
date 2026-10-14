// BCMap Editor - stroke-coalesced undo/redo over whole-map snapshots.
//
// A snapshot is the [Tiles, Objects] pair. A whole press/drag stroke shares
// one undo entry: beginStroke() pushes the pre-stroke state once, paint
// calls markDirty(), and endStroke() rolls the entry back when the stroke
// changed nothing, so empty presses never cost an undo step.
//
// Extracted from BCMapEditor (src/editor.ts); behavior is unchanged. The
// editor owns the MapData and applies snapshots; this class only manages
// the stacks. onChange fires whenever stack state changes so the UI can
// sync undo/redo button states.

/** A whole-map snapshot: [Tiles, Objects] layer strings. */
export type MapSnapshot = [tiles: string, objects: string];

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

    beginStroke(tiles: string, objects: string): void {
        this.strokeOpen = true;
        this.strokeDirty = false;
        this.strokeSavedRedo = this.redoStack;
        const entry: MapSnapshot = [tiles, objects];
        this.strokeEntry = entry;
        this.undoStack.push(entry);
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
