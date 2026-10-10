// BCMap Editor - pure render-resolution helpers.
//
// BC-faithful sprite selection (wall edge effects, neighbor-aware object
// variants) with no DOM or canvas access, so every rule is unit-testable
// without mocks. The editor owns map/chart lookups and the paint loop;
// these functions resolve *which* sprite a cell needs.
//
// Rule sources: BondageClub ChatRoomMapView (FindWallEffectTile,
// FloorWallEffect, BuildImageName), mirrored from
// ropeybot/src/bcdata/ChatRoomMap.ts.
//
// Extracted from BCMapEditor (src/editor.ts); behavior is unchanged.

import { RAILROAD_DIRECTIONS } from "./constants";

// Neighbor-aware ("expanding") objects, mirroring BC's BuildImageName logic.
// `prefix` is the texture name stem, `single` the variant used when the
// object has no same-ID neighbors.
// NOTE: upstream spells the single-couch file "CouckPinkSmall" (typo); the
// correctly-spelled name 404s on the R132 server, so the typo is used here.
// Railroad (750) is connectivity-based and handled separately; Velour rope
// barrier (2033) reuses its base style name when single.
export const EXPANDABLE_LEFT_RIGHT = new Map<
    number,
    { prefix: string; single: string }
>([
    [710, { prefix: "CouchPink", single: "CouckPinkSmall" }],
    [720, { prefix: "BedBlue", single: "BedBlueSmall" }],
    [730, { prefix: "BallPit", single: "BallPitSmall" }],
    [740, { prefix: "VikingTable", single: "VikingTableSmall" }],
    [2033, { prefix: "VelourRopeBarrier", single: "VelourRopeBarrier" }],
]);

export const RAILROAD_PREVIEW_ID = 750;

/**
 * BC's FindWallEffectTile algorithm (ChatRoomMapViewFindWallEffectTile).
 * CW = left, CE = right, SW/S C/SE = bottom-left/bottom/bottom-right.
 * Returns the effect index (0-21) or -1 for no effect.
 */
export function findWallEffectTile(
    cw: boolean,
    ce: boolean,
    sw: boolean,
    sc: boolean,
    se: boolean,
): number {
    if (cw && ce && sw && sc && se) return 0;
    if (!cw && !ce && !sc) return 1;
    if (!cw && ce && !sc) return 2;
    if (cw && !ce && !sc) return 3;
    if (cw && ce && !sc) return 4;

    if (!cw && !ce && sw && sc && se) return 5;
    if (!cw && !ce && sw && sc && !se) return 6;
    if (!cw && !ce && !sw && sc && se) return 7;

    if (cw && ce && !sw && sc && !se) return 8;
    if (!cw && ce && !sw && sc && !se) return 9;
    if (cw && !ce && !sw && sc && !se) return 10;

    if (!cw && !ce && !se && sc && !sw) return 11;
    if (cw && !ce && !se && sc && !sw) return 12;
    if (!cw && ce && !se && sc && !sw) return 13;

    if (!cw && ce && se && sc && sw) return 14;
    if (cw && !ce && se && sc && sw) return 15;

    if (cw && !ce && sw && sc) return 16;
    if (!cw && ce && sc && se) return 17;

    if (cw && ce && sw && sc && !se) return 18;
    if (cw && ce && !sw && sc && se) return 19;

    if (!cw && ce && sw && sc && !se) return 20;
    if (cw && !ce && !sw && sc && se) return 21;

    return -1;
}

/**
 * Bottom-edge effect for non-wall tiles above walls. HalfWall tiles use
 * the 0/11-13 set; everything else uses the 50-53 set (no match: -1).
 * A HalfWall with no half-wall match falls through to the floor set,
 * exactly like the game.
 */
export function findFloorWallEffect(
    sw: boolean,
    sc: boolean,
    se: boolean,
    isHalfWall: boolean,
): number {
    if (isHalfWall) {
        if (!sw && sc && !se) return 11;
        if (!sw && sc && se) return 12;
        if (sw && sc && !se) return 13;
        if (sw && sc && se) return 0;
    }
    if (!sw && sc && !se) return 50;
    if (!sw && sc && se) return 51;
    if (sw && sc && !se) return 52;
    if (sw && sc && se) return 53;
    return -1;
}

/**
 * Left/Middle/Right/Single selection for expanding objects. Each cell
 * resolves independently, so runs of 3+ identical objects naturally become
 * Left/Middle.../Middle/Right with no group pre-pass.
 */
export function resolveExpandableVariant(
    prefix: string,
    single: string,
    hasLeft: boolean,
    hasRight: boolean,
): string {
    if (hasLeft && hasRight) return prefix + "Middle";
    if (hasLeft) return prefix + "Right";
    if (hasRight) return prefix + "Left";
    return single;
}

/**
 * Railroad connectivity style name. `neighbors` is [north, south, east,
 * west]; the suffix keeps BC's strict N/S/E/W order ("Railroad",
 * "RailroadNorth", "RailroadNorthSouth", ...).
 */
export function railroadStyleName(
    neighbors: [north: boolean, south: boolean, east: boolean, west: boolean],
): string {
    let suffix = "";
    neighbors.forEach((has, b) => {
        if (has) suffix += RAILROAD_DIRECTIONS[b];
    });
    return "Railroad" + suffix;
}
