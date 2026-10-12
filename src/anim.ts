// BCMap Editor - motion tokens and math.
//
// One duration family for every animation: CSS transitions read the
// variables below, canvas loops mirror the rhythm with exponential
// approach. Presentation-only: logic always reads raw state while
// rendering interpolates toward it, so reduced motion (or a paused
// loop) can never corrupt map data or selection.

/** Standard transition: picker rings, fades, slides, help, prompt. */
export const MOTION_MS = 250;
/** Quick tier: hover chase, grow/shrink, dismissals. */
export const MOTION_QUICK_MS = 200;

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
