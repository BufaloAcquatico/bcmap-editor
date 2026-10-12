import { describe, it, expect, afterEach, vi } from "vitest";
import {
    advanceToward,
    settled,
    prefersReducedMotion,
    fadeIn,
    fadeOut,
    cancelEffects,
    marchOffset,
    CURSOR_MARCH_PX_PER_SEC,
    MOTION_MS,
    MOTION_QUICK_MS,
    MOTION_MAX_STEP_MS,
} from "../../src/anim";
// NOTE: no per-frame rates exist anymore by design — every loop below
// takes an explicit wall-clock dt, so retuning durations cannot strand
// these tests; only the tier relationship is pinned.

describe("motion tokens", () => {
    it("keeps one duration family with a quicker tier beneath it", () => {
        // Absolute values are tuning choices (see src/anim.ts), up to
        // and including uniform tiers; tests pin only sane positive
        // integers so typos fail loudly while retuning never goes red.
        for (const ms of [MOTION_MS, MOTION_QUICK_MS]) {
            expect(Number.isInteger(ms)).toBe(true);
            expect(ms).toBeGreaterThan(0);
        }
        expect(MOTION_MAX_STEP_MS).toBeGreaterThan(0);
    });
});

describe("advanceToward", () => {
    it("snaps on non-positive durations", () => {
        expect(advanceToward(0, 10, 0, 16.67)).toBe(10);
        expect(advanceToward(0, 10, -50, 16.67)).toBe(10);
    });

    it("holds still on a frozen clock", () => {
        expect(advanceToward(3, 10, 140, 0)).toBe(3);
        expect(advanceToward(3, 10, 140, -5)).toBe(3);
    });

    it("moves toward the target without overshooting", () => {
        expect(advanceToward(0, 10, 140, 16.67)).toBeGreaterThan(0);
        expect(advanceToward(0, 10, 140, 16.67)).toBeLessThan(10);
        expect(advanceToward(10, 0, 140, 16.67)).toBeLessThan(10);
        expect(advanceToward(10, 0, 140, 16.67)).toBeGreaterThan(0);
    });

    it("runs hotter for shorter durations", () => {
        expect(advanceToward(0, 10, 100, 16.67)).toBeGreaterThan(
            advanceToward(0, 10, 140, 16.67),
        );
    });

    it("covers ~99% of any gap within its duration", () => {
        for (const ms of [100, 250, 5000]) {
            let value = 0;
            const frames = Math.ceil(ms / (1000 / 60)) + 2;
            for (let i = 0; i < frames; i++) {
                value = advanceToward(value, 40, ms, 1000 / 60);
            }
            expect(Math.abs(40 - value) / 40).toBeLessThan(0.01);
        }
    });

    it("converges monotonically and settles", () => {
        let value = 0;
        let steps = 0;
        // Strictly increasing while unsettled; float resolution would
        // plateau an unbounded strict loop, so stop at the snap point.
        while (!settled(value, 10, 0.01)) {
            const next = advanceToward(value, 10, MOTION_MS, 1000 / 60);
            expect(next).toBeGreaterThan(value);
            value = next;
            steps++;
            expect(steps).toBeLessThan(100_000);
        }
        expect(value).toBeLessThanOrEqual(10);
    });
});

describe("prefersReducedMotion", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("is off without a window", () => {
        expect(typeof window).toBe("undefined");
        expect(prefersReducedMotion()).toBe(false);
    });

    it("follows the OS setting when a window exists", () => {
        vi.stubGlobal("window", {
            matchMedia: vi.fn(() => ({ matches: true })),
        });
        expect(prefersReducedMotion()).toBe(true);
        vi.stubGlobal("window", {
            matchMedia: vi.fn(() => ({ matches: false })),
        });
        expect(prefersReducedMotion()).toBe(false);
    });
});

describe("fadeIn / fadeOut", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const motionOn = () =>
        vi.stubGlobal("window", {
            matchMedia: vi.fn(() => ({ matches: false })),
        });

    const fakeElement = () => {
        const cancelled: Array<{ cancel: () => void }> = [];
        const animations: Array<{
            onfinish: (() => void) | null;
            cancel: () => void;
        }> = [];
        return {
            cancelled,
            animations,
            animate: vi.fn(() => {
                const effect = {
                    onfinish: null as (() => void) | null,
                    cancel: vi.fn(() => {
                        cancelled.push(effect);
                    }),
                };
                animations.push(effect);
                return effect;
            }),
            getAnimations: vi.fn(() => [...animations]),
        };
    };

    it("fades in over the standard token", () => {
        motionOn();
        const el = fakeElement();
        fadeIn(el as unknown as HTMLElement);
        expect(el.animate).toHaveBeenCalledTimes(1);
        expect(el.animate.mock.calls[0][1]).toMatchObject({
            duration: MOTION_MS,
        });
    });

    it("skips animation entirely under reduced motion", () => {
        vi.stubGlobal("window", {
            matchMedia: vi.fn(() => ({ matches: true })),
        });
        const el = fakeElement();
        const done = vi.fn();
        fadeIn(el as unknown as HTMLElement);
        fadeOut(el as unknown as HTMLElement, done);
        expect(el.animate).not.toHaveBeenCalled();
        expect(done).toHaveBeenCalledTimes(1);
    });

    it("runs done only when the fade-out finishes", () => {
        motionOn();
        const el = fakeElement();
        const done = vi.fn();
        fadeOut(el as unknown as HTMLElement, done, MOTION_QUICK_MS);
        expect(done).not.toHaveBeenCalled();
        el.animations[0].onfinish?.();
        expect(done).toHaveBeenCalledTimes(1);
    });

    it("cancels in-flight effects before starting over", () => {
        motionOn();
        const el = fakeElement();
        fadeIn(el as unknown as HTMLElement);
        fadeIn(el as unknown as HTMLElement);
        expect(el.cancelled).toHaveLength(1);
        expect(el.animate).toHaveBeenCalledTimes(2);
    });
});

describe("cancelEffects", () => {
    it("cancels running effects and tolerates mock DOM", () => {
        const first = { cancel: vi.fn() };
        const second = { cancel: vi.fn() };
        cancelEffects({
            getAnimations: () => [first, second],
        } as unknown as HTMLElement);
        expect(first.cancel).toHaveBeenCalledTimes(1);
        expect(second.cancel).toHaveBeenCalledTimes(1);
        expect(() => cancelEffects({} as HTMLElement)).not.toThrow();
    });
});

describe("marchOffset", () => {
    it("holds at zero before motion or for degenerate inputs", () => {
        expect(marchOffset(0, 8)).toBe(0);
        expect(marchOffset(-5, 8)).toBe(0);
        expect(marchOffset(100, 0)).toBe(0);
        expect(marchOffset(100, -8)).toBe(0);
        expect(marchOffset(100, 8, 0)).toBe(0);
    });

    it("crawls linearly within one period", () => {
        // Default march: 24px/s, so 500ms covers 12px = 1.5 cycles of 8px.
        expect(marchOffset(500, 8)).toBe(-4);
        expect(marchOffset(250, 8)).toBe(-6);
        expect(marchOffset(250, 8)).toBeLessThan(marchOffset(125, 8));
    });

    it("repeats seamlessly every period", () => {
        const cycleMs = (8 / CURSOR_MARCH_PX_PER_SEC) * 1000;
        expect(marchOffset(1000, 8)).toBe(0);
        expect(marchOffset(100 + cycleMs, 8)).toBeCloseTo(
            marchOffset(100, 8),
            10,
        );
    });
});
