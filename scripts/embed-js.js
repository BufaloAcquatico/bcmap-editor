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

let jsContent = `(function() {\n${combined}\n})();`;

let htmlContent = fs.readFileSync(htmlFile, 'utf8');
const scriptTag = `<script src="dist/editor.js"></script>`;
const newScriptTag = `<script>${jsContent}</script>`;
htmlContent = htmlContent.replace(scriptTag, newScriptTag);

fs.writeFileSync(htmlFile, htmlContent);
console.log('JavaScript embedded in map-editor.html');
