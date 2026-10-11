// BCMap Editor - regenerate the README Controls table from the keybind registry.
//
// Runs after tsc so the compiled KEYBIND_HELP in dist is available. Mouse-only
// rows (no keybind) are listed here alongside the keyboard registry entries;
// the section between the markers is rewritten in place.

const fs = require("fs");
const path = require("path");

const readmeFile = path.join(__dirname, "..", "README.md");
const keybindsDist = path.join(__dirname, "..", "dist", "vim", "keybinds.js");

const MOUSE_ROWS = [
    ["Paint tile/object", "Left click or left-drag"],
    ["Pan", "Right drag"],
    ["Zoom", "Mouse wheel"],
];

function main() {
    const { KEYBIND_HELP } = require(keybindsDist);
    const rows = ["| Action | Input |", "| --- | --- |"];
    for (const [action, input] of MOUSE_ROWS) {
        rows.push(`| ${action} | ${input} |`);
    }
    for (const entry of KEYBIND_HELP) {
        // A bare "/" entry must not be split into "" + "".
        const keys =
            entry.keys === "/"
                ? "`/`"
                : entry.keys
                      .split("/")
                      .map((k) => `\`${k.trim()}\``)
                      .join(" / ");
        rows.push(`| ${entry.description} | ${keys} |`);
    }
    const table = rows.join("\n");

    let readme = fs.readFileSync(readmeFile, "utf8");
    const start = readme.indexOf("<!-- KEYBINDS:START");
    const end = readme.indexOf("<!-- KEYBINDS:END");
    if (start < 0 || end < 0) {
        console.error(
            "README markers not found: add <!-- KEYBINDS:START --> ... <!-- KEYBINDS:END --> around the Controls table",
        );
        process.exit(1);
    }
    const after = end + "<!-- KEYBINDS:END -->".length;
    readme =
        readme.slice(0, start) +
        "<!-- KEYBINDS:START -->\n" +
        table +
        "\n<!-- KEYBINDS:END -->" +
        readme.slice(after);
    fs.writeFileSync(readmeFile, readme);
    console.log(
        `README Controls table regenerated (${KEYBIND_HELP.length} keybinds)`,
    );
}

if (require.main === module) main();
