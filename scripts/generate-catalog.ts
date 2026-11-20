import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

// Regenerates src/catalog.ts from Bondage Club's Assets/MapData.js so the
// "generated / do not edit by hand" header stays true. The game source is not
// vendored here; point this at a BC checkout (R134 for this release):
//
//   npm run generate-catalog -- --source=/path/to/BondageClub/Assets/MapData.js
//
// With no --source, BC_MAPDATA is checked, then a couple of conventional
// checkout locations. Only assets MapData.js is needed: the file declares its
// arrays at load time and the few globals referenced by function bodies are
// stubbed below (those bodies are never called during generation).

interface RawEntry {
    ID: number;
    Type: string;
    Style: string;
    Name?: string;
    Top?: number;
    Left?: number;
    Height?: number;
    Width?: number;
    Rotation?: number;
    Unique?: boolean;
    DeprecatedID?: number;
    PaletteImage?: string;
}

const DEFAULT_SOURCES = [
    path.join(
        __dirname,
        "..",
        "..",
        "bc134-source",
        "BondageClub",
        "Assets",
        "MapData.js",
    ),
];

function sourcePath(): string {
    const args = process.argv.slice(2);
    const flag = args.find((a) => a.startsWith("--source="));
    const explicit = flag
        ? flag.slice("--source=".length)
        : process.env.BC_MAPDATA;
    if (explicit) return explicit;
    const found = DEFAULT_SOURCES.find((p) => fs.existsSync(p));
    if (found) return found;
    throw new Error(
        "MapData.js not found. Pass --source=/path/to/BondageClub/Assets/MapData.js " +
            "or set BC_MAPDATA.",
    );
}

function loadGameData(file: string): {
    tiles: RawEntry[];
    objects: RawEntry[];
} {
    const sandbox: Record<string, unknown> = {
        console,
        CurrentTime: 0,
        Player: {},
        MapManager: { Map: { getObjectId: () => 0 } },
        ChatRoomMapViewGetConnectivityDirections: () => ({}),
        Mouse: {},
        Highlight: {},
        ChatRoomMapViewGetTile: () => null,
        CommonMapGetOrInsert: () => {},
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const script =
        fs.readFileSync(file, "utf8") +
        "\n;globalThis.__tiles = AssetsMapDataTiles; " +
        "globalThis.__objects = AssetsMapDataObjects;";
    vm.runInContext(script, sandbox);
    return {
        tiles: sandbox.__tiles as RawEntry[],
        objects: sandbox.__objects as RawEntry[],
    };
}

/** One object literal per line; prettier wraps the long ones after generation. */
function emitTile(t: RawEntry): string {
    const fields: Array<[string, unknown]> = [
        ["ID", t.ID],
        ["Type", t.Type],
        ["Style", t.Style],
    ];
    if (t.Name !== undefined) fields.push(["Name", t.Name]);
    return "    { " + fields.map(emitField).join(", ") + " },";
}

function emitObject(o: RawEntry): string {
    const fields: Array<[string, unknown]> = [
        ["ID", o.ID],
        ["Type", o.Type],
        ["Style", o.Style],
    ];
    if (o.Name !== undefined) fields.push(["Name", o.Name]);
    for (const key of ["Top", "Left", "Height", "Width", "Rotation"] as const) {
        if (o[key] !== undefined) fields.push([key, o[key]]);
    }
    if (o.Unique) fields.push(["unique", true]);
    if (o.DeprecatedID !== undefined)
        fields.push(["deprecatedId", o.DeprecatedID]);
    if (o.PaletteImage !== undefined)
        fields.push(["paletteImage", o.PaletteImage]);
    return "    { " + fields.map(emitField).join(", ") + " },";
}

function emitField([name, value]: [string, unknown]): string {
    return `${name}: ${JSON.stringify(value)}`;
}

function renderCatalog(tiles: RawEntry[], objects: RawEntry[]): string {
    return `// BCMap Editor - Tile and object catalog
//
// GENERATED FILE - DO NOT EDIT BY HAND.
// Regenerate with:
//   npm run generate-catalog -- --source=/path/to/BondageClub/Assets/MapData.js
// Source: Bondage Club \`Assets/MapData.js\` (AssetsMapDataTiles /
// AssetsMapDataObjects), currently R134. Every entry is kept verbatim:
// duplicate styles must NOT be de-duplicated and raw deprecated IDs must NOT
// be remapped on import.
//
// These FULL_* catalogs mirror the official in-game catalogs exactly and are
// the editor's single source of truth: pickers, renderer, importer, and asset
// downloader all read these arrays.

export interface TileDef {
    ID: number;
    Type: "Floor" | "FloorExterior" | "Wall" | "Water";
    Style: string;
    Name?: string;
}

export interface ObjectDef {
    ID: number;
    /** Game display name, when BC provides one (e.g. "DJ Booth"). */
    Name?: string;
    /** Mirrors BC's \`Unique\` flag: at most one per map (ID 110). */
    unique?: boolean;
    /** Mirrors BC's \`DeprecatedID\`: legacy ID for an EmptySpace entry. */
    deprecatedId?: number;
    /** Picker-only image name (\`PaletteImage\` in BC), if different from Style. */
    paletteImage?: string;
    /**
     * Clockwise rotation in degrees (BC's \`Rotation\`). Only the conveyor
     * belts carry it; absent means 0.
     */
    Rotation?: number;
    Type: string;
    Style: string;
    Top?: number;
    Left?: number;
    Height?: number;
    Width?: number;
}

/** Object ID used for an empty object cell / the eraser tool. */
export const BLANK_OBJECT_ID = 100;

/** True for BC's EmptySpace objects: they render nothing on the map. */
export function isEmptyObject(o: { Type: string }): boolean {
    return o.Type === "EmptySpace";
}

export const FULL_TILE_CATALOG: readonly TileDef[] = [
${tiles.map(emitTile).join("\n")}
];

export const FULL_OBJECT_CATALOG: readonly ObjectDef[] = [
${objects.map(emitObject).join("\n")}
];
`;
}

function main(): void {
    const source = sourcePath();
    const { tiles, objects } = loadGameData(source);
    const dest = path.join(__dirname, "..", "src", "catalog.ts");
    fs.writeFileSync(dest, renderCatalog(tiles, objects));
    console.log(
        `Regenerated ${path.relative(process.cwd(), dest)} from ${source}: ` +
            `${tiles.length} tiles, ${objects.length} objects.`,
    );
}

main();
