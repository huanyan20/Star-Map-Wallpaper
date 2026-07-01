const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/app.js');
let content = fs.readFileSync(appPath, 'utf8');

// Replace Error Handlers
content = content.replace(/window\.onerror =[\s\S]*?\}\);/, '');

// Replace Perspective State and Cached Camera
content = content.replace(/\/\* === PERSPECTIVE PROJECTION STATE === \*\/[\s\S]*?return \{ x: px, y: py \};\n\}/, '');

// Replace Interaction
content = content.replace(/\/\* === INTERACTION === \*\/[\s\S]*?\{ passive: true \},\n\);/, '');

// Replace Buttons
content = content.replace(/\/\* Buttons \*\/[\s\S]*?<span style="color:#5b8fff">R<\/span>重置';/, '');

// Replace Tooltip
content = content.replace(/\/\* === TOOLTIP === \*\/[\s\S]*?tooltip\.classList\.remove\('show'\);\n  \}\n\}/, '');

// Replace FPS
// content = content.replace(/\/\* === FPS === \*\/[\s\S]*?const fpsEl = document.getElementById\('fps-val'\);/, ''); // Actually, I didn't extract FPS. Wait, I extracted Clock.

// Replace Clock
content = content.replace(/\/\* === CLOCK === \*\/[\s\S]*?\}\n/, '');

// Replace PROJECTION HELPERS
content = content.replace(/\/\* === PROJECTION HELPERS === \*\/[\s\S]*?return CY \+ 2 \* window\.focalLen\(\) \* Math\.tan\(window\.lookEl \/ 2\);\n\}/, '');

// Prepend imports
content = `import { initControls } from './core/controls.js';\nimport { initUI } from './ui/UIManager.js';\nimport { state } from './core/state.js';\nimport { horizonY, getXY } from './core/camera.js';\n` + content;

// We keep let W, H, CX, CY, R; and sync them to state in resize()
content = content.replace(/window\.hFOV/g, 'state.hFOV');
content = content.replace(/window\.lookAz/g, 'state.lookAz');
content = content.replace(/window\.lookEl/g, 'state.lookEl');
content = content.replace(/horizonY\(\)/g, 'window.horizonY()');

// Sync W, H, CX, CY to state in resize
content = content.replace(
  /W = window\.innerWidth;[\s\S]*?CY = H \/ 2;/,
  "state.W = W = window.innerWidth;\n  state.H = H = window.innerHeight;\n  canvas.width = Math.round(W * dpr);\n  canvas.height = Math.round(H * dpr);\n  canvas.style.width = W + 'px';\n  canvas.style.height = H + 'px';\n  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);\n  state.CX = CX = W / 2;\n  state.CY = CY = H / 2;"
);

// Also call initControls and initUI
content = content.replace(/resize\(\);\nwindow\.addEventListener\('resize', resize\);/, 'resize();\nwindow.addEventListener(\'resize\', resize);\ninitUI();\ninitControls(canvas);\n');

// Replace state variables extracted from TOOLTIP and INTERACTION
content = content.replace(/\bspatialHash\b/g, 'state.spatialHash');
content = content.replace(/\bscreenPos\b/g, 'state.screenPos');
content = content.replace(/\bSH_COLS\b/g, 'state.SH_COLS');
content = content.replace(/\bSH_ROWS\b/g, 'state.SH_ROWS');
content = content.replace(/\bisDragging\b/g, 'state.isDragging');
content = content.replace(/\bvelAz\b/g, 'state.velAz');
content = content.replace(/\bvelEl\b/g, 'state.velEl');
content = content.replace(/\bvelZoom\b/g, 'state.velZoom');

fs.writeFileSync(appPath, content);
console.log('app.js cleaned up');
