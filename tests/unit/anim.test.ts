import { describe, it, expect, afterEach, vi } from "vitest";
import {
    approach,
    settled,
    prefersReducedMotion,
    MOTION_MS,
    MOTION_QUICK_MS,
    CURSOR_APPROACH_RATE,
    HOVER_APPROACH_RATE,
} from "../../src/anim";

describe("motion tokens", () => {
    it("keeps one duration family with a quicker tier beneath it", () => {
        expect(MOTION_MS).toBe(140);
        expect(MOTION_QUICK_MS).toBeLessThan(MOTION_MS);
        expect(CURSOR_APPROACH_RATE).toBeGreaterThan(0);
        expect(CURSOR_APPROACH_RATE).toBeLessThan(1);
        expect(HOVER_APPROACH_RATE).toBeGreaterThan(CURSOR_APPROACH_RATE);
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

    it("settles a cursor-rate chase within about nine frames", () => {
        let value = 0;
        for (let i = 0; i < 9; i++) {
            value = approach(value, 10, CURSOR_APPROACH_RATE);
        }
        // Within a few percent after ~140ms at 60fps.
        expect(Math.abs(value - 10)).toBeLessThan(0.3);
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
