// BCMap Editor - motion tokens and math.
//
// One duration family for every animation: CSS transitions read the
// variables below, canvas loops mirror the rhythm with exponential
// approach. Presentation-only: logic always reads raw state while
// rendering interpolates toward it, so reduced motion (or a paused
// loop) can never corrupt map data or selection.

/** Standard transition: picker rings, fades, slides, help, prompt. */
export const MOTION_MS = 140;
/** Quick tier: hover chase, grow/shrink, dismissals. */
export const MOTION_QUICK_MS = 100;

/**
 * Canvas approach rates per frame at ~60fps. Cursor/region settle in
 * roughly the standard token; hover runs hotter so a flicked pointer
 * never outruns its outline into looking broken.
 */
export const CURSOR_APPROACH_RATE = 0.35;
export const HOVER_APPROACH_RATE = 0.5;

/** Snap threshold in tile units (sub-pixel at any zoom). */
export const MOTION_EPSILON_TILES = 0.01;
/** Snap threshold for unitless 0..1 scales. */
export const MOTION_EPSILON_SCALE = 0.01;

/** One exponential-approach step from current toward target. */
export function approach(
    current: number,
    target: number,
    rate: number,
): number {
    return current + (target - current) * rate;
}

/** True when a value has settled close enough to snap to target. */
export function settled(
    current: number,
    target: number,
    epsilon: number,
): boolean {
    return Math.abs(current - target) <= epsilon;
}

/**
 * Honors the OS reduced-motion setting. False without a window
 * (unit tests, SSR), so motion stays on unless opted out.
 */
export function prefersReducedMotion(): boolean {
    return (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
}
