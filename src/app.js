import { initControls } from './core/controls.js';
import { initUI } from './ui/UIManager.js';
import { state } from './core/state.js';
import { toRad } from './vendor/astronomy_engine.js';
import { getFrameState } from './core/frameState.js';
import { loadAstronomicalData } from './bootstrap.js';

import {
  buildStarPositionCache,
  drawBackground,
  drawHorizonGlow,
  drawAtmosphericEffects,
  drawLabels2D,
  buildWebGLLabels
} from './render/render2D.js';
import { updateEntities, drawEntities } from './render/entities.js';

('use strict');

/* === CANVAS === */
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W, H, CX, CY, R;

const MAX_RENDER_DPR = 1.0;
function getRenderDPR() {
  return Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR);
}
function resize() {
  const dpr = getRenderDPR();
  window.RENDER_DPR = dpr;
  state.W = W = window.innerWidth;
  state.H = H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  state.CX = CX = W / 2;
  state.CY = CY = H / 2;
}
resize();
window.addEventListener('resize', resize);
initUI();
initControls(canvas);

let lastTD = null;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('touchend', () => {
  if (state.isDragging) {
    state.velAz *= 0.6;
    state.velEl *= 0.6;
  }
  state.isDragging = false;
  lastTD = null;
});
canvas.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      if (lastTD) {
        state.hFOV *= lastTD / d;
        state.hFOV = Math.max(toRad(5), Math.min(toRad(185), state.hFOV));
      }
      lastTD = d;
    } else if (e.touches.length === 1 && state.isDragging) {
      const sens = state.hFOV / W;
      state.velAz = -(e.touches[0].clientX - lastX) * sens;
      state.velEl = (e.touches[0].clientY - lastY) * sens;
      state.lookAz += state.velAz;
      state.lookEl += state.velEl;
      state.lookEl = Math.max(toRad(-89.9), Math.min(toRad(89.9), state.lookEl));
      state.lookAz = ((state.lookAz % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
    }
  },
  { passive: true },
);

/* === FPS === */
let fpsVal = 60,
  lastFPSTime = performance.now(),
  framesCounted = 0;
const fpsEl = document.getElementById('fps-val');

/* === MAIN LOOP === */

let lastClockT = 0;
let lastFrameT = 0;
let lastRenderT = 0;
let rafId = null;

// const TARGET_FPS = 30;
// const FRAME_MS = 1000 / TARGET_FPS;

let isLivelyPaused = false;

function scheduleRender() {
  if (rafId === null && !document.hidden && !isLivelyPaused) {
    rafId = requestAnimationFrame(render);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  } else {
    scheduleRender();
  }
});

window.livelyWallpaperPlaybackChanged = function (isPaused) {
  isLivelyPaused = isPaused;
  if (isPaused) {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  } else {
    scheduleRender();
  }
};

function render(ts) {
  rafId = null;
  if (document.hidden || isLivelyPaused) return;

  // if (ts - lastRenderT < FRAME_MS) {
  //   scheduleRender();
  //   return;
  // }

  const dt = lastFrameT === 0 ? 0 : (ts - lastFrameT) / 1000;
  lastFrameT = ts;
  lastRenderT = ts;

  // Damping
  if (!state.isDragging) {
    if (Math.abs(state.velAz) > 0.00001 || Math.abs(state.velEl) > 0.00001) {
      state.lookAz += state.velAz;
      state.lookEl += state.velEl;
      state.lookEl = Math.max(toRad(-89.9), Math.min(toRad(89.9), state.lookEl));
      state.lookAz = ((state.lookAz % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      state.velAz *= 0.98;
      state.velEl *= 0.98;
    }
  }

  // Zoom Damping
  if (Math.abs(state.velZoom) > 0.00001) {
    state.hFOV *= Math.pow(1.03, state.velZoom * 2.0);
    state.hFOV = Math.max(toRad(15), Math.min(toRad(150), state.hFOV));
    state.velZoom *= 0.98;
  }

  if (dt > 0 && dt < 0.5) updateEntities(dt);

  framesCounted++;
  if (ts - lastFPSTime >= 600) {
    fpsVal = Math.round((framesCounted * 1000) / (ts - lastFPSTime));
    fpsEl.textContent = fpsVal;
    framesCounted = 0;
    lastFPSTime = ts;
  }
  const now = new Date();

  // 1. Generate single frame state
  const fState = getFrameState(ts, now);
  fState.dt = dt;
  const { lst_deg, sunAltAz, sunAlt_deg, starVisibility, atmosphereEnabled } = fState;

  if (ts - lastClockT > 200) {
    if (window.updateClock) window.updateClock(now);
    lastClockT = ts;
  }

  if (window.updateCamCache) window.updateCamCache();
  buildStarPositionCache(lst_deg, state);

  drawBackground(ctx, fState, W, H);

  ctx.clearRect(0, 0, W, H);
  const webglLabels = buildWebGLLabels(lst_deg, starVisibility, state, CX, CY, W, H);

  // 2. Render WebGL layer
  if (window.updateStarLOD) window.updateStarLOD(state.hFOV);
  if (window.renderWebGL) {
    window.renderWebGL(fState, H, []);
  }

  // Render crisp native labels on 2D Canvas overlay
  drawLabels2D(ctx, webglLabels);
  if (atmosphereEnabled) {
    drawHorizonGlow(ctx, sunAlt_deg, sunAltAz.az, state, CX, W, H);
    drawAtmosphericEffects(ctx, fState, W, H);
  }

  if (starVisibility > 0) {
    if (window.toggles.milkyway && window.drawMilkyWay) window.drawMilkyWay(lst_deg);
    drawEntities(ctx);
  }

  scheduleRender();
}

async function start() {
  try {
    await loadAstronomicalData();
    if (window.initWebGL) await window.initWebGL();
    scheduleRender();
  } catch (err) {
    console.error(err);
    document.getElementById('info-bar').textContent = 'WebGL asset load failed: ' + err.message;
  }
}
start();
