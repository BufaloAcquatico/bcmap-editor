// BCMap Editor - pure vim-style grid math.
//
// No editor state, no DOM: every function maps keys to clamped grid moves
// or computes rectangle geometry. The vim controller owns counts/pending
// state and calls into this; tests exercise it directly.

export interface GridPos {
    X: number;
    Y: number;
}

export interface Region {
    from: GridPos;
    to: GridPos;
}

/** Step vectors for hjkl and arrow keys. Null for non-motion keys. */
export function motionDelta(key: string): [dx: number, dy: number] | null {
    switch (key) {
        case "h":
        case "ArrowLeft":
            return [-1, 0];
        case "j":
        case "ArrowDown":
            return [0, 1];
        case "k":
        case "ArrowUp":
            return [0, -1];
        case "l":
        case "ArrowRight":
            return [1, 0];
        default:
            return null;
    }
}

/** Count digits 1-9. A leading 0 is the row-start motion, not a count. */
export function isCountDigit(key: string): boolean {
    return key.length === 1 && key >= "1" && key <= "9";
}

/** Clamped relative move on a width x height grid. */
export function stepFrom(
    pos: GridPos,
    dx: number,
    dy: number,
    count: number,
    width: number,
    height: number,
): GridPos {
    const step = Math.max(1, Math.floor(count) || 1);
    return {
        X: Math.min(width - 1, Math.max(0, pos.X + dx * step)),
        Y: Math.min(height - 1, Math.max(0, pos.Y + dy * step)),
    };
}

/** `0`: first column of the cursor's row. */
export function lineStart(pos: GridPos): GridPos {
    return { X: 0, Y: pos.Y };
}

/** `$`: last column of the cursor's row. */
export function lineEnd(pos: GridPos, width: number): GridPos {
    return { X: width - 1, Y: pos.Y };
}

/** Sorted rectangle from a visual-mode anchor and the moving cursor. */
export function normalizeRegion(from: GridPos, to: GridPos): Region {
    return {
        from: { X: Math.min(from.X, to.X), Y: Math.min(from.Y, to.Y) },
        to: { X: Math.max(from.X, to.X), Y: Math.max(from.Y, to.Y) },
    };
}

/** Inclusive cell count per axis. */
export function regionSize(region: Region): {
    width: number;
    height: number;
} {
    return {
        width: region.to.X - region.from.X + 1,
        height: region.to.Y - region.from.Y + 1,
    };
}

/** Every cell of the region, row-major. */
export function regionCells(region: Region): GridPos[] {
    const cells: GridPos[] = [];
    for (let y = region.from.Y; y <= region.to.Y; y++) {
        for (let x = region.from.X; x <= region.to.X; x++) {
            cells.push({ X: x, Y: y });
        }
    }
    return cells;
}

/** Region clipped to the map, or null when it lies fully outside. */
export function clipRegion(
    region: Region,
    width: number,
    height: number,
): Region | null {
    const fromX = Math.max(0, region.from.X);
    const fromY = Math.max(0, region.from.Y);
    const toX = Math.min(width - 1, region.to.X);
    const toY = Math.min(height - 1, region.to.Y);
    if (fromX > toX || fromY > toY) return null;
    return { from: { X: fromX, Y: fromY }, to: { X: toX, Y: toY } };
}
