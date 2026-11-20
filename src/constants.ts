// BCMap Editor - shared game-data constants (Bondage Club R134).
//
// Used by the editor runtime (src/editor.ts, bundled into
// map-editor.html by scripts/embed-js.js), the render resolvers, and
// scripts/download-assets.ts. Kept here rather than in catalog.ts because
// catalog.ts is generated verbatim game data ("do not edit by hand") while
// these are hand-written derivations of BC's BuildImageName / WallEffect
// rules. A single source keeps the runtime preloader, resolver, and asset
// downloader from drifting apart.

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

// ---------------------------------------------------------------------------
// R134 connected textures.
//
// BC R134 ships pre-rendered neighbor configurations for these objects. The
// groups below are EXPLICIT ID lists from Assets/MapData.js: do not derive
// them from a catalog `JoinsNeighbors` flag. That flag is absent on 335,
// 2034 and 2036, and is present via a type default on the legacy 710-740
// expandables (handled separately in render.ts), so a generated list would
// both miss pieces and change existing behavior.
// ---------------------------------------------------------------------------

/** Raw object ID at a map cell, or null for empty / out-of-bounds cells. */
export type ObjectIdAt = (x: number, y: number) => number | null;

export type ConnectedRule = "row" | "kitchen-counter" | "fence";

export interface ConnectedTextureGroup {
    /** Explicit base object IDs handled by this rule. */
    ids: readonly number[];
    /** Catalog Type; also the server folder for the variant PNGs. */
    type: string;
    /** Base ID -> image-name prefix (the base style is prefix + "Single"). */
    prefixes: Readonly<Record<number, string>>;
    /** Suffixes that produce an extra PNG beyond the catalog's base sprite. */
    suffixes: readonly string[];
    rule: ConnectedRule;
}

const ROW_SUFFIXES = ["Left", "Middle", "Right"] as const;
const KITCHEN_COUNTER_SUFFIXES = [
    "Left",
    "Right",
    "Middle",
    "VerticalTop",
    "VerticalMiddle",
    "VerticalBottom",
    "CornerNorthEast",
    "CornerNorthWest",
    "CornerSouthEast",
    "CornerSouthWest",
] as const;
const FENCE_SUFFIXES = ["Left", "Middle", "MiddlePost", "Right"] as const;

/**
 * The complete R134 connected-texture registry. Row joins use
 * ChatRoomMapViewCreateRowImage (MapData.js:60-74); kitchen counters use
 * ChatRoomMapViewCreateKitchenCounterImage (MapData.js:34-53, cross-ID set
 * {330,331,332,333}); fences use the BuildImageName implementations at
 * MapData.js:1688-1697 and :1710-1719.
 */
export const CONNECTED_TEXTURE_GROUPS: readonly ConnectedTextureGroup[] = [
    {
        ids: [185, 186, 187, 188],
        type: "LivingRoom",
        prefixes: {
            185: "ModernLowboard",
            186: "ModernHighboard",
            187: "ModernBookshelf",
            188: "NordicSideboard",
        },
        suffixes: ROW_SUFFIXES,
        rule: "row",
    },
    {
        ids: [335],
        type: "Kitchen",
        prefixes: { 335: "KitchenWallCabinet" },
        suffixes: ROW_SUFFIXES,
        rule: "row",
    },
    {
        ids: [330, 331, 332, 333],
        type: "Kitchen",
        prefixes: {
            330: "KitchenCounter",
            331: "KitchenCounterSink",
            332: "KitchenCounterStoveElectric",
            333: "KitchenCounterStoveGas",
        },
        suffixes: KITCHEN_COUNTER_SUFFIXES,
        rule: "kitchen-counter",
    },
    {
        ids: [2034, 2036],
        type: "FloorObstacle",
        prefixes: { 2034: "FarmFence", 2036: "HomeFence" },
        suffixes: FENCE_SUFFIXES,
        rule: "fence",
    },
];

/** IDs of any kitchen counter piece; derived from the single registry below. */
export const KITCHEN_COUNTER_IDS: readonly number[] =
    CONNECTED_TEXTURE_GROUPS.find((g) => g.rule === "kitchen-counter")!.ids;

/** Same-ID row join: Left / Middle / Right / base (BC's row helper). */
function rowVariant(
    id: number,
    group: ConnectedTextureGroup,
    x: number,
    y: number,
    at: ObjectIdAt,
): string {
    const prefix = group.prefixes[id];
    const left = at(x - 1, y) === id;
    const right = at(x + 1, y) === id;
    if (left && right) return prefix + "Middle";
    if (left) return prefix + "Right";
    if (right) return prefix + "Left";
    return prefix + "Single";
}

