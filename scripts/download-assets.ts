import * as fs from "fs";
import * as path from "path";
import https from "https";
import {
    FULL_OBJECT_CATALOG,
    FULL_TILE_CATALOG,
    isEmptyObject,
} from "../src/catalog";
import {
    connectedVariantAssets,
    railroadVariantStyles,
    WALL_EFFECT_INDICES,
} from "../src/constants";
import { EXPANDABLE_LEFT_RIGHT, RAILROAD_PREVIEW_ID } from "../src/render";

const BASE_URL = "https://www.bondage-europe.com/R134/BondageClub/Assets/Map";

interface Options {
    force: boolean;
    verify: boolean;
    concurrency: number;
    delayMs: number;
    retries: number;
}

function parseOptions(): Options {
    const args = process.argv.slice(2);
    const opts: Options = {
        force: false,
        verify: false,
        concurrency: 2,
        delayMs: 150,
        retries: 3,
    };
    for (const arg of args) {
        if (arg === "--force") opts.force = true;
        else if (arg === "--verify") opts.verify = true;
        else if (arg.startsWith("--concurrency="))
            opts.concurrency = Math.max(
                1,
                parseInt(arg.split("=")[1], 10) || 1,
            );
        else if (arg.startsWith("--delay="))
            opts.delayMs = Math.max(0, parseInt(arg.split("=")[1], 10) || 0);
        else if (arg.startsWith("--retries="))
            opts.retries = Math.max(0, parseInt(arg.split("=")[1], 10) || 0);
    }
    return opts;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A 429 is rate limiting, not a broken asset: retry on its own schedule. */
class RateLimitError extends Error {
    constructor(readonly retryAfterMs: number) {
        super("HTTP 429");
    }
}

function retryAfterMilliseconds(header: string | undefined): number {
    if (!header) return 5000;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
    return 5000;
}

function downloadOnce(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const file = fs.createWriteStream(dest);
        const cleanup = () => {
            file.close();
            fs.unlink(dest, () => {});
        };
        const request = https.get(url, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on("finish", () => {
                    file.close();
                    resolve();
                });
            } else {
                const retryAfter = response.headers["retry-after"];
                response.resume();
                cleanup();
                if (response.statusCode === 429) {
                    reject(
                        new RateLimitError(
                            retryAfterMilliseconds(
                                Array.isArray(retryAfter)
                                    ? retryAfter[0]
                                    : retryAfter,
                            ),
                        ),
                    );
                } else {
                    reject(new Error(`HTTP ${response.statusCode}`));
                }
            }
        });
        request.on("error", (err) => {
            cleanup();
            reject(err);
        });
        request.setTimeout(30000, () => {
            request.destroy(new Error("timeout"));
        });
    });
}

const MAX_RATE_LIMIT_RETRIES = 8;

async function downloadWithRetry(
    url: string,
    dest: string,
    retries: number,
): Promise<void> {
    let ordinaryAttempt = 0;
    let rateLimitHits = 0;
    for (;;) {
        try {
            await downloadOnce(url, dest);
            return;
        } catch (err) {
            if (err instanceof RateLimitError) {
                if (rateLimitHits >= MAX_RATE_LIMIT_RETRIES) throw err;
                rateLimitHits++;
                // Honor Retry-After when present, otherwise 5-30s backoff.
                const wait = Math.min(30000, Math.max(5000, err.retryAfterMs));
                console.error(
                    `  rate limited (429); waiting ${Math.round(wait / 1000)}s ` +
                        `(${rateLimitHits}/${MAX_RATE_LIMIT_RETRIES})`,
                );
                await sleep(wait);
                continue; // 429 never spends a 404/timeout retry.
            }
            if (ordinaryAttempt >= retries) throw err;
            await sleep(500 * Math.pow(2, ordinaryAttempt));
            ordinaryAttempt++;
        }
    }
}

interface Job {
    label: string;
    url: string;
    dest: string;
}

export function wallEffectJobs(): Job[] {
    return WALL_EFFECT_INDICES.map((i) => ({
        label: `tiles/WallEffect/${i}`,
        url: `${BASE_URL}/Tiles/WallEffect/${i}.png`,
        dest: path.join(
            __dirname,
            "..",
            "assets",
            "tiles",
            "WallEffect",
            `${i}.png`,
        ),
    }));
}

