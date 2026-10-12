import { describe, it, expect, afterEach, vi } from "vitest";
import {
    approach,
    settled,
    prefersReducedMotion,
    fadeIn,
    fadeOut,
    cancelEffects,
    rateForDuration,
    MOTION_MS,
    MOTION_QUICK_MS,
    CURSOR_APPROACH_RATE,
    HOVER_APPROACH_RATE,
} from "../../src/anim";

describe("motion tokens", () => {
    it("keeps one duration family with a quicker tier beneath it", () => {
        // Absolute values are tuning choices (see src/anim.ts); tests
        // pin the relationships so retuning never goes red.
        for (const ms of [MOTION_MS, MOTION_QUICK_MS]) {
            expect(Number.isInteger(ms)).toBe(true);
            expect(ms).toBeGreaterThan(0);
        }
        expect(MOTION_QUICK_MS).toBeLessThan(MOTION_MS);
        expect(CURSOR_APPROACH_RATE).toBeGreaterThan(0);
        expect(CURSOR_APPROACH_RATE).toBeLessThan(1);
        expect(HOVER_APPROACH_RATE).toBeGreaterThan(CURSOR_APPROACH_RATE);
    });
});

describe("rateForDuration", () => {
    it("snaps on non-positive durations", () => {
        expect(rateForDuration(0)).toBe(1);
        expect(rateForDuration(-50)).toBe(1);
    });

    it("stays inside (0, 1) so the lerp converges instead of diverging", () => {
        for (const ms of [10, 50, 100, 140, 200, 250, 1000]) {
            const rate = rateForDuration(ms);
            expect(rate).toBeGreaterThan(0);
            expect(rate).toBeLessThan(1);
        }
    });

    it("runs hotter for shorter durations", () => {
        expect(rateForDuration(100)).toBeGreaterThan(rateForDuration(140));
        expect(rateForDuration(140)).toBeGreaterThan(rateForDuration(250));
    });

    it("covers ~99% of any gap within its duration", () => {
        for (const ms of [100, 250]) {
            let value = 0;
            const frames = Math.ceil(ms / (1000 / 60)) + 2;
            for (let i = 0; i < frames; i++) {
                value = approach(value, 40, rateForDuration(ms));
            }
            expect(Math.abs(40 - value) / 40).toBeLessThan(0.01);
        }
    });
});

describe("approach", () => {
    it("moves toward the target without overshooting", () => {
        expect(approach(0, 10, 0.5)).toBe(5);
        expect(approach(10, 0, 0.5)).toBe(5);
        expect(approach(5, 5, 0.5)).toBe(5);
    });

    it("converges monotonically and settles", () => {
        let value = 0;
        let steps = 0;
        // Strictly increasing while unsettled; float resolution would
        // plateau an unbounded strict loop, so stop at the snap point.
        while (!settled(value, 10, 0.01)) {
            const next = approach(value, 10, CURSOR_APPROACH_RATE);
            expect(next).toBeGreaterThan(value);
            value = next;
            steps++;
            expect(steps).toBeLessThan(200);
        }
        expect(value).toBeLessThanOrEqual(10);
    });

    it("settles a cursor-rate chase in a bounded number of frames", () => {
        let value = 0;
        let steps = 0;
        while (!settled(value, 10, 0.01) && steps < 10_000) {
            value = approach(value, 10, CURSOR_APPROACH_RATE);
            steps++;
        }
        expect(settled(value, 10, 0.01)).toBe(true);
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
