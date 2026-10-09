const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const htmlFile = path.join(__dirname, '..', 'map-editor.html');

const files = ['editor.js', 'init.js'];
let combined = '';
files.forEach(f => {
  const content = fs.readFileSync(path.join(distDir, f), 'utf8');
  combined += content + '\n';
});

// Transform CommonJS to browser globals
combined = combined
  // Remove esModule define
  .replace(/Object\.defineProperty\(exports, "__esModule", \{ value: true \}\);\s*/g, '')
  // Replace exports.X = with window.X = (export assignments)
  .replace(/exports\.(\w+)\s*=/g, 'window.$1 =')
  // Replace require("lz-string") with LZString global
  .replace(/const lz_string_1 = require\("lz-string"\);/g, 'const lz_string_1 = LZString;')
  // Remove any other require() calls
  .replace(/require\([^)]+\);?/g, '')
  // Replace remaining exports.X usages (e.g., exports.MAP_WIDTH in class methods)
  .replace(/exports\.(\w+)/g, 'window.$1');

let jsContent = `(function() {\n${combined}\n})();`;

let htmlContent = fs.readFileSync(htmlFile, 'utf8');
// Find the inline script between <script>(function() { and })();</script>
const scriptStart = htmlContent.indexOf('<script>(function() {');
const scriptEnd = htmlContent.indexOf('})();</script>') + '})();</script>'.length;

if (scriptStart >= 0 && scriptEnd > scriptStart) {
  const before = htmlContent.slice(0, scriptStart);
  const after = htmlContent.slice(scriptEnd);
  htmlContent = before + '<script>' + jsContent + '</script>' + after;
  fs.writeFileSync(htmlFile, htmlContent);
  console.log('JavaScript embedded in map-editor.html');
} else {
  console.error('Could not find script tags to replace');
  process.exit(1);
}
