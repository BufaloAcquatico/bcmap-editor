// BCMap Editor - regenerate the README Controls table from the keybind registry.
//
// Runs after tsc so the compiled KEYBIND_HELP in dist is available. Mouse-only
// rows (no keybind) are listed here alongside the keyboard registry entries;
// the section between the markers is rewritten in place.

const fs = require("fs");
const path = require("path");

const readmeFile = path.join(__dirname, "..", "README.md");
const keybindsDist = path.join(__dirname, "..", "dist", "vim", "keybinds.js");
const commandsDist = path.join(__dirname, "..", "dist", "vim", "commands.js");
const helpCardDist = path.join(__dirname, "..", "dist", "helpCard.js");

const MOUSE_ROWS = [
    ["Paint tiles or objects", "Left click or left-drag"],
    ["Move the view", "Right drag"],
    ["Zoom", "Mouse wheel"],
];

// Display grouping is single-sourced from the help card
// (src/helpCard.ts GROUP_ORDER / GROUP_LABELS): registry order is
// untouched, rows are only clustered.
const { GROUP_ORDER, GROUP_LABELS } = require(helpCardDist);

function formatKeys(keys) {
    // A bare "/" entry must not be split into "" + "".
    if (keys === "/") return "`/`";
    return keys
        .split("/")
        .map((k) => `\`${k.trim()}\``)
        .join(" / ");
}

function main() {
    const { KEYBIND_HELP } = require(keybindsDist);
    const rows = ["| Action | Input |", "| --- | --- |"];
    const byGroup = new Map(GROUP_ORDER.map((group) => [group, []]));
    for (const [action, input] of MOUSE_ROWS) {
        byGroup.get("mouse").push(`| ${action} | ${input} |`);
    }
    for (const entry of KEYBIND_HELP) {
        const list = byGroup.get(entry.group);
        if (!list) {
            console.error(
                `Unknown keybind group "${entry.group}" for keys "${entry.keys}"`,
            );
            process.exit(1);
        }
        list.push(`| ${entry.description} | ${formatKeys(entry.keys)} |`);
    }
    for (const group of GROUP_ORDER) {
        const list = byGroup.get(group);
        if (list.length === 0) continue;
        rows.push(`| **${GROUP_LABELS[group]}** |  |`);
        rows.push(...list);
    }
    const table = rows.join("\n");

    let readme = fs.readFileSync(readmeFile, "utf8");
    readme = rewriteSection(readme, "KEYBINDS", table);
    fs.writeFileSync(readmeFile, readme);
    console.log(
        `README Controls table regenerated (${KEYBIND_HELP.length} keybinds)`,
    );

    const { COMMANDS } = require(commandsDist);
    const commandRows = ["| Command | What it does |", "| --- | --- |"];
    for (const command of COMMANDS) {
        commandRows.push(`| \`${command.syntax}\` | ${command.description} |`);
    }
    readme = rewriteSection(
        fs.readFileSync(readmeFile, "utf8"),
        "COMMANDS",
        commandRows.join("\n"),
    );
    fs.writeFileSync(readmeFile, readme);
    console.log(
        `README Commands table regenerated (${COMMANDS.length} commands)`,
    );
}

/** Replace the text between the `<!-- NAME:START -->` markers. */
function rewriteSection(readme, name, table) {
    const start = readme.indexOf(`<!-- ${name}:START`);
    const end = readme.indexOf(`<!-- ${name}:END`);
    if (start < 0 || end < 0) {
        console.error(
            `README markers not found: add <!-- ${name}:START --> ... <!-- ${name}:END --> around the table`,
        );
        process.exit(1);
    }
    const after = end + `<!-- ${name}:END -->`.length;
    return (
        readme.slice(0, start) +
        `<!-- ${name}:START -->\n` +
        table +
        `\n<!-- ${name}:END -->` +
        readme.slice(after)
    );
}

if (require.main === module) main();
