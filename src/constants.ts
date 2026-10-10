// BCMap Editor - shared game-data constants (Bondage Club R132).
//
// Used by both the editor runtime (src/editor.ts, bundled into
// map-editor.html by scripts/embed-js.js) and scripts/download-assets.ts.
// Kept here rather than in catalog.ts because catalog.ts is generated
// verbatim game data ("do not edit by hand") while these are hand-written
// derivations of BC's BuildImageName / WallEffect rules. A single source
// keeps the runtime preloader and the asset downloader from drifting apart.

/** WallEffect sprite indices served by the game server (0-21, 50-53). */
export const WALL_EFFECT_INDICES: readonly number[] = [
    ...Array.from({ length: 22 }, (_, i) => i),
    50,
    51,
    52,
    53,
];

/**
 * Compass directions used to build Railroad connectivity suffixes
 * ("Railroad", "RailroadNorth", "RailroadNorthSouth", ...).
 * Order is significant: bit position in the 4-bit neighbor mask.
 */
export const RAILROAD_DIRECTIONS = ["North", "South", "East", "West"] as const;

/** All 16 Railroad variant style names ("Railroad" + N/S/E/W suffixes). */
export function railroadVariantStyles(): string[] {
    const styles: string[] = [];
    for (let mask = 0; mask < 16; mask++) {
        let suffix = "";
        RAILROAD_DIRECTIONS.forEach((dir, b) => {
            if (mask & (1 << b)) suffix += dir;
        });
        styles.push("Railroad" + suffix);
    }
    return styles;
}