async function runPool(
    jobs: Job[],
    opts: Options,
): Promise<{ ok: number; skipped: number; failed: Job[] }> {
    let index = 0;
    let ok = 0;
    let skipped = 0;
    const failed: Job[] = [];
    const total = jobs.length;

    async function worker(): Promise<void> {
        while (index < jobs.length) {
            const job = jobs[index++];
            const exists =
                !opts.force &&
                fs.existsSync(job.dest) &&
                fs.statSync(job.dest).size > 0;
            if (exists) {
                skipped++;
                continue;
            }
            try {
                await downloadWithRetry(job.url, job.dest, opts.retries);
                ok++;
                console.log(`✓ ${job.label}`);
            } catch (err) {
                failed.push(job);
                console.error(
                    `✗ ${job.label}: ${err instanceof Error ? err.message : String(err)}`,
                );
            }
            if (index < total) await sleep(opts.delayMs);
        }
    }

    const workers = Array.from(
        { length: Math.min(opts.concurrency, jobs.length) },
        () => worker(),
    );
    await Promise.all(workers);
    return { ok, skipped, failed };
}

export function tileJobs(): Job[] {
    return FULL_TILE_CATALOG.map((tile) => ({
        label: `tiles/${tile.Type}/${tile.Style}`,
        url: `${BASE_URL}/Tiles/${tile.Type}/${tile.Style}.png`,
        dest: path.join(
            __dirname,
            "..",
            "assets",
            "tiles",
            tile.Type,
            `${tile.Style}.png`,
        ),
    }));
}

export function objectJobs(): Job[] {
    // Catalog types are the game types, which match the server folders, so
    // no remapping is needed between source URL and save path. R134
    // EmptySpace objects have no canvas texture; ID 101's picker image is
    // fetched separately by paletteImageJobs().
    return FULL_OBJECT_CATALOG.filter((obj) => !isEmptyObject(obj)).map(
        (obj) => {
            return {
                label: `objects/${obj.Type}/${obj.Style}`,
                url: `${BASE_URL}/Objects/${obj.Type}/${obj.Style}.png`,
                dest: path.join(
                    __dirname,
                    "..",
                    "assets",
                    "objects",
                    obj.Type,
                    `${obj.Style}.png`,
                ),
            };
        },
    );
}

/** Picker-only PaletteImage sprites (R134 EmptySpace/Impassable). */
export function paletteImageJobs(): Job[] {
    return FULL_OBJECT_CATALOG.filter(
        (obj) => obj.paletteImage !== undefined,
    ).map((obj) => {
        const style = obj.paletteImage!;
        return {
            label: `objects/${obj.Type}/${style}`,
            url: `${BASE_URL}/Objects/${obj.Type}/${style}.png`,
            dest: path.join(
                __dirname,
                "..",
                "assets",
                "objects",
                obj.Type,
                `${style}.png`,
            ),
        };
    });
}

export function objectVariantJobs(): Job[] {
    const jobs: Job[] = [];
    const add = (type: string, style: string): void => {
        jobs.push({
            label: `objects/${type}/${style}`,
            url: `${BASE_URL}/Objects/${type}/${style}.png`,
            dest: path.join(
                __dirname,
                "..",
                "assets",
                "objects",
                type,
                `${style}.png`,
            ),
        });
    };

    // Legacy expandables and railroad: the style list comes from render.ts,
    // the same map the editor preloads and renders from. NOTE: upstream
    // spells the single-couch file "CouckPinkSmall" (typo in BuildImageName);
    // the correctly-spelled "CouchPinkSmall.png" 404s on the R134 server.
    EXPANDABLE_LEFT_RIGHT.forEach(({ prefix, single }, id) => {
        const base = FULL_OBJECT_CATALOG.find((o) => o.ID === id);
        const type = base?.Type ?? "FloorDecorationExpanding";
        for (const style of [
            single,
            prefix + "Left",
            prefix + "Middle",
            prefix + "Right",
        ]) {
            if (style !== base?.Style) add(type, style);
        }
    });
    const railroad = FULL_OBJECT_CATALOG.find(
        (o) => o.ID === RAILROAD_PREVIEW_ID,
    );
    const railroadType = railroad?.Type ?? "FloorDecorationExpanding";
    for (const style of railroadVariantStyles()) add(railroadType, style);

    // R134 connected textures: all 63 extra files come from the same
    // explicit ID-group registry used by the renderer and preloader.
    for (const { type, style } of connectedVariantAssets()) add(type, style);
    return jobs;
}

/** 566 R134 per-layer variant sprites, listed in scripts/layer-sprites.txt. */
export function layerSpriteJobs(): Job[] {
    const manifest = path.join(__dirname, "layer-sprites.txt");
    const paths = fs
        .readFileSync(manifest, "utf8")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    return paths.map((rel) => {
        const [type, style] = rel.split("/");
        return {
            label: `objects/${rel}`,
            url: `${BASE_URL}/Objects/${type}/${style}`,
            dest: path.join(__dirname, "..", "assets", "objects", type, style),
        };
    });
}

