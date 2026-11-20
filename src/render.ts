// BCMap Editor - pure render-resolution helpers.
//
// BC-faithful sprite selection (wall edge effects, neighbor-aware object
// variants) with no DOM or canvas access, so every rule is unit-testable
// without mocks. The editor owns map/chart lookups and the paint loop;
// these functions resolve *which* sprite a cell needs.
//
// Rule sources: BondageClub ChatRoomMapView (FindWallEffectTile,
// FloorWallEffect, BuildImageName) and, since R134, the explicit connected
// texture groups in src/constants.ts.
//
// Extracted from BCMapEditor (src/editor.ts); behavior is unchanged for the
// legacy expandables and railroad pieces.

import type { ObjectDef } from "./catalog";
import {
    ObjectIdAt,
    RAILROAD_DIRECTIONS,
    resolveConnectedVariant,
} from "./constants";

// Neighbor-aware ("expanding") objects, mirroring BC's BuildImageName logic.
// `prefix` is the texture name stem, `single` the variant used when the
// object has no same-ID neighbors.
// NOTE: upstream spells the single-couch file "CouckPinkSmall" (typo); the
// correctly-spelled name 404s on the R134 server, so the typo is used here.
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
 * Composite a decal into an object's DecalArea: trim transparent bounds,
 * scale to fit, centre, and optionally tint (BC's MapDecals.js:60-91).
 */
export function composeDecal(
    base: CanvasImageSource,
    decal: HTMLImageElement,
    area: readonly [number, number, number, number],
    color: string | undefined,
): CanvasImageSource {
    try {
        const canvas = document.createElement("canvas") as HTMLCanvasElement;
        if (typeof canvas.getContext !== "function") return base;
        canvas.width =
            (base as HTMLCanvasElement).width ||
            (base as HTMLImageElement).naturalWidth;
        canvas.height =
            (base as HTMLCanvasElement).height ||
            (base as HTMLImageElement).naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return base;
        ctx.drawImage(base, 0, 0);

        const probe = document.createElement("canvas") as HTMLCanvasElement;
        probe.width = decal.naturalWidth;
        probe.height = decal.naturalHeight;
        const pctx = probe.getContext("2d", { willReadFrequently: true });
        if (!pctx) return base;
        pctx.drawImage(decal, 0, 0);
        const data = pctx.getImageData(0, 0, probe.width, probe.height).data;
        let left = probe.width,
            top = probe.height,
            right = -1,
            bottom = -1;
        for (let y = 0; y < probe.height; y++) {
            for (let x = 0; x < probe.width; x++) {
                if (data[(y * probe.width + x) * 4 + 3] === 0) continue;
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
            }
        }
        if (right < 0) return base;
        const cw = right - left + 1,
            ch = bottom - top + 1;
        const scale = Math.min(area[2] / cw, area[3] / ch);
        const w = cw * scale,
            h = ch * scale;
        const dx = area[0] + (area[2] - w) / 2;
        const dy = area[1] + (area[3] - h) / 2;
        let source: CanvasImageSource = decal;
        let sx = left,
            sy = top;
        if (color) {
            // Crop to the opaque bounds FIRST, then tint the cropped pixels;
            // tinting the whole image would squash it into the trimmed size.
            const crop = document.createElement("canvas") as HTMLCanvasElement;
            crop.width = cw;
            crop.height = ch;
            const cctx = crop.getContext("2d");
            if (!cctx) return base;
            cctx.drawImage(decal, left, top, cw, ch, 0, 0, cw, ch);
            source = tintImage(crop, color, cw, ch);
            sx = 0;
            sy = 0;
        }
        ctx.drawImage(source, sx, sy, cw, ch, dx, dy, w, h);
        return canvas;
    } catch {
        return base;
    }
}

export interface ColorableLayer {
    Name: string;
    IsColorable: boolean;
    DefaultColor?: string;
}

/**
 * Compose an object's layer sprites into one tinted image, matching BC's
 * ChatRoomMapViewGetColoredObjectImage: each layer is loaded from
 * `<imageName>_<layerName>.png`, colourable ones tinted with their chosen
 * colour (or the layer default), and non-colourable layers drawn as-is.
 * Returns undefined until all layer images are available.
 */
export function composeLayerImage(
    objectType: string,
    imageName: string,
    layers: readonly ColorableLayer[],
    colors: readonly string[] | undefined,
    load: (url: string) => HTMLImageElement | undefined,
): HTMLCanvasElement | undefined {
    const colorable = layers.filter((l) => l.IsColorable);
    if (colorable.length === 0) return undefined;
    let colorIndex = 0;
    const images: Array<{ img: HTMLImageElement; color: string | null }> = [];
    for (const layer of layers) {
        const url = layer.Name
            ? `assets/objects/${objectType}/${imageName}_${layer.Name}.png`
            : `assets/objects/${objectType}/${imageName}.png`;
        const img = load(url);
        if (!img || !img.complete || img.naturalWidth === 0) return undefined;
        images.push({
            img,
            color: layer.IsColorable
                ? colors?.[colorIndex] && colors[colorIndex] !== "Default"
                    ? colors[colorIndex]
                    : (layer.DefaultColor ?? null)
                : null,
        });
        if (layer.IsColorable) colorIndex++;
    }
    const canvas = document.createElement("canvas") as HTMLCanvasElement;
    if (typeof canvas.getContext !== "function") return undefined;
    canvas.width = images[0].img.naturalWidth;
    canvas.height = images[0].img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    for (const { img, color } of images) {
        if (color) {
            const tinted = tintImage(
                img,
                color,
                img.naturalWidth,
                img.naturalHeight,
            );
            ctx.drawImage(tinted, 0, 0);
        } else {
            ctx.drawImage(img, 0, 0);
        }
    }
    return canvas;
}

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
 * Tint an image's coloured pixels with a hex colour (BC's DrawImageEx
 * FullAlpha luminosity transform). Returns the original image when canvas
 * pixel access is unavailable (e.g. unit-test mocks).
 */
