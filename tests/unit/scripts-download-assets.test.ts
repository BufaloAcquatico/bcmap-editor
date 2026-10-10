import { describe, it, expect } from "vitest";
import {
    objectVariantJobs,
    wallEffectJobs,
} from "../../scripts/download-assets";
import {
    railroadVariantStyles,
    WALL_EFFECT_INDICES,
} from "../../src/constants";

describe("download-assets job builders", () => {
    it("covers exactly the shared WallEffect indices", () => {
        const jobs = wallEffectJobs();
        expect(jobs.map((j) => j.label)).toEqual(
            WALL_EFFECT_INDICES.map((i) => `tiles/WallEffect/${i}`),
        );
        expect(jobs.length).toBe(26);
        for (const job of jobs) {
            expect(job.url).toContain("/MapTile/WallEffect/");
            expect(job.dest).toContain("WallEffect");
            expect(job.dest.endsWith(".png")).toBe(true);
        }
    });

    it("downloads every railroad connectivity variant exactly once", () => {
        const labels = objectVariantJobs().map((j) => j.label);
        const railroad = labels.filter((l) => l.includes("Railroad"));
        expect(new Set(railroad).size).toBe(railroad.length);
        expect(railroad.length).toBe(16);
        for (const style of railroadVariantStyles()) {
            expect(labels).toContain(
                `objects/FloorDecorationExpanding/${style}`,
            );
        }
    });

    it("downloads the velour rope barrier variants", () => {
        const labels = objectVariantJobs().map((j) => j.label);
        for (const style of [
            "VelourRopeBarrierLeft",
            "VelourRopeBarrierMiddle",
            "VelourRopeBarrierRight",
        ]) {
            expect(labels).toContain(`objects/FloorObstacle/${style}`);
        }
    });

    it("produces unique labels with usable urls and png dests", () => {
        const jobs = [...wallEffectJobs(), ...objectVariantJobs()];
        const labels = jobs.map((j) => j.label);
        expect(new Set(labels).size).toBe(labels.length);
        for (const job of jobs) {
            expect(job.url.startsWith("https://")).toBe(true);
            expect(job.dest.endsWith(".png")).toBe(true);
        }
    });
});
