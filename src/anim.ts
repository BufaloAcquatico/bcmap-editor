// BCMap Editor - motion tokens and math.
//
// One duration family for every animation: CSS transitions read the
// variables below, canvas loops mirror the rhythm with exponential
// approach. Presentation-only: logic always reads raw state while
// rendering interpolates toward it, so reduced motion (or a paused
// loop) can never corrupt map data or selection.

/** Standard transition: picker rings, fades, slides, help, prompt. */
export const MOTION_MS = 5000;
/** Quick tier: hover chase, grow/shrink, dismissals. */
export const MOTION_QUICK_MS = 2000;

/** Nominal first-frame step when no previous timestamp exists. */
export const FRAME_MS = 1000 / 60;

/**
 * Largest timestep a single frame may advance. Bounds catch-up after
 * idle gaps and background tabs; steady 60fps rendering never notices
 * it, since real frames carry ~16ms.
 */
export const MOTION_MAX_STEP_MS = 50;

/**
 * One wall-clock step from current toward target, covering the same
 * fraction per millisecond as an exponential approach that closes 99%
 * of the gap within durationMs. Durations therefore govern real time
 * on any refresh rate — never hand-tune per-frame rates instead.
 * Degenerate inputs stay safe: non-positive durations snap, frozen
 * clocks hold still.
 */
export function advanceToward(
    current: number,
    target: number,
    durationMs: number,
    dtMs: number,
): number {
    if (!(durationMs > 0)) return target;
    if (!(dtMs > 0)) return current;
    return (
        current + (target - current) * (1 - Math.pow(0.01, dtMs / durationMs))
    );
}

/** Snap threshold in tile units (sub-pixel at any zoom). */
export const MOTION_EPSILON_TILES = 0.01;
/** Snap threshold for unitless 0..1 scales. */
export const MOTION_EPSILON_SCALE = 0.01;

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

type AnimatableElement = HTMLElement & {
    animate?: (
        keyframes: Keyframe[],
        options?: KeyframeAnimationOptions,
    ) => Animation | undefined;
    getAnimations?: () => Animation[];
};

/** Cancel in-flight WAAPI effects so a reversed gesture never queues. */
export function cancelEffects(el: HTMLElement): void {
    try {
        (el as AnimatableElement)
            .getAnimations?.()
            .forEach((effect) => effect.cancel());
    } catch {
        // Mock DOM in unit tests may throw; instant paths do not need it.
    }
}

/**
 * Fade an element in over the standard token. Fire-and-forget: the
 * element stays visible regardless. Instant under reduced motion.
 */
export function fadeIn(el: HTMLElement, durationMs = MOTION_MS): void {
    const node = el as AnimatableElement;
    if (prefersReducedMotion() || typeof node.animate !== "function") return;
    cancelEffects(node);
    node.animate([{ opacity: "0" }, { opacity: "1" }], {
        duration: durationMs,
        easing: "ease-out",
    });
}

/**
 * Fade an element out over the quick tier, then run `done` (usually
 * hiding it). Instant under reduced motion. Reversing mid-fade cancels
 * cleanly; a cancelled fade never calls `done`.
 */
export function fadeOut(
    el: HTMLElement,
    done: () => void,
    durationMs = MOTION_QUICK_MS,
): void {
    const node = el as AnimatableElement;
    if (prefersReducedMotion() || typeof node.animate !== "function") {
        done();
        return;
    }
    cancelEffects(node);
    const fade = node.animate([{ opacity: "1" }, { opacity: "0" }], {
        duration: durationMs,
        easing: "ease-out",
        fill: "forwards",
    });
    if (fade) fade.onfinish = () => done();
    else done();
}
