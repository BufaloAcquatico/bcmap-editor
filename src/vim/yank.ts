// BCMap Editor - yank buffer for copy/paste over both map layers.
//
// A yank always stores both layers of a rectangular region (D11):
// copy/y stores the visible content, paste/p restores exactly those
// layers regardless of which layer is active at paste time. In visual
// mode the yank tiles over the selected region, trimmed to fit.

import type { Region } from "./motions";

/** Captured map content of a rectangular region, both layers. */
export interface YankBuffer {
    width: number;
    height: number;
    tiles: string; // row-major, width * height chars
    objects: string; // row-major, width * height chars
}

/** Extract the region's cells from both layer strings, row-major. */
export function captureRegion(
    tiles: string,
    objects: string,
    region: Region,
    width: number,
    height: number,
): YankBuffer {
    const w = region.to.X - region.from.X + 1;
    const h = region.to.Y - region.from.Y + 1;
    let capturedTiles = "";
    let capturedObjects = "";
    for (let y = region.from.Y; y <= region.to.Y; y++) {
        for (let x = region.from.X; x <= region.to.X; x++) {
            const index = x + y * width;
            if (index >= 0 && index < tiles.length) {
                capturedTiles += tiles[index];
                capturedObjects += objects[index] ?? "";
            }
        }
    }
    void height;
    return {
        width: w,
        height: h,
        tiles: capturedTiles,
        objects: capturedObjects,
    };
}

/** "3x2" size label for the status bar, or null when the buffer is empty. */
export function normalizeYankSize(buffer: YankBuffer | null): string | null {
    if (!buffer) return null;
    return `${buffer.width}x${buffer.height}`;
}
