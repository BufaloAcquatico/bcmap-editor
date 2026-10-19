// BCMap Editor - yank buffer for copy/paste over the map layers.
//
// A yank always stores all three layers of a rectangular region (tiles,
// objects and lighting): copy/y stores the visible content, paste/p restores
// exactly those layers regardless of which layer is active at paste time. In
// visual mode the yank tiles over the selected region, trimmed to fit.

import type { Region } from "./motions";

/** Captured map content of a rectangular region, all layers. */
export interface YankBuffer {
    width: number;
    height: number;
    tiles: string; // row-major, width * height chars
    objects: string; // row-major, width * height chars
    effects: string; // row-major, width * height chars (lighting)
}

/**
 * Extract the region's cells from the layer strings, row-major. `effects`
 * must be a full per-cell grid (the editor fills blanks when a map has no
 * lighting, so a captured effect char always exists).
 */
export function captureRegion(
    tiles: string,
    objects: string,
    effects: string,
    region: Region,
    width: number,
    height: number,
): YankBuffer {
    const w = region.to.X - region.from.X + 1;
    const h = region.to.Y - region.from.Y + 1;
    let capturedTiles = "";
    let capturedObjects = "";
    let capturedEffects = "";
    for (let y = region.from.Y; y <= region.to.Y; y++) {
        for (let x = region.from.X; x <= region.to.X; x++) {
            const index = x + y * width;
            if (index >= 0 && index < tiles.length) {
                capturedTiles += tiles[index];
                capturedObjects += objects[index] ?? "";
                capturedEffects += effects[index] ?? "";
            }
        }
    }
    void height;
    return {
        width: w,
        height: h,
        tiles: capturedTiles,
        objects: capturedObjects,
        effects: capturedEffects,
    };
}

/** "3x2" size label for the status bar, or null when the buffer is empty. */
export function normalizeYankSize(buffer: YankBuffer | null): string | null {
    if (!buffer) return null;
    return `${buffer.width}x${buffer.height}`;
}
