// BCMap Editor - shared edit-session coalescing for mouse and keyboard.
//
// One "session" is one undo entry: the first edit opens it (history
// begin), repeated edits inside the quiet window extend it (markDirty),
// and it closes when the window elapses, on demand (verb/mode change,
// Esc, undo) or when a held mouse gesture releases. A session whose
// edits never changed a cell still closes — MapHistory rolls empty
// strokes back, so an idle press costs no undo step.

export interface EditSessionHooks {
    begin: () => void;
    markDirty: () => void;
    end: () => void;
}

export class EditSession {
    private open = false;
    private held = false;
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private hooks: EditSessionHooks,
        private quietMs = 400,
    ) {}

    isOpen(): boolean {
        return this.open;
    }

    /**
     * Apply one edit inside the burst. The session opens BEFORE the mutator
     * runs (so the history snapshot is the pre-edit state) and marks dirty
     * only when the mutator reports a real change; unchanged bursts roll
     * back on close.
     */
    runEdit(mutate: () => boolean): void {
        if (!this.open) {
            this.hooks.begin();
            this.open = true;
        }
        if (mutate()) this.hooks.markDirty();
        if (!this.held) this.reschedule();
    }

    /** Hold the session open regardless of the quiet window (mouse drag). */
    hold(): void {
        this.held = true;
        this.clearTimer();
    }

    /** Resume quiet-timeout behavior after a hold. */
    release(): void {
        this.held = false;
    }

    /** Close the open session immediately. */
    flush(): void {
        this.clearTimer();
        this.held = false;
        if (this.open) {
            this.open = false;
            this.hooks.end();
        }
    }

    private reschedule(): void {
        this.clearTimer();
        this.timer = setTimeout(() => this.flush(), this.quietMs);
    }

    private clearTimer(): void {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
