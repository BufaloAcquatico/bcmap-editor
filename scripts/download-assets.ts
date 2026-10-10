import * as fs from "fs";
import * as path from "path";
import https from "https";
import { OBJECT_CATALOG, TILE_CATALOG } from "../src/catalog";

const BASE_URL =
    "https://www.bondage-europe.com/R132/BondageClub/Screens/Online/ChatRoom";

// Some object styles were moved to different folders in the R132 asset tree used
// by the game server. Keyed by "<CatalogType>/<Style>", the value is the source
// folder under MapObject/. Assets are always SAVED under the catalog Type/Style
// path so the editor's preloader can find them.
const MOVED_OBJECTS: Record<string, string> = {
    "FloorDecoration/EntryFlag": "Functional",
    "FloorDecoration/ExitFlag": "Functional",
    "FloorDecoration/BedTeal": "Bedroom",
    "FloorDecoration/PillowPink": "LivingRoom",
    "FloorDecoration/TableBrown": "LivingRoom",
    "FloorDecoration/ChairWood": "LivingRoom",
    "FloorDecoration/ThroneRed": "LivingRoom",
    "FloorDecoration/KeyBronze": "Functional",
    "FloorDecoration/KeySilver": "Functional",
    "FloorDecoration/KeyGold": "Functional",
    "FloorDecoration/VikingChair": "LivingRoom",
    "FloorDecoration/Bed": "Bedroom",
    "FloorDecoration/Stairs": "LivingRoom",
    "FloorDecoration/AirConditioner": "LivingRoom",
    "FloorDecorationThemed/TeacherDesk": "School",
    "FloorDecorationThemed/StudentDesk": "School",
    "FloorDecorationThemed/LaundryMachine": "Bathroom",
    "FloorDecorationThemed/IroningBoard": "Bathroom",
    "FloorDecorationThemed/JapaneseTable": "LivingRoom",
    "FloorDecorationThemed/Toilet": "Bathroom",
    "FloorDecorationThemed/Television": "LivingRoom",
    "FloorDecorationThemed/TelevisionBack": "LivingRoom",
    "FloorDecorationThemed/Wardrobe": "Bedroom",
    "FloorItem/Locker": "School",
    "WallDecoration/Mirror": "Bathroom",
    "WallDecoration/Fireplace": "LivingRoom",
    "WallDecoration/SchoolBoard": "School",
    "WallDecoration/Bookshelf": "LivingRoom",
    "WallDecoration/ShowerHead": "Bathroom",
    "WallDecoration/EnemaHead": "Bathroom",
};

interface Options {
    force: boolean;
    concurrency: number;
    delayMs: number;
    retries: number;
}

function parseOptions(): Options {
    const args = process.argv.slice(2);
    const opts: Options = {
        force: false,
        concurrency: 2,
        delayMs: 150,
        retries: 3,
    };
    for (const arg of args) {
        if (arg === "--force") opts.force = true;
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
                response.resume();
                cleanup();
                reject(new Error(`HTTP ${response.statusCode}`));
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

async function downloadWithRetry(
    url: string,
    dest: string,
    retries: number,
): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            await downloadOnce(url, dest);
            return;
        } catch (err) {
            lastError = err;
            if (attempt < retries) await sleep(500 * Math.pow(2, attempt));
        }
    }
    throw lastError;
}

interface Job {
    label: string;
    url: string;
    dest: string;
}

