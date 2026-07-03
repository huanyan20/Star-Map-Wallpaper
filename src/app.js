import { initControls } from './core/controls.js';
import { initUI } from './ui/UIManager.js';
import { state } from './core/state.js';
import { horizonY, getXY, altAzToXY } from './core/camera.js';
import { LAT_DEG, LON_DEG, LAT_RAD, toRad, toDeg, galToRaDec, raDecToAltAz } from './vendor/astronomy_engine.js';
import { getFrameState } from './core/frameState.js';
import { loadAstronomicalData } from './bootstrap.js';

('use strict');



const moonImg = new Image();
moonImg.src = 'assets/moon.png';

/* === STAR LOOKUP === */
let STAR_BY_CN = {};

/* === COLORS === */
function specColor(sp) {
  const c = (sp || '?')[0];
  if (c === 'O') return '#b0c8ff';
  if (c === 'B') return '#d0e8ff';
  if (c === 'A') return '#f8faff';
  if (c === 'F') return '#fff8e8';
  if (c === 'G') return '#ffe870';
  if (c === 'K') return '#ffaa40';
  if (c === 'M') return '#ff6030';
  return '#d0e4ff';
}
function magToRadius(mag) {
  return Math.max(0.25, 4.2 - mag * 0.75);
}
function magToAlpha(mag) {
  return Math.max(0.08, Math.min(1.0, 1.15 - mag * 0.12));
}

/* === GLOW CACHE — OffscreenCanvas pre-rendered halos === */
const GLOW_CACHE = {};
function getGlowCanvas(r, rgbStr, alpha, mag, baseRad) {
  const key =
    mag !== undefined
      ? `${Math.round(r)}_${rgbStr}_${alpha.toFixed(2)}_${mag.toFixed(1)}`
      : `${Math.round(r)}_${rgbStr}_${alpha.toFixed(2)}`;
  if (GLOW_CACHE[key]) return GLOW_CACHE[key];

  let sz = Math.ceil(r * 2) + 2;
  let spikeLen = 0;
  if (mag !== undefined && mag <= 1 && baseRad) {
    spikeLen = baseRad * 15; // 長度與 magToRadius 成正比
    sz = Math.ceil(Math.max(r, spikeLen) * 2) + 2;
  }

  const oc = new OffscreenCanvas(sz, sz);
  const ox = oc.getContext('2d');
  const cx = sz / 2,
    cy = sz / 2;

  const g = ox.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(${rgbStr},${alpha})`);
  g.addColorStop(0.4, `rgba(${rgbStr},${(alpha * 0.3).toFixed(3)})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ox.fillStyle = g;
  ox.beginPath();
  ox.arc(cx, cy, r, 0, Math.PI * 2);
  ox.fill();

  if (spikeLen > 0) {
    ox.globalCompositeOperation = 'lighter';
    ox.lineWidth = 1.0;
    const sGrad = ox.createRadialGradient(cx, cy, 0, cx, cy, spikeLen);
    sGrad.addColorStop(0, `rgba(${rgbStr},${alpha * 1.5})`);
    sGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ox.strokeStyle = sGrad;

    ox.beginPath();
    ox.moveTo(cx - spikeLen, cy - spikeLen);
    ox.lineTo(cx + spikeLen, cy + spikeLen);
    ox.moveTo(cx - spikeLen, cy + spikeLen);
    ox.lineTo(cx + spikeLen, cy - spikeLen);
    ox.stroke();

    ox.globalCompositeOperation = 'source-over';
  }

  GLOW_CACHE[key] = oc;
  return oc;
}

/* === CANVAS === */
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W, H, CX, CY, R;