/**
 * Cross-ID kitchen counters. The if-chain order mirrors MapData.js:41-51: a
 * cell with East+West renders Middle even when it also has a north/south
 * neighbor (there is no T-piece texture).
 */
function kitchenCounterVariant(
    id: number,
    group: ConnectedTextureGroup,
    x: number,
    y: number,
    at: ObjectIdAt,
): string {
    const prefix = group.prefixes[id];
    const joined = (cx: number, cy: number): boolean => {
        const neighbor = at(cx, cy);
        return neighbor !== null && KITCHEN_COUNTER_IDS.includes(neighbor);
    };
    const north = joined(x, y - 1);
    const south = joined(x, y + 1);
    const east = joined(x + 1, y);
    const west = joined(x - 1, y);
    if (east && west) return prefix + "Middle";
    if (north && south) return prefix + "VerticalMiddle";
    if (south && east) return prefix + "CornerSouthEast";
    if (south && west) return prefix + "CornerSouthWest";
    if (north && east) return prefix + "CornerNorthEast";
    if (north && west) return prefix + "CornerNorthWest";
    if (east) return prefix + "Left";
    if (west) return prefix + "Right";
    if (south) return prefix + "VerticalTop";
    if (north) return prefix + "VerticalBottom";
    return prefix + "Single";
}

/** Fence row join with a post every second interior cell (BC parity rule). */
function fenceVariant(
    id: number,
    group: ConnectedTextureGroup,
    x: number,
    y: number,
    at: ObjectIdAt,
): string {
    const prefix = group.prefixes[id];
    const left = at(x - 1, y) === id;
    const right = at(x + 1, y) === id;
    if (!left && !right) return prefix + "Single";
    if (!left && right) return prefix + "Left";
    if (left && !right) return prefix + "Right";
    let distance = 0;
    while (at(x - distance - 1, y) === id) distance++;
    return prefix + (distance % 2 === 0 ? "MiddlePost" : "Middle");
}

/**
 * Resolve a connected-texture variant name for one cell. Returns null when
 * the object ID is not in a registered group (legacy expandables, railroad,
 * and ordinary objects are handled by render.ts).
 */
export function resolveConnectedVariant(
    id: number,
    x: number,
    y: number,
    at: ObjectIdAt,
): string | null {
    const group = CONNECTED_TEXTURE_GROUPS.find((g) => g.ids.includes(id));
    if (!group) return null;
    switch (group.rule) {
        case "row":
            return rowVariant(id, group, x, y, at);
        case "kitchen-counter":
            return kitchenCounterVariant(id, group, x, y, at);
        case "fence":
            return fenceVariant(id, group, x, y, at);
    }
}

/** Objects that own each CellData config type in BC (Map.js:2531-2555). */
export const SIGN_OBJECT_IDS: ReadonlySet<number> = new Set([
    3520, 3521, 3522, 3523,
]);
export const TELEPORTER_OBJECT_ID = 3530;
/** 38 FloorObstacle objects (type default) + X-Cross 1020 + Pole 1090. */
export const TETHER_OBJECT_IDS: ReadonlySet<number> = new Set([
    1020, 1090, 2004, 2005, 2006, 2007, 2010, 2011, 2012, 2013, 2014, 2015,
    2016, 2017, 2018, 2020, 2025, 2030, 2031, 2032, 2033, 2034, 2035, 2036,
    2040, 2045, 2048, 2050, 2055, 2057, 2059, 2060, 2070, 2080, 2085, 2090,
    2091, 2092, 2093, 2098,
]);

/**
 * R134 objects whose `CanEnter("")` is false — cells a character cannot
 * stand on. Pinned from the game data (Assets/MapData.js); includes the two
 * effect-gated hurdles 660/670, which block a frozen/slowed character.
 * Tiles are not included: the game's obstacle mark checks objects only.
 */
export const OBSTACLE_OBJECT_IDS: ReadonlySet<number> = new Set([
    101, 612, 660, 670, 2004, 2005, 2006, 2007, 2010, 2011, 2012, 2013, 2014,
    2015, 2016, 2017, 2018, 2020, 2025, 2030, 2031, 2032, 2034, 2035, 2036,
    2040, 2045, 2048, 2050, 2055, 2057, 2059, 2060, 2070, 2080, 2085, 2090,
    2091, 2092, 2093, 2098,
]);

/** Every extra R134 variant PNG (63 files), derived from the one registry. */
export function connectedVariantAssets(): Array<{
    type: string;
    style: string;
}> {
    const assets: Array<{ type: string; style: string }> = [];
    for (const group of CONNECTED_TEXTURE_GROUPS) {
        for (const id of group.ids) {
            for (const suffix of group.suffixes) {
                assets.push({
                    type: group.type,
                    style: group.prefixes[id] + suffix,
                });
            }
        }
    }
    return assets;
}
