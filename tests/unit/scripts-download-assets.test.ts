import { describe, it, expect } from "vitest";
import {
    tileJobs,
    objectJobs,
    objectVariantJobs,
    wallEffectJobs,
} from "../../scripts/download-assets";
import {
    railroadVariantStyles,
    WALL_EFFECT_INDICES,
} from "../../src/constants";
import { FULL_TILE_CATALOG, FULL_OBJECT_CATALOG } from "../../src/catalog";
import path from "node:path";

describe("download-assets job builders", () => {
    it("covers exactly the shared WallEffect indices", () => {
        const jobs = wallEffectJobs();
        expect(jobs.map((j) => j.label)).toEqual(
            WALL_EFFECT_INDICES.map((i) => `tiles/WallEffect/${i}`),
        );
        expect(jobs.length).toBe(26);
        for (const job of jobs) {
            expect(job.url).toContain("/Tiles/WallEffect/");
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

    it("covers every tile catalog entry (picker linkage)", () => {
        const dests = new Set(tileJobs().map((j) => j.dest));
        for (const tile of FULL_TILE_CATALOG) {
            // dests are absolute; compare the relative tail under assets/.
            const tail = path.join("tiles", tile.Type, `${tile.Style}.png`);
            const found = [...dests].some((d) => d.endsWith(tail));
            expect(
                found,
                `no download job for tile ${tile.Type}/${tile.Style}`,
            ).toBe(true);
        }
    });

    it("covers every non-Blank object catalog entry (picker linkage)", () => {
        const dests = new Set(objectJobs().map((j) => j.dest));
        for (const obj of FULL_OBJECT_CATALOG) {
            if (obj.Style === "Blank") continue;
            const tail = path.join("objects", obj.Type, `${obj.Style}.png`);
            const found = [...dests].some((d) => d.endsWith(tail));
            expect(
                found,
                `no download job for object ${obj.Type}/${obj.Style}`,
            ).toBe(true);
        }
    });
});