function resize() {
  const dpr = window.devicePixelRatio || 1;
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




/* === DRAW FUNCTIONS === */
// Background gradient cache (moved to frameState)
function drawBackground(fState) {
  const { topRGB, hy, ts, horRGB } = fState;

  // Ocean
  if (hy < H) {
    // drawOcean(hy, ts, horRGB);
  }
  // If sun is below horizon, fill from hy upward for below-screen case
  if (hy >= H && topRGB) {
    ctx.fillStyle = `rgb(${topRGB.join(',')})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawOcean(hy, ts, horRGB) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, hy, W, H - hy);
  ctx.clip(); // Restrict to below horizon

  // Base water color (reflection of horizon, darkened)
  const grad = ctx.createLinearGradient(0, hy, 0, H);
  grad.addColorStop(0, `rgb(${horRGB.map((c) => Math.max(5, c - 50)).join(',')})`);
  grad.addColorStop(1, '#02050a'); // Deep sea
  ctx.fillStyle = grad;
  ctx.fillRect(0, hy, W, H - hy);

  // Wave layers
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = '#406080';

  for (let i = 0; i < 3; i++) {
    const speed = 0.0008 * (i + 1);
    const freq = 0.01 + i * 0.005;
    const amp = 3 + i * 2;
    // Further waves are smaller and less transparent
    ctx.globalAlpha = 0.15 - i * 0.03;

    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) {
      // Perspective: waves closer to bottom of screen (larger i offset)
      const y = hy + amp * Math.sin(x * freq + ts * speed + i * 100) + i * 12;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.fill();
  }
  ctx.restore();
}

function drawHorizonGlow(sunAlt_deg, sunAz_rad) {
  const hy = window.horizonY();
  if (hy < 0) return; // Horizon is above screen

  // Azimuth difference: sun vs camera
  let azDiff = sunAz_rad - state.lookAz;
  azDiff = ((azDiff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

  // Anti-solar azimuth diff
  let antiAzDiff = azDiff > 0 ? azDiff - Math.PI : azDiff + Math.PI;
  const antiSunX = CX + (antiAzDiff / state.hFOV) * W;

  // 1. Belt of Venus & Earth Shadow (Anti-solar horizon)
  // Visible during twilight (sun between -6 and +4)
  const venusT = Math.max(0, 1 - Math.abs(sunAlt_deg + 1) / 7);
  if (venusT > 0.05 && antiSunX > -W && antiSunX < W * 2) {
    ctx.save();
    // Fade out as we look away from the anti-solar point
    const antiSunAlpha = Math.max(0, 1 - Math.abs(antiAzDiff) / (Math.PI * 0.6));

    if (antiSunAlpha > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = venusT * antiSunAlpha * 0.8;

      const vGrad = ctx.createRadialGradient(antiSunX, hy, W * 0.1, antiSunX, hy, W * 0.8);
      vGrad.addColorStop(0, 'rgba(180, 100, 150, 0.4)'); // Pink/Purple
      vGrad.addColorStop(0.3, 'rgba(120, 80, 140, 0.2)');
      vGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = vGrad;
      ctx.fillRect(antiSunX - W, hy - W * 0.4, W * 2, W * 0.5);

      // Earth shadow band just below the pink
      const sGrad = ctx.createLinearGradient(0, hy - 40, 0, hy);
      sGrad.addColorStop(0, 'rgba(0,0,0,0)');
      sGrad.addColorStop(1, 'rgba(10,15,30,0.6)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = venusT * antiSunAlpha;
      ctx.fillStyle = sGrad;
      ctx.fillRect(0, hy - 40, W, 40);
    }
    ctx.restore();
  }

  // 2. Sunset/Sunrise Directional Mie Scatter (Towards sun)
  const glowT = Math.max(0, 1 - Math.abs(sunAlt_deg - 3) / 15); // Strongest at +3°
  const dayGlowT = Math.max(0, Math.min(1, (sunAlt_deg - 10) / 20)); // Daylight halo

  // Calculate actual sun projection for the sun glow
  const sunP = altAzToXY((sunAlt_deg * Math.PI) / 180, sunAz_rad);

  if ((glowT > 0.05 || dayGlowT > 0.05) && sunP) {
    const sx = sunP.x;
    const sy = sunP.y;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Day white halo
    if (dayGlowT > 0) {
      ctx.globalAlpha = dayGlowT;
      const radius = W * 1.2;
      const dGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
      dGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
      dGrad.addColorStop(0.3, 'rgba(200,220,255,0.25)');
      dGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = dGrad;
      ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
    }

    // Sunset/Sunrise Orange/Red Scatter
    if (glowT > 0) {
      ctx.globalAlpha = glowT;
      const radius = W * 1.5;
      const sGrad = ctx.createRadialGradient(sx, sy + 30, 0, sx, sy + 30, radius);
      // Dynamic colour based on sun altitude (lower = redder)
      const altShift = Math.max(0, Math.min(1, (sunAlt_deg + 4) / 8)); // 0=-4(red), 1=+4(yellow)
      const c1 = altShift > 0.5 ? '255,240,200' : '255,200,100';
      const c2 = altShift > 0.5 ? '255,200,100' : '255,100,50';
      const c3 = altShift > 0.5 ? '255,100,50' : '150,50,50';
      const c4 = altShift > 0.5 ? '100,50,100' : '50,20,80';

      sGrad.addColorStop(0, `rgba(${c1}, 0.85)`);
      sGrad.addColorStop(0.15, `rgba(${c2}, 0.55)`);
      sGrad.addColorStop(0.4, `rgba(${c3}, 0.25)`);
      sGrad.addColorStop(0.7, `rgba(${c4}, 0.05)`);
      sGrad.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = sGrad;
      ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
    }
    ctx.restore();
  }
}

function drawAtmosphericEffects(astro) {
  const { sunRaDec, sunAltAz, sunAlt_deg, moonRaDec, lst_deg } = astro;

  // Calculate Moon Illumination and Interference
  const sDec = (sunRaDec.dec * Math.PI) / 180;
  const sRa = (sunRaDec.ra * 15 * Math.PI) / 180;
  const mDec = (moonRaDec.dec * Math.PI) / 180;
  const mRa = (moonRaDec.ra * 15 * Math.PI) / 180;

  const cosElong =
    Math.sin(sDec) * Math.sin(mDec) + Math.cos(sDec) * Math.cos(mDec) * Math.cos(sRa - mRa);
  const phaseIllum = Math.max(0, (1 - cosElong) / 2);

  const moonAltAz = raDecToAltAz(moonRaDec.ra, moonRaDec.dec, lst_deg);
  let moonInterference = 0;
  if (moonAltAz.alt > toRad(-5)) {
    moonInterference = Math.min(1, (moonAltAz.alt + toRad(5)) / toRad(15)) * phaseIllum;
  }

  const sunP = altAzToXY(sunAltAz.alt, sunAltAz.az);

  // 1. Zodiacal Light (黃道光)
  const zlVisibility =
    Math.max(0, Math.min(1, (sunAlt_deg + 18) / 5)) *
    Math.max(0, Math.min(1, (-5 - sunAlt_deg) / 5));
  if (zlVisibility > 0 && moonInterference < 0.5) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const alphaScale = zlVisibility * (1 - moonInterference * 2);

    const eps = (23.439 * Math.PI) / 180;
    const lambda_sun = Math.atan2(
      Math.sin(sRa) * Math.cos(eps) + Math.tan(sDec) * Math.sin(eps),
      Math.cos(sRa),
    );

    for (const sign of [-1, 1]) {
      const points = [];
      for (let d = 5; d <= 90; d += 4) {
        const lambda = lambda_sun + (sign * d * Math.PI) / 180;
        let ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
        const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));

        const ra_h = (((ra + 2 * Math.PI) % (2 * Math.PI)) * 12) / Math.PI;
        const dec_deg = (dec * 180) / Math.PI;

        const altAz = raDecToAltAz(ra_h, dec_deg, lst_deg);
        if (altAz.alt < -0.1) continue;

        const p = altAzToXY(altAz.alt, altAz.az);
        if (p) points.push({ x: p.x, y: p.y, d });
      }

      if (points.length > 2) {
        ctx.beginPath();
        // Forward edge
        for (let i = 0; i < points.length; i++) {
          const pt = points[i];
          let dx = 0,
            dy = 0;
          if (i < points.length - 1) {
            dx = points[i + 1].x - pt.x;
            dy = points[i + 1].y - pt.y;
          } else {
            dx = pt.x - points[i - 1].x;
            dy = pt.y - points[i - 1].y;
          }
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const radius = W * 0.15 * (1 - pt.d / 100);
          ctx.lineTo(pt.x + nx * radius, pt.y + ny * radius);
        }
        // Backward edge
        for (let i = points.length - 1; i >= 0; i--) {
          const pt = points[i];
          let dx = 0,
            dy = 0;
          if (i > 0) {
            dx = pt.x - points[i - 1].x;
            dy = pt.y - points[i - 1].y;
          } else {
            dx = points[i + 1].x - pt.x;
            dy = points[i + 1].y - pt.y;
          }
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const radius = W * 0.15 * (1 - pt.d / 100);
          ctx.lineTo(pt.x - nx * radius, pt.y - ny * radius);
        }
        ctx.closePath();

        const startP = points[0];
        const endP = points[points.length - 1];
        const grad = ctx.createLinearGradient(startP.x, startP.y, endP.x, endP.y);
        grad.addColorStop(0, `rgba(235, 240, 255, ${0.1 * alphaScale})`);
        grad.addColorStop(1, 'rgba(235, 240, 255, 0)');

        ctx.shadowColor = `rgba(235, 240, 255, ${0.1 * alphaScale})`;
        ctx.shadowBlur = 40;

        ctx.fillStyle = grad;
        ctx.fill();

        ctx.shadowBlur = 0; // reset
      }
    }
    ctx.restore();
  }

  // 2. Gegenschein (對日照)
  if (moonInterference < 0.2) {
    const antiSunRa = (sunRaDec.ra + 12) % 24;
    const antiSunDec = -sunRaDec.dec;
    const antiSunAltAz = raDecToAltAz(antiSunRa, antiSunDec, lst_deg);

    if (antiSunAltAz.alt > 0) {
      const p = altAzToXY(antiSunAltAz.alt, antiSunAltAz.az);
      if (p) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        const altScale = Math.max(0, Math.min(1, antiSunAltAz.alt / toRad(20)));
        const intensity = 0.06 * altScale * (1 - moonInterference * 5);

        if (intensity > 0) {
          const radiusX = W * 0.08;
          const radiusY = W * 0.05;

          ctx.translate(p.x, p.y);
          ctx.rotate(antiSunAltAz.az);

          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radiusX);
          grad.addColorStop(0, `rgba(220, 230, 255, ${intensity})`);
          grad.addColorStop(1, 'rgba(220, 230, 255, 0)');

          ctx.scale(1, radiusY / radiusX);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, radiusX, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  // 3. Crepuscular rays (曙暮輝)
  const rayVisibility = Math.max(0, 1 - Math.abs(sunAlt_deg - 2) / 8);
  if (rayVisibility > 0 && sunP && window.toggles.atmosphere) {
    const hy = window.horizonY();
    if (sunP.y > hy - H * 0.5) { // Sun is relatively near horizon
      ctx.save();
      ctx.beginPath();
      // Clip to sky region above horizon
      ctx.rect(0, 0, W, Math.max(0, hy));
      ctx.clip();

      ctx.globalCompositeOperation = 'lighter';
      ctx.filter = 'blur(15px)';

      const numRays = 8;
      const rayLengthBase = W * 0.5;

      for (let i = 0; i < numRays; i++) {
        const angleBase = -Math.PI + (i / (numRays - 1)) * Math.PI;
        const hash = Math.sin(i * 123.456 + sunAltAz.az * 10);
        const rayAngle = angleBase + hash * 0.2;
        const rayLength = rayLengthBase * (0.6 + 0.4 * Math.cos(hash * 43.21));

        const x2 = sunP.x + Math.cos(rayAngle) * rayLength;
        const y2 = sunP.y + Math.sin(rayAngle) * rayLength;

        const grad = ctx.createLinearGradient(sunP.x, sunP.y, x2, y2);
        const alpha = 0.04 * rayVisibility * (0.5 + 0.5 * hash);
        grad.addColorStop(0, `rgba(255, 235, 190, ${alpha})`);
        grad.addColorStop(1, 'rgba(255, 215, 160, 0)');

        ctx.strokeStyle = grad;
        ctx.lineWidth = W * (0.04 + 0.02 * hash);
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(sunP.x, sunP.y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}

/* === MILKY WAY — Image-based affine mesh projection ===
       milkyway.png: equirectangular galactic coords, GC centred,
       l = –180° (left) to +180° (right), b = –55° (bottom) to +55° (top).
       Each frame we warp 120×20 galactic patches → screen via affine triangles.
    */
function drawMilkyWay(lst_deg) {
  // Milky Way temporarily disabled
}

/* === NAMED STAR SCREEN POSITION CACHE === */
let _starPosCache = {};
function buildStarPositionCache(lst_deg) {
  _starPosCache = {};
  state.screenPos.length = 0;
  for (let i = 0; i < 1024; i++) state.spatialHash[i].length = 0;

  const cellW = window.innerWidth / state.SH_COLS;
  const cellH = window.innerHeight / state.SH_ROWS;

  for (const star of STARS) {
    const rd = raDecToAltAz(star.ra, star.dec, lst_deg);
    const p = altAzToXY(rd.alt, rd.az);
    if (p) {
      _starPosCache[star.cn] = { x: p.x, y: p.y, alt: rd.alt };
      const posObj = { x: p.x, y: p.y, star };
      state.screenPos.push(posObj);

      if (p.x >= 0 && p.x < window.innerWidth && p.y >= 0 && p.y < window.innerHeight) {
        const gx = Math.floor(p.x / cellW);
        const gy = Math.floor(p.y / cellH);
        const idx = gy * state.SH_COLS + gx;
        if (idx >= 0 && idx < 1024) {
          state.spatialHash[idx].push(posObj);
        }
      }
    }
  }
}

const LABEL_COLORS = {
  star: [0.62, 0.74, 0.88],
  con: [1.0, 1.0, 1.0],
  grid: [0.44, 0.56, 1.0],
  ecliptic: [1.0, 0.69, 0.25],
  cardinalRed: [1.0, 0.44, 0.44],
  cardinal: [0.63, 0.69, 0.78],
  zenith: [0.51, 0.67, 1.0],
};

function colorToRgba(c, alpha) {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${alpha})`;
}

function addConstellationNameLabels(labels, starVisibility) {
  const centroids = {};
  for (const star of STARS) {
    const c = _starPosCache[star.cn];
    if (!c) continue;
    if (!centroids[star.con]) centroids[star.con] = { x: 0, y: 0, n: 0 };
    centroids[star.con].x += c.x;
    centroids[star.con].y += c.y;
    centroids[star.con].n++;
  }
  for (const [con, c] of Object.entries(centroids)) {
    if (c.n < 1) continue;
    const px = c.x / c.n;
    const py = c.y / c.n;
    const dx = px - CX;
    const dy = py - CY;
    const dist = Math.hypot(dx, dy);
    const maxDist = Math.min(W, H) * 0.45;
    const fade = Math.max(0, 1 - Math.pow(dist / maxDist, 1.5));
    labels.push({
      text: window.CON_NAMES[con] || con,
      x: px,
      y: py,
      size: 13,
      align: 'center',
      baseline: 'middle',
      color: LABEL_COLORS.con,
      alpha: 0.85 * starVisibility * fade,
    });
  }
}

function addStarNameLabels(labels, lst_deg, starVisibility) {
  if (!window.toggles.starNames) return;

  for (const { x, y, star } of state.screenPos) {
    const rad = Math.max(0.25, 4.2 - star.mag * 0.75);
    const hFOV_deg = (state.hFOV * 180) / Math.PI;

    // Calculate the FOV range where this star's label should fade in.
    // Dimmer stars need a smaller FOV (zoomed in) to become visible.
    const fovFull = Math.max(10.0, (8.5 - star.mag) * 15.0); // FOV at which alpha is 100%
    const fovStart = fovFull + 20.0; // FOV at which alpha starts increasing from 0%

    let fovAlpha = 1.0;
    if (star.mag > 1.5) {
      // Always show very bright stars
      if (hFOV_deg >= fovStart) continue;
      if (hFOV_deg > fovFull) {
        let t = (fovStart - hFOV_deg) / (fovStart - fovFull);
        fovAlpha = t * t * (3.0 - 2.0 * t); // Smoothstep easing
      }
    }

    const alpha = Math.max(0.45, 1.0 - star.mag * 0.08) * starVisibility * fovAlpha;
    if (alpha <= 0.01) continue;

    labels.push({
      text: star.n,
      x: x + Math.max(2, rad) + 2,
      y: y,
      size: Math.max(8, 10 * Math.pow(toRad(90) / state.hFOV, 0.35)),
      align: 'left',
      baseline: 'middle',
      color: LABEL_COLORS.star,
      alpha: alpha,
    });
  }
}

function addCardinalLabels(labels) {
  const dirs = [
    { az: 0, l: '北', c: LABEL_COLORS.cardinalRed },
    { az: 90, l: '東', c: LABEL_COLORS.cardinal },
    { az: 180, l: '南', c: LABEL_COLORS.cardinal },
    { az: 270, l: '西', c: LABEL_COLORS.cardinal },
  ];
  for (const d of dirs) {
    const p = altAzToXY(0, toRad(d.az));
    if (!p || p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
    labels.push({
      text: d.l,
      x: p.x,
      y: p.y,
      size: 14,
      align: 'center',
      baseline: 'middle',
      color: d.c,
      alpha: 0.9,
    });
    labels.push({
      text: d.az + '°',
      x: p.x,
      y: p.y + 14,
      size: 10,
      align: 'center',
      baseline: 'middle',
      color: LABEL_COLORS.cardinal,
      alpha: 0.4,
    });
  }
}

function addZenithLabel(labels) {
  const p = altAzToXY(toRad(90), state.lookAz);
  if (!p || p.x < 0 || p.x > W || p.y < 0 || p.y > H) return;
  // We can't render the 3px dot purely through MSDF labels, but
  // the performance gain of avoiding canvas context state changes is huge.
  labels.push({
    text: '•',
    x: p.x,
    y: p.y - 2, // Shift slightly so '•' aligns with original dot pos
    size: 18,
    align: 'center',
    baseline: 'middle',
    color: [0.35, 0.56, 1.0], // #5b8fff
    alpha: 0.5,
  });
  labels.push({
    text: '天頂',
    x: p.x,
    y: p.y - 5,
    size: 10,
    align: 'center',
    baseline: 'bottom',
    color: LABEL_COLORS.zenith,
    alpha: 0.5,
  });
}

function addAltAzGridLabels(labels) {
  for (let alt = 15; alt <= 90; alt += 15) {
    const pl = altAzToXY(toRad(alt), state.lookAz);
    if (pl && pl.x > 20 && pl.x < W - 20 && pl.y > 10 && pl.y < H - 10) {
      labels.push({
        text: alt + '°',
        x: pl.x + 4,
        y: pl.y - 2,
        size: 9,
        align: 'left',
        baseline: 'middle',
        color: LABEL_COLORS.grid,
        alpha: 0.38,
      });
    }
  }
  for (let az2 = 0; az2 < 360; az2 += 30) {
    const ph = altAzToXY(toRad(1), toRad(az2));
    if (ph && ph.x > 20 && ph.x < W - 20 && ph.y > 10 && ph.y < H - 10) {
      labels.push({
        text: az2 + '°',
        x: ph.x,
        y: ph.y + 12,
        size: 9,
        align: 'center',
        baseline: 'middle',
        color: LABEL_COLORS.grid,
        alpha: 0.3,
      });
    }
  }
}

function addEclipticLabel(labels, lst_deg, starVisibility) {
  const eps = (23.439 * Math.PI) / 180;
  const labelLambda = (90 * Math.PI) / 180;
  let raLabel = Math.atan2(Math.cos(eps) * Math.sin(labelLambda), Math.cos(labelLambda));
  const decLabel = Math.asin(Math.sin(eps) * Math.sin(labelLambda));
  raLabel = (((raLabel + 2 * Math.PI) % (2 * Math.PI)) * 12) / Math.PI;
  const pLabel = getXY(raLabel, (decLabel * 180) / Math.PI, lst_deg);
  if (pLabel && pLabel.x > 50 && pLabel.x < W - 50 && pLabel.y > 50 && pLabel.y < H - 50) {
    labels.push({
      text: '黃道 Ecliptic',
      x: pLabel.x,
      y: pLabel.y - 10,
      size: 12,
      align: 'center',
      baseline: 'middle',
      color: LABEL_COLORS.ecliptic,
      alpha: 0.6 * starVisibility,
    });
  }
}

function buildWebGLLabels(lst_deg, starVisibility) {
  const labels = [];
  if (starVisibility > 0) {
    if (window.toggles.grid) {
      addZenithLabel(labels);
      addAltAzGridLabels(labels);
    }
    if (window.toggles.ecliptic) addEclipticLabel(labels, lst_deg, starVisibility);
    if (window.toggles.conNames) addConstellationNameLabels(labels, starVisibility);
    addStarNameLabels(labels, lst_deg, starVisibility);
  } else {
    state.screenPos.length = 0;
    if (window.toggles.grid) {
      addZenithLabel(labels);
      addAltAzGridLabels(labels);
    }
  }
  addCardinalLabels(labels);
  return labels;
}

function drawLabels2D(labels) {
  ctx.save();
  for (const lbl of labels) {
    if (!lbl.text) continue;
    let c = lbl.color || [1, 1, 1];
    if (typeof c === 'string') {
      c = LABEL_COLORS[c] || [1, 1, 1];
    }
    const a = lbl.alpha !== undefined ? lbl.alpha : 1.0;
    ctx.fillStyle = `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${a})`;

    ctx.font = `${lbl.weight ? lbl.weight + ' ' : ''}${lbl.size || 12}px Outfit, Rajdhani, sans-serif`;
    ctx.textAlign = lbl.align || 'center';
    ctx.textBaseline = lbl.baseline || 'middle';

    ctx.shadowColor = `rgba(0,0,0,${0.8 * a})`;
    ctx.shadowBlur = 3;

    ctx.fillText(lbl.text, lbl.x, lbl.y);
  }
  ctx.restore();
}

/* === METEORS & SATELLITES === */

const entities = [];

function updateEntities(dt) {
  // Spawn Meteor (approx 1 per 3-5 seconds depending on fps)

  if (Math.random() < 0.005) {
    entities.push({
      type: 'meteor',

      alt: (Math.random() * Math.PI) / 2 + 0.2,

      az: Math.random() * Math.PI * 2,

      speed: 0.1 + Math.random() * 0.3, // fast

      dir: Math.random() * Math.PI * 2,

      life: 0.15 + Math.random() * 0.4,

      maxLife: 0,

      brightness: 0.5 + Math.random(),

      col: Math.random() > 0.7 ? '#aaffcc' : '#ffffff',
    });

    const m = entities[entities.length - 1];

    m.maxLife = m.life;
  }

  // Spawn Satellite (approx 1 per 30 seconds)

  if (Math.random() < 0.0005) {
    entities.push({
      type: 'satellite',

      alt: (Math.random() * Math.PI) / 2,

      az: Math.random() * Math.PI * 2,

      speed: 0.002 + Math.random() * 0.004, // slow

      dir: Math.random() * Math.PI * 2,

      life: 60,

      maxLife: 60,

      brightness: 0.3 + Math.random() * 0.7,
    });
  }

  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i];

    e.life -= dt;

    if (e.life <= 0) {
      entities.splice(i, 1);
      continue;
    }

    // Move on sphere

    e.alt += Math.sin(e.dir) * e.speed * dt;

    e.az += (Math.cos(e.dir) * e.speed * dt) / Math.cos(e.alt);
  }
}

function drawEntities() {
  ctx.save();

  for (const e of entities) {
    const p = altAzToXY(e.alt, e.az);

    if (!p) continue;

    if (e.type === 'meteor') {
      const tailAlt = e.alt - Math.sin(e.dir) * e.speed * 0.1;

      const tailAz = e.az - (Math.cos(e.dir) * e.speed * 0.1) / Math.cos(e.alt);

      const pt = altAzToXY(tailAlt, tailAz);

      if (!pt) continue;

      const alpha = Math.min(1, (e.life / e.maxLife) * 3) * e.brightness;

      const grad = ctx.createLinearGradient(pt.x, pt.y, p.x, p.y);

      grad.addColorStop(0, 'rgba(255,255,255,0)');

      grad.addColorStop(1, e.col);

      ctx.globalAlpha = alpha;

      ctx.beginPath();

      ctx.moveTo(pt.x, pt.y);

      ctx.lineTo(p.x, p.y);

      ctx.strokeStyle = grad;

      ctx.lineWidth = 1.5;

      ctx.lineCap = 'round';

      ctx.stroke();

      // head flash

      ctx.fillStyle = '#fff';

      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.0, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === 'satellite') {
      const alpha =
        Math.min(1, Math.max(0, Math.sin(e.alt) * 2)) *
        Math.min(1, e.life / 5) *
        Math.min(1, (e.maxLife - e.life) / 5) *
        e.brightness;

      ctx.globalAlpha = alpha;

      ctx.fillStyle = '#ffeedd';

      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/* === MAIN LOOP === */

let lastClockT = 0;
let lastFrameT = 0;

function render(ts) {
  if (lastFrameT === 0) lastFrameT = ts;
  const dt = (ts - lastFrameT) / 1000;
  lastFrameT = ts;

  // 慣性滑動 (Damping)
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

  // 縮放慣性滑動
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
  now.setHours(21, 0, 0, 0);
  
  // 1. Generate single frame state
  const fState = getFrameState(ts, now);
  fState.dt = dt;
  const { lst_deg, sunRaDec, sunAltAz, sunAlt_deg, moonRaDec, moonPhase, starVisibility, topRGB, midRGB, horRGB, hy, atmosphereEnabled } = fState;

  if (ts - lastClockT > 200) {
    // updateClock(now);
    if (window.updateClock) window.updateClock(now);
    lastClockT = ts;
  }

  if (window.updateCamCache) window.updateCamCache();
  buildStarPositionCache(lst_deg);

  drawBackground(fState); 

  ctx.clearRect(0, 0, W, H);
  const webglLabels = buildWebGLLabels(lst_deg, starVisibility);

  // 2. Render WebGL layer
  if (window.updateStarLOD) window.updateStarLOD(state.hFOV);
  if (window.renderWebGL) {
    window.renderWebGL(fState, H, []);
  }

  // Render crisp native labels on 2D Canvas overlay
  drawLabels2D(webglLabels);
  if (atmosphereEnabled) {
    drawHorizonGlow(sunAlt_deg, sunAltAz.az);
    drawAtmosphericEffects(fState);
  }

  // Sun (draw below clouds/stars so it blends with sky naturally)
  // if (sunAltAz.alt > toRad(-0.5)) drawSun(sunAltAz.alt, sunAltAz.az); // Migrated to WebGL

  if (starVisibility > 0) {
    if (window.toggles.milkyway) drawMilkyWay(lst_deg);
    drawEntities();
  } else {
    // Daytime labels are handled by the WebGL label layer.
  }

  // Moon (always on top)
  // Moon rendering migrated to WebGL

  requestAnimationFrame(render);
}
async function start() {
  try {
    await loadAstronomicalData();
    window.STARS.forEach((s) => {
      STAR_BY_CN[s.cn] = s;
    });
    if (window.initWebGL) await window.initWebGL();
    requestAnimationFrame(render);
  } catch (err) {
    console.error(err);
    document.getElementById('info-bar').textContent = 'WebGL asset load failed: ' + err.message;
  }
}
start();