export function tintImage(
    img: CanvasImageSource,
    color: string,
    width: number,
    height: number,
): CanvasImageSource {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return img;
        ctx.drawImage(img, 0, 0, width, height);
        const data = ctx.getImageData(0, 0, width, height);
        const rgb = parseInt(color.replace("#", ""), 16);
        const r = (rgb >> 16) & 255;
        const g = (rgb >> 8) & 255;
        const b = rgb & 255;
        for (let i = 0; i < data.data.length; i += 4) {
            const a = data.data[i + 3];
            if (a === 0) continue;
            const lum =
                (data.data[i] + data.data[i + 1] + data.data[i + 2]) / 383;
            data.data[i] = r * lum;
            data.data[i + 1] = g * lum;
            data.data[i + 2] = b * lum;
        }
        ctx.putImageData(data, 0, 0);
        return canvas;
    } catch {
        return img;
    }
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

/**
 * Full BC-faithful sprite-name resolution for one object cell. `at` returns
 * the raw object ID at a map cell (null for empty/out-of-bounds), so the
 * editor, the preloader, and the downloader all consume the same explicit
 * ID-group rules from src/constants.ts with no duplicated lists.
 */
export function resolveVariantImageName(
    obj: ObjectDef,
    x: number,
    y: number,
    at: ObjectIdAt,
): string {
    const sameId = (dx: number, dy: number): boolean =>
        at(x + dx, y + dy) === obj.ID;
    const expandable = EXPANDABLE_LEFT_RIGHT.get(obj.ID);
    if (expandable) {
        return resolveExpandableVariant(
            expandable.prefix,
            expandable.single,
            sameId(-1, 0),
            sameId(1, 0),
        );
    }
    if (obj.ID === RAILROAD_PREVIEW_ID) {
        return railroadStyleName([
            sameId(0, -1),
            sameId(0, 1),
            sameId(1, 0),
            sameId(-1, 0),
        ]);
    }
    return resolveConnectedVariant(obj.ID, x, y, at) ?? obj.Style;
}
