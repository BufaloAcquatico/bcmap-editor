// BCMap Editor - pure Bresenham line between two grid cells.
//
// Shared by the vim `:line` command and the F1 fill-tools line tool; the
// editor clips the returned cells to the map and paints with the current
// selection, one undo entry per stroke.

export interface LineCell {
    X: number;
    Y: number;
}

/** Every cell of a 4-connected Bresenham line, endpoints included. */
export function lineCells(from: LineCell, to: LineCell): LineCell[] {
    const cells: LineCell[] = [];
    let x0 = Math.round(from.X);
    let y0 = Math.round(from.Y);
    const x1 = Math.round(to.X);
    const y1 = Math.round(to.Y);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    // Guard against infinite loops on identical endpoints.
    if (dx === 0 && dy === 0) return [{ X: x0, Y: y0 }];
    for (;;) {
        cells.push({ X: x0, Y: y0 });
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x0 += sx;
        }
        if (e2 < dx) {
            err += dx;
            y0 += sy;
        }
    }
    return cells;
}
