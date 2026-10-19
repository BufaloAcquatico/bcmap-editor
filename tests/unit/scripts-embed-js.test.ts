import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { transformBundle, files } from "../../scripts/embed-js.js";

// Mimics tsc CommonJS output for editor.ts imports/exports.
const SAMPLE = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const catalog_1 = require("./catalog");
const constants_1 = require("./constants");
const history_1 = require("./history");
const lz_string_1 = require("lz-string");
exports.MAP_WIDTH = 40;
console.log(exports.MAP_WIDTH, catalog_1.FULL_TILE_CATALOG, constants_1.WALL_EFFECT_INDICES, history_1.MapHistory, lz_string_1.compressToBase64("x"));
`;

describe("embed-js transformBundle", () => {
    it("points catalog/constants requires at window and strips the rest", () => {
        const out = transformBundle(SAMPLE);
        expect(out).toContain("const catalog_1 = window;");
        expect(out).toContain("const constants_1 = window;");
        expect(out).toContain("const history_1 = window;");
        expect(out).not.toContain('require("./catalog")');
        expect(out).not.toContain('require("./constants")');
        expect(out).not.toContain('require("./history")');
        expect(out).not.toContain("require(");
        // Member accesses keep working through the window alias.
        expect(out).toContain("catalog_1.FULL_TILE_CATALOG");
        expect(out).toContain("constants_1.WALL_EFFECT_INDICES");
        expect(out).toContain("history_1.MapHistory");
    });

    it("maps the lz-string require to the CDN global", () => {
        const out = transformBundle(SAMPLE);
        expect(out).toContain("const lz_string_1 = LZString;");
    });

    it("rewrites exports assignments and usages to window", () => {
        const out = transformBundle(SAMPLE);
        expect(out).not.toContain("exports.");
        expect(out).toContain("window.MAP_WIDTH = 40;");
        expect(out).toContain("window.MAP_WIDTH,");
    });

    it("removes the esModule marker", () => {
        const out = transformBundle(SAMPLE);
        expect(out).not.toContain("__esModule");
    });

    it("keeps only the first alias when modules share a require", () => {
        const twoModules =
            'const catalog_1 = require("./catalog");\n' +
            'const catalog_2 = require("./catalog");\n' +
            "console.log(catalog_1.A, catalog_2.B);\n";
        const out = transformBundle(twoModules);
        expect(out).toContain("const catalog_1 = window;");
        expect(out).toContain("const catalog_2 = window;");
        const dupes =
            'const catalog_1 = require("./catalog");\n' +
            'const catalog_1 = require("./catalog");\n';
        const deduped = transformBundle(dupes);
        const declarations =
            deduped.match(/^const catalog_1 = window;$/gm) || [];
        expect(declarations.length).toBe(1);
    });
});

/** Every .ts under src except ambient declarations, as bundle .js paths. */
function srcBundleModules(): string[] {
    const root = path.join(__dirname, "..", "..", "src");
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (
                entry.name.endsWith(".ts") &&
                !entry.name.endsWith(".d.ts")
            ) {
                out.push(
                    path
                        .relative(root, full)
                        .replace(/\\/g, "/")
                        .replace(/\.ts$/, ".js"),
                );
            }
        }
    };
    walk(root);
    return out.sort();
}

describe("embed-js bundle manifest", () => {
    it("bundles every src module (a missing entry ships a broken bundle)", () => {
        expect([...files].sort()).toEqual(srcBundleModules());
    });

    it("loads each module after the ones it depends on at load time", () => {
        const at = (f: string) => files.indexOf(f);
        // effects.js computes its RLE constants once at load via bitstring.js.
        expect(at("bitstring.js")).toBeLessThan(at("effects.js"));
        expect(at("effects.js")).toBeLessThan(at("mapdata.js"));
        expect(at("effects.js")).toBeLessThan(at("picker.js"));
        expect(at("effects.js")).toBeLessThan(at("editor.js"));
    });
});
