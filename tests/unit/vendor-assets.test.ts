import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const ROOT = path.join(__dirname, "..", "..");
const HTML = fs.readFileSync(path.join(ROOT, "map-editor.html"), "utf8");

describe("vendored third-party assets", () => {
    it("has no remote script/stylesheet references", () => {
        const remote = [...HTML.matchAll(/(?:src|href)="https:[^"]*"/g)].map(
            (m) => m[0],
        );
        expect(remote).toEqual([]);
    });

    it("references only vendor files that exist on disk", () => {
        const refs = [...HTML.matchAll(/(?:src|href)="(assets\/[^"]*)"/g)].map(
            (m) => m[1],
        );
        const vendor = refs.filter((r) => r.startsWith("assets/vendor/"));
        expect(vendor.length).toBeGreaterThan(0);
        for (const ref of vendor) {
            expect(fs.existsSync(path.join(ROOT, ref))).toBe(true);
        }
    });

    it("carries matching SRI hashes on vendored scripts/styles", () => {
        const tagged = [
            ...HTML.matchAll(
                /<(?:script|link)[^>]*(?:src|href)="(assets\/vendor\/[^"]*)"[^>]*>/g,
            ),
        ].map((m) => m[0]);
        expect(tagged.length).toBeGreaterThan(0);
        for (const tag of tagged) {
            const file = tag.match(
                /(?:src|href)="(assets\/vendor\/[^"]*)"/,
            )![1];
            const integrity = tag.match(/integrity="sha384-([^"]*)"/);
            expect(integrity).not.toBeNull();
            const digest = crypto
                .createHash("sha384")
                .update(fs.readFileSync(path.join(ROOT, file)))
                .digest("base64");
            expect(integrity![1]).toBe(digest);
        }
    });
});
