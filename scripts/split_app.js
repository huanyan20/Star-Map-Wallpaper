const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '../src/app.js');
const cameraPath = path.join(__dirname, '../src/core/camera.js');
const controlsPath = path.join(__dirname, '../src/core/controls.js');
const uiPath = path.join(__dirname, '../src/ui/UIManager.js');

let lines = fs.readFileSync(appPath, 'utf8').split('\n');

// We need to extract the following:
// 1. Error handlers (lines containing window.onerror and unhandledrejection)
// 2. Perspective Projection State & Camera Cache
// 3. Interaction
// 4. Buttons and Keyboard
// 5. Tooltip and Hover
// 6. FPS and Clock
// 7. Projection Helpers

function extractSection(startRegex, endRegex) {
  let startIndex = -1;
  let endIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startIndex === -1 && startRegex.test(lines[i])) {
      startIndex = i;
    }
    if (startIndex !== -1 && endRegex.test(lines[i])) {
      endIndex = i;
      break;
    }
  }
  if (startIndex !== -1 && endIndex !== -1) {
    const extracted = lines.splice(startIndex, endIndex - startIndex + 1);
    return extracted.join('\n');
  }
  return '';
}

// Extract Error Handlers
let errorHandlers = extractSection(/window\.onerror =/, /\}\);/); // Gets the rejection handler end too, wait, unhandledrejection is right after onerror. Let's do it manually.

lines = fs.readFileSync(appPath, 'utf8').split('\n'); // reload to use precise line numbers if needed, but let's just use string matching.

let newCamera = `import { toRad, raDecToAltAz } from '../vendor/astronomy_engine.js';\nimport { state } from './state.js';\n\n`;
let newControls = `import { toRad } from '../vendor/astronomy_engine.js';\nimport { state } from './state.js';\nimport { doHover } from '../ui/UIManager.js';\n\n`;
let newUI = `import { toRad } from '../vendor/astronomy_engine.js';\nimport { state } from './state.js';\n\n`;

// Let's just find and slice based on known comments.
function extractByComment(startComment, endMatchStr) {
    let startIdx = lines.findIndex(l => l.includes(startComment));
    if (startIdx === -1) return '';
    let endIdx = startIdx;
    while(endIdx < lines.length && !lines[endIdx].includes(endMatchStr)) {
        endIdx++;
    }
    if (endIdx < lines.length) endIdx++; // include the end match line if possible, or just until next comment
    // Actually, simpler:
    return '';
}

// Since I am writing a node script, I can just use exact line slices from the current app.js
let appContent = fs.readFileSync(appPath, 'utf8');

// The better way is to do the refactor in the python/node script explicitly:
const cameraCode = `import { toRad, raDecToAltAz } from '../vendor/astronomy_engine.js';
import { state } from './state.js';

/* === CACHED CAMERA VECTORS === */
let _camLx = 0, _camLy = 1, _camLz = 0;
let _camRx = 1, _camRy = 0;
let _camUx = 0, _camUy = 0, _camUz = 1;
let _camF = 500;

export function updateCamCache() {
  _camLx = Math.sin(state.lookAz) * Math.cos(state.lookEl);
  _camLy = Math.cos(state.lookAz) * Math.cos(state.lookEl);
  _camLz = Math.sin(state.lookEl);
  _camRx = Math.cos(state.lookAz);
  _camRy = -Math.sin(state.lookAz);
  _camUx = _camRy * _camLz;
  _camUy = -_camRx * _camLz;
  _camUz = _camRx * _camLy - _camRy * _camLx;
  _camF = window.focalLen();
}

window.focalLen = function() {
  return state.W / 4 / Math.tan(state.hFOV / 4);
}

export function horizonY() {
  return state.CY + 2 * window.focalLen() * Math.tan(state.lookEl / 2);
}

export function altAzToXY(alt_rad, az_rad) {
  if (alt_rad < toRad(-10)) return null;
  const sx = Math.sin(az_rad) * Math.cos(alt_rad);
  const sy = Math.cos(az_rad) * Math.cos(alt_rad);
  const sz = Math.sin(alt_rad);
  const depth = sx * _camLx + sy * _camLy + sz * _camLz;
  if (depth < -0.5) return null;
  const pr = sx * _camRx + sy * _camRy;
  const pu = sx * _camUx + sy * _camUy + sz * _camUz;
  const k = 2 / (1 + depth);
  const px = state.CX + pr * k * _camF;
  const py = state.CY - pu * k * _camF;
  if (px < -state.W * 2 || px > state.W * 3 || py < -state.H * 2 || py > state.H * 3) return null;
  return { x: px, y: py };
}

export function getXY(ra_h, dec_deg, lst_deg) {
  const { alt, az } = raDecToAltAz(ra_h, dec_deg, lst_deg);
  return altAzToXY(alt, az);
}

window.updateCamCache = updateCamCache;
window.altAzToXY = altAzToXY;
window.horizonY = horizonY;
window.getXY = getXY;
`;