/** 45 selectable decals from BC's Female3DCG group. */
export function decalJobs(): Job[] {
    const decals: Array<{ name: string }> = JSON.parse(
        fs.readFileSync(
            path.join(__dirname, "..", "scripts", "decals.json"),
            "utf8",
        ),
    );
    return decals.map(({ name }) => ({
        label: `decals/${name}`,
        url: `https://www.bondage-europe.com/R134/BondageClub/Assets/Female3DCG/Decals/${name}.png`,
        dest: path.join(__dirname, "..", "assets", "decals", `${name}.png`),
    }));
}

async function verifyAssets(): Promise<void> {
    const jobs = [
        ...tileJobs(),
        ...objectJobs(),
        ...paletteImageJobs(),
        ...objectVariantJobs(),
        ...layerSpriteJobs(),
        ...decalJobs(),
        ...wallEffectJobs(),
    ];
    const seen = new Set<string>();
    const unique = jobs.filter((j) => {
        if (seen.has(j.dest)) return false;
        seen.add(j.dest);
        return true;
    });
    const missing: Job[] = [];
    const empty: Job[] = [];
    for (const job of unique) {
        if (!fs.existsSync(job.dest)) missing.push(job);
        else if (fs.statSync(job.dest).size === 0) empty.push(job);
    }
    console.log(
        `Verifying ${unique.length} unique assets (${jobs.length} jobs)...`,
    );
    if (missing.length === 0 && empty.length === 0) {
        console.log("OK: all assets present and non-empty.");
        return;
    }
    if (missing.length > 0) {
        console.error(`\nMissing (${missing.length}):`);
        missing.forEach((j) => console.error(`  ${j.label}  <-  ${j.dest}`));
    }
    if (empty.length > 0) {
        console.error(`\nEmpty (${empty.length}):`);
        empty.forEach((j) => console.error(`  ${j.label}  <-  ${j.dest}`));
    }
    process.exit(1);
}

async function main(): Promise<void> {
    const opts = parseOptions();
    const tiles = tileJobs();
    const objects = objectJobs();
    const paletteImages = paletteImageJobs();
    const variants = objectVariantJobs();
    const layers = layerSpriteJobs();
    const decals = decalJobs();
    const wallEffects = wallEffectJobs();
    console.log(
        `Downloading ${tiles.length} tiles, ${objects.length} objects, ${paletteImages.length} palette icons, ${variants.length} object variants, ${wallEffects.length} wall effects ` +
            `(concurrency=${opts.concurrency}, delay=${opts.delayMs}ms, retries=${opts.retries})...`,
    );

    const tileResult = await runPool(tiles, opts);
    console.log(
        `\nTiles: ${tileResult.ok} downloaded, ${tileResult.skipped} skipped, ${tileResult.failed.length} failed`,
    );

    const objectResult = await runPool(objects, opts);
    console.log(
        `Objects: ${objectResult.ok} downloaded, ${objectResult.skipped} skipped, ${objectResult.failed.length} failed`,
    );

    const paletteResult = await runPool(paletteImages, opts);
    console.log(
        `\nPalette icons: ${paletteResult.ok} downloaded, ${paletteResult.skipped} skipped, ${paletteResult.failed.length} failed`,
    );

    const variantResult = await runPool(variants, opts);
    console.log(
        `Variants: ${variantResult.ok} downloaded, ${variantResult.skipped} skipped, ${variantResult.failed.length} failed`,
    );

    const layerResult = await runPool(layers, opts);
    console.log(
        `Layer sprites: ${layerResult.ok} downloaded, ${layerResult.skipped} skipped, ${layerResult.failed.length} failed`,
    );

    const decalResult = await runPool(decals, opts);
    console.log(
        `Decals: ${decalResult.ok} downloaded, ${decalResult.skipped} skipped, ${decalResult.failed.length} failed`,
    );

    const wallEffectResult = await runPool(wallEffects, opts);
    console.log(
        `WallEffects: ${wallEffectResult.ok} downloaded, ${wallEffectResult.skipped} skipped, ${wallEffectResult.failed.length} failed`,
    );

    const failed = [
        ...tileResult.failed,
        ...objectResult.failed,
        ...paletteResult.failed,
        ...variantResult.failed,
        ...layerResult.failed,
        ...decalResult.failed,
        ...wallEffectResult.failed,
    ];
    if (failed.length > 0) {
        console.error("\nFailed downloads:");
        failed.forEach((job) =>
            console.error(`  ${job.label}  <-  ${job.url}`),
        );
        process.exit(1);
    }
    console.log("\nDone!");
}

// Guarded so unit tests can import the pure job builders above without
// triggering downloads. Under ts-node the script is the main module;
// under vitest (ESM transform) `require` is undefined and this is skipped.
const isMainModule =
    typeof require !== "undefined" &&
    typeof module !== "undefined" &&
    require.main === module;
if (isMainModule) {
    const opts = parseOptions();
    (opts.verify ? verifyAssets() : main()).catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
