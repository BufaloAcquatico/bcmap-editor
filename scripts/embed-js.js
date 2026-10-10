const fs = require("fs");
const path = require("path");

const distDir = path.join(__dirname, "..", "dist");
const htmlFile = path.join(__dirname, "..", "map-editor.html");

const files = ["catalog.js", "constants.js", "editor.js", "init.js"];
let combined = "";
files.forEach((f) => {
    const content = fs.readFileSync(path.join(distDir, f), "utf8");
    combined += content + "\n";
});

// Transform CommonJS to browser globals
combined = combined
    // Remove esModule define
    .replace(
        /Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*/g,
        "",
    )
    // Replace exports.X = with window.X = (export assignments)
    .replace(/exports\.(\w+)\s*=/g, "window.$1 =")
    // Replace require("lz-string") with LZString global
    .replace(
        /const lz_string_1 = require\("lz-string"\);/g,
        "const lz_string_1 = LZString;",
    )
    // Point the compiled catalog/constants imports at the globals defined above
    .replace(
        /const (\w+) = require\("\.\/(catalog|constants)"\);?/g,
        "const $1 = window;",
    )
    // Remove any other require() calls
    .replace(/require\([^)]+\);?/g, "")
    // Replace remaining exports.X usages (e.g., exports.MAP_WIDTH in class methods)
    .replace(/exports\.(\w+)/g, "window.$1");

let jsContent = `(function() {\n${combined}\n})();`;

let htmlContent = fs.readFileSync(htmlFile, "utf8");
// Find the inline script that holds the embedded editor bundle. The start tag
// may be reformatted (e.g. by Prettier), so match loosely and stop at the next
// closing script tag.
const startMatch = htmlContent.match(/<script>\s*\(function\s*\(\)\s*\{/);
const scriptEndTag = "</script>";
const scriptStart = startMatch ? startMatch.index : -1;
const scriptEnd =
    scriptStart >= 0 ? htmlContent.indexOf(scriptEndTag, scriptStart) : -1;

if (scriptStart >= 0 && scriptEnd > scriptStart) {
    const before = htmlContent.slice(0, scriptStart);
    const after = htmlContent.slice(scriptEnd + scriptEndTag.length);
    htmlContent = before + "<script>" + jsContent + "</script>" + after;
    fs.writeFileSync(htmlFile, htmlContent);
    console.log("JavaScript embedded in map-editor.html");
} else {
    console.error("Could not find script tags to replace");
    process.exit(1);
}