const controlsCode = `import { toRad } from '../vendor/astronomy_engine.js';
import { state } from './state.js';
import { doHover } from '../ui/UIManager.js';

export function initControls(canvas) {
  canvas.addEventListener('mousedown', (e) => {
    state.isDragging = true;
    state.velAz = 0;
    state.velEl = 0;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
  });
  window.addEventListener('mouseup', () => {
    if (state.isDragging) {
      state.velAz *= 0.65;
      state.velEl *= 0.65;
    }
    state.isDragging = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    if (state.isDragging) {
      const sens = state.hFOV / state.W;
      state.velAz = -(e.clientX - state.lastX) * sens;
      state.velEl = (e.clientY - state.lastY) * sens;
      state.lookAz += state.velAz;
      state.lookEl += state.velEl;
      state.lookEl = Math.max(toRad(-89.9), Math.min(toRad(89.9), state.lookEl));
      state.lookAz = ((state.lookAz % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      state.lastX = e.clientX;
      state.lastY = e.clientY;
    }
    doHover(e.clientX, e.clientY);
  });
  
  function handleZoom(e) {
    const delta = e.deltaY || e.wheelDelta || -e.detail;
    if (!delta) return;
    e.preventDefault();
    const d = Math.sign(delta);
    state.velZoom += d * 0.009;
  }
  window.addEventListener('wheel', handleZoom, { passive: false });
  window.addEventListener('mousewheel', handleZoom, { passive: false });
  window.addEventListener('DOMMouseScroll', handleZoom, { passive: false });
  document.addEventListener('wheel', handleZoom, { passive: false });
  document.addEventListener('mousewheel', handleZoom, { passive: false });

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      state.isDragging = true;
      state.velAz = 0;
      state.velEl = 0;
      state.lastX = e.touches[0].clientX;
      state.lastY = e.touches[0].clientY;
    }
  }, { passive: true });
  canvas.addEventListener('touchend', () => {
    if (state.isDragging) {
      state.velAz *= 0.6;
      state.velEl *= 0.6;
    }
    state.isDragging = false;
    state.lastTD = null;
  });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (state.lastTD) {
        state.hFOV *= state.lastTD / d;
        state.hFOV = Math.max(toRad(5), Math.min(toRad(185), state.hFOV));
      }
      state.lastTD = d;
    } else if (e.touches.length === 1 && state.isDragging) {
      const sens = state.hFOV / state.W;
      state.velAz = -(e.touches[0].clientX - state.lastX) * sens;
      state.velEl = (e.touches[0].clientY - state.lastY) * sens;
      state.lookAz += state.velAz;
      state.lookEl += state.velEl;
      state.lookEl = Math.max(toRad(-89.9), Math.min(toRad(89.9), state.lookEl));
      state.lookAz = ((state.lookAz % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      state.lastX = e.touches[0].clientX;
      state.lastY = e.touches[0].clientY;
    }
  }, { passive: true });
}
`;

