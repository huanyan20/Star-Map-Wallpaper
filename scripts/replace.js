const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const oldScript = '<script src="js/webgl_engine.js?v=4"></script>';
const newScripts = `<script src="js/webgl/globals.js"></script>
  <script src="js/webgl/stars.js"></script>
  <script src="js/webgl/labels.js"></script>
  <script src="js/webgl/ocean.js"></script>
  <script src="js/webgl/sky.js"></script>
  <script src="js/webgl/grids.js"></script>
  <script src="js/webgl/render.js"></script>
  <script src="js/webgl/init.js"></script>`;

if (html.includes(oldScript)) {
  html = html.replace(oldScript, newScripts);
  fs.writeFileSync('index.html', html, 'utf8');
  console.log('Updated index.html');
} else {
  console.log('oldScript not found in index.html');
}