function wallEffectJobs(): Job[] {
    const indices = [...Array(22).keys(), 50, 51, 52, 53];
    return indices.map((i) => ({
        label: `tiles/WallEffect/${i}`,
        url: `https://www.bondage-europe.com/R132/BondageClub/Screens/Online/ChatRoom/MapTile/WallEffect/${i}.png`,
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

function tileJobs(): Job[] {
    return TILE_CATALOG.map((tile) => ({
        label: `tiles/${tile.Type}/${tile.Style}`,
        url: `${BASE_URL}/MapTile/${tile.Type}/${tile.Style}.png`,
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

function objectJobs(): Job[] {
    return OBJECT_CATALOG.filter((obj) => obj.Style !== "Blank").map((obj) => {
        const assetType = MOVED_OBJECTS[`${obj.Type}/${obj.Style}`] ?? obj.Type;
        return {
            label: `objects/${obj.Type}/${obj.Style}`,
            url: `${BASE_URL}/MapObject/${assetType}/${obj.Style}.png`,
            dest: path.join(
                __dirname,
                "..",
                "assets",
                "objects",
                obj.Type,
                `${obj.Style}.png`,
            ),
        };
    });
}

// Neighbor-variant textures for expanding objects (BC BuildImageName).
// Each entry names the catalog Type (save folder) and the variant style.
// Variants are served from the same MapObject/<assetType>/ folder as the
// base sprite.
interface VariantSpec {
    type: string;
    /** Catalog ID of the base sprite; its server folder is reused. */
    baseId: number;
    variants: string[];
}

const OBJECT_VARIANTS: VariantSpec[] = [
    {
        type: "FloorDecorationExpanding",
        baseId: 710,
        variants: [
            // NOTE: upstream BC spells this file "CouckPinkSmall" (typo in
            // ChatRoomMap.ts BuildImageName); the correctly-spelled
            // "CouchPinkSmall.png" does not exist on the R132 server (404).
            "CouckPinkSmall",
            "CouchPinkLeft",
            "CouchPinkMiddle",
            "CouchPinkRight",
            "BedBlueSmall",
            "BedBlueLeft",
            "BedBlueMiddle",
            "BedBlueRight",
            "BallPitSmall",
            "BallPitLeft",
            "BallPitMiddle",
            "BallPitRight",
            "VikingTableSmall",
            "VikingTableLeft",
            "VikingTableMiddle",
            "VikingTableRight",
            "Railroad",
            "RailroadNorth",
            "RailroadSouth",
            "RailroadEast",
            "RailroadWest",
            "RailroadNorthSouth",
            "RailroadNorthEast",
            "RailroadNorthWest",
            "RailroadSouthEast",
            "RailroadSouthWest",
            "RailroadEastWest",
            "RailroadNorthSouthEast",
            "RailroadNorthSouthWest",
            "RailroadNorthEastWest",
            "RailroadSouthEastWest",
            "RailroadNorthSouthEastWest",
        ],
    },
    {
        type: "FloorObstacle",
        baseId: 2033,
        variants: [
            "VelourRopeBarrierLeft",
            "VelourRopeBarrierMiddle",
            "VelourRopeBarrierRight",
        ],
    },
];

function objectVariantJobs(): Job[] {
    const jobs: Job[] = [];
    for (const spec of OBJECT_VARIANTS) {
        // Variants are served from the same MapObject folder as the base
        // sprite of the group (exact per-group folder, incl. MOVED_OBJECTS).
        const base = OBJECT_CATALOG.find((o) => o.ID === spec.baseId);
        const assetType = base
            ? (MOVED_OBJECTS[`${base.Type}/${base.Style}`] ?? base.Type)
            : spec.type;
        for (const style of spec.variants) {
            jobs.push({
                label: `objects/${spec.type}/${style}`,
                url: `${BASE_URL}/MapObject/${assetType}/${style}.png`,
                dest: path.join(
                    __dirname,
                    "..",
                    "assets",
                    "objects",
                    spec.type,
                    `${style}.png`,
                ),
            });
        }
    }
    return jobs;
}

async function main(): Promise<void> {
    const opts = parseOptions();
    const tiles = tileJobs();
    const objects = objectJobs();
    const variants = objectVariantJobs();
    const wallEffects = wallEffectJobs();
    console.log(
        `Downloading ${tiles.length} tiles, ${objects.length} objects, ${variants.length} object variants, ${wallEffects.length} wall effects ` +
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

    const variantResult = await runPool(variants, opts);
    console.log(
        `Variants: ${variantResult.ok} downloaded, ${variantResult.skipped} skipped, ${variantResult.failed.length} failed`,
    );

    const wallEffectResult = await runPool(wallEffects, opts);
    console.log(
        `WallEffects: ${wallEffectResult.ok} downloaded, ${wallEffectResult.skipped} skipped, ${wallEffectResult.failed.length} failed`,
    );

    const failed = [
        ...tileResult.failed,
        ...objectResult.failed,
        ...variantResult.failed,
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

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