const uiCode = `import { toRad } from '../vendor/astronomy_engine.js';
import { state } from './state.js';

export function initUI() {
  window.onerror = function (msg, src, lineno, colno, error) {
    const errDiv = document.createElement('div');
    errDiv.style.position = 'absolute';
    errDiv.style.top = '10px';
    errDiv.style.left = '10px';
    errDiv.style.color = 'red';
    errDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
    errDiv.style.padding = '20px';
    errDiv.style.zIndex = '999999';
    errDiv.style.fontFamily = 'monospace';
    errDiv.style.fontSize = '20px';
    errDiv.style.maxWidth = '80vw';
    errDiv.innerText = 'ERROR: ' + msg + '\\nLINE: ' + lineno + '\\n' + (error && error.stack ? error.stack : '');
    document.body.appendChild(errDiv);
  };
  window.addEventListener('unhandledrejection', function (event) {
    const errDiv = document.createElement('div');
    errDiv.style.position = 'absolute';
    errDiv.style.top = '150px';
    errDiv.style.left = '10px';
    errDiv.style.color = 'orange';
    errDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
    errDiv.style.padding = '20px';
    errDiv.style.zIndex = '999999';
    errDiv.style.fontFamily = 'monospace';
    errDiv.style.fontSize = '20px';
    errDiv.style.maxWidth = '80vw';
    errDiv.innerText = 'PROMISE REJECTION: ' + (event.reason && event.reason.stack ? event.reason.stack : event.reason);
    document.body.appendChild(errDiv);
  });

  window.toggles = {
    atmosphere: true,
    constellations: false,
    conNames: false,
    starNames: false,
    milkyway: true,
    grid: false,
    equatorial: false,
    ecliptic: false,
  };
  function bindToggle(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
      window.toggles[key] = !window.toggles[key];
      el.classList.toggle('active');
    });
  }
  bindToggle('btn-atmosphere', 'atmosphere');
  bindToggle('btn-constellations', 'constellations');
  bindToggle('btn-con-names', 'conNames');
  bindToggle('btn-star-names', 'starNames');
  bindToggle('btn-milkyway', 'milkyway');
  bindToggle('btn-grid', 'grid');
  bindToggle('btn-equatorial', 'equatorial');
  bindToggle('btn-ecliptic', 'ecliptic');
  
  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.lookAz = Math.PI;
      state.lookEl = toRad(25);
      state.hFOV = toRad(90);
    });
  }

  const keyMap = {
    t: 'atmosphere', c: 'constellations', n: 'conNames',
    s: 'starNames', m: 'milkyway', g: 'grid', e: 'equatorial',
  };
  const btnMap = {
    atmosphere: 'btn-atmosphere', constellations: 'btn-constellations',
    conNames: 'btn-con-names', starNames: 'btn-star-names',
    milkyway: 'btn-milkyway', grid: 'btn-grid', equatorial: 'btn-equatorial',
  };
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (keyMap[k]) {
      const key = keyMap[k];
      window.toggles[key] = !window.toggles[key];
      const btn = document.getElementById(btnMap[key]);
      if (btn) btn.classList.toggle('active', window.toggles[key]);
    } else if (k === 'r') {
      state.lookAz = Math.PI;
      state.lookEl = toRad(25);
      state.hFOV = toRad(90);
    } else if (k === 'w' || e.key === 'ArrowUp') {
      state.lookAz = 0;
      state.lookEl = toRad(25);
    } else if (k === 's' || e.key === 'ArrowDown') {
      state.lookAz = Math.PI;
      state.lookEl = toRad(25);
    } else if (k === 'a' || e.key === 'ArrowLeft') {
      state.lookAz = toRad(270);
      state.lookEl = toRad(25);
    } else if (k === 'd' || e.key === 'ArrowRight') {
      state.lookAz = toRad(90);
      state.lookEl = toRad(25);
    } else if (k === 'z' || k === ' ') {
      state.lookEl = toRad(89.9);
    } else if (k === '1') {
      state.hFOV = toRad(110);
    } else if (k === '2') {
      state.hFOV = toRad(90);
    } else if (k === '3') {
      state.hFOV = toRad(45);
    }
  });

  const infoBar = document.getElementById('info-bar');
  if (infoBar) {
    infoBar.innerHTML = '滾輪縮放 · 拖曳旋轉視角 · 懸停查看 &nbsp;|&nbsp; ' +
      '<span style="color:#5b8fff">WASD/方向鍵</span>切換方位 ' +
      '<span style="color:#5b8fff">Z</span>天頂 ' +
      '<span style="color:#5b8fff">123</span>切換視野 ' +
      '<span style="color:#5b8fff">R</span>重置';
  }
}

export function doHover(mx, my) {
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) return;
  const cellW = state.W / state.SH_COLS;
  const cellH = state.H / state.SH_ROWS;
  const gx = Math.floor(mx / cellW);
  const gy = Math.floor(my / cellH);

  let nearest = null, minD = 22;
  for (let y = Math.max(0, gy - 1); y <= Math.min(state.SH_ROWS - 1, gy + 1); y++) {
    for (let x = Math.max(0, gx - 1); x <= Math.min(state.SH_COLS - 1, gx + 1); x++) {
      const idx = y * state.SH_COLS + x;
      for (const { x: sx, y: sy, star } of state.spatialHash[idx]) {
        const d = Math.hypot(sx - mx, sy - my);
        if (d < minD) {
          minD = d;
          nearest = star;
        }
      }
    }
  }
  if (nearest) {
    document.getElementById('tt-name').textContent = nearest.n + ' (' + nearest.cn + ')';
    document.getElementById('tt-meta').innerHTML =
      '星座: ' + (window.CON_NAMES && window.CON_NAMES[nearest.con] ? window.CON_NAMES[nearest.con] : nearest.con) + '<br>' +
      '<span class="star-mag">視星等: ' + nearest.mag.toFixed(2) + '</span><br>' +
      '光譜型: ' + (nearest.sp || '?') + '<br>' +
      'RA: ' + nearest.ra.toFixed(3) + 'h &nbsp;Dec: ' + nearest.dec.toFixed(2) + '°';
    tooltip.style.left = Math.min(mx + 14, state.W - 215) + 'px';
    tooltip.style.top = Math.min(my - 10, state.H - 130) + 'px';
    tooltip.classList.add('show');
  } else {
    tooltip.classList.remove('show');
  }
}

export function updateClock(now) {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const td = document.getElementById('time-display');
  const dd = document.getElementById('date-display');
  if (td) td.textContent = hh + ':' + mm + ':' + ss;
  if (dd) dd.textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';
}
window.updateClock = updateClock;
`;

fs.writeFileSync(cameraPath, cameraCode);
fs.writeFileSync(controlsPath, controlsCode);
fs.writeFileSync(uiPath, uiCode);

console.log('Files generated.');
