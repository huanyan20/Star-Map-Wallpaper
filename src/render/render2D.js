import { horizonY, getXY, altAzToXY } from '../core/camera.js';
import { toRad, raDecToAltAz } from '../vendor/astronomy_engine.js';

const LABEL_COLORS = {
  star: [0.62, 0.74, 0.88],
  con: [1.0, 1.0, 1.0],
  grid: [0.44, 0.56, 1.0],
  ecliptic: [1.0, 0.69, 0.25],
  cardinalRed: [1.0, 0.44, 0.44],
  cardinal: [0.63, 0.69, 0.78],
  zenith: [0.51, 0.67, 1.0],
};

let _starPosPool = null;
let _starPosPoolMap = null;

export function buildStarPositionCache(lst_deg, state) {
  if (!_starPosPool && window.STARS) {
    _starPosPool = window.STARS.map(star => ({ x: 0, y: 0, alt: 0, star, visible: false }));
    _starPosPoolMap = new Map();
    _starPosPool.forEach(p => {
      if (p.star.cn) _starPosPoolMap.set(p.star.cn, p);
    });
  }

  let screenPosCount = 0;
  for (let i = 0; i < 1024; i++) state.spatialHash[i].length = 0;

  const cellW = window.innerWidth / state.SH_COLS;
  const cellH = window.innerHeight / state.SH_ROWS;

  if (_starPosPool) {
    for (let i = 0; i < _starPosPool.length; i++) {
      const pObj = _starPosPool[i];
      const star = pObj.star;
      const rd = raDecToAltAz(star.ra, star.dec, lst_deg);
      const p = altAzToXY(rd.alt, rd.az);
      
      if (p) {
        pObj.x = p.x;
        pObj.y = p.y;
        pObj.alt = rd.alt;
        pObj.visible = true;
        
        state.screenPos[screenPosCount++] = pObj;

        if (p.x >= 0 && p.x < window.innerWidth && p.y >= 0 && p.y < window.innerHeight) {
          const gx = Math.floor(p.x / cellW);
          const gy = Math.floor(p.y / cellH);
          const idx = gy * state.SH_COLS + gx;
          if (idx >= 0 && idx < 1024) {
            state.spatialHash[idx].push(pObj);
          }
        }
      } else {
        pObj.visible = false;
      }
    }
  }
  state.screenPos.length = screenPosCount;
}

export function drawBackground(ctx, fState, W, H) {
  const { topRGB, hy, ts, horRGB } = fState;

  // Ocean
  if (hy < H) {
    // drawOcean(ctx, hy, ts, horRGB, W, H);
  }
  // If sun is below horizon, fill from hy upward for below-screen case
  if (hy >= H && topRGB) {
    ctx.fillStyle = `rgb(${topRGB.join(',')})`;
    ctx.fillRect(0, 0, W, H);
  }
}

export function drawHorizonGlow(ctx, sunAlt_deg, sunAz_rad, state, CX, W, H) {
  const hy = horizonY();
  if (hy < 0) return;

  let azDiff = sunAz_rad - state.lookAz;
  azDiff = ((azDiff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

  let antiAzDiff = azDiff > 0 ? azDiff - Math.PI : azDiff + Math.PI;
  const antiSunX = CX + (antiAzDiff / state.hFOV) * W;

  const venusT = Math.max(0, 1 - Math.abs(sunAlt_deg + 1) / 7);
  if (venusT > 0.05 && antiSunX > -W && antiSunX < W * 2) {
    ctx.save();
    const antiSunAlpha = Math.max(0, 1 - Math.abs(antiAzDiff) / (Math.PI * 0.6));

    if (antiSunAlpha > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = venusT * antiSunAlpha * 0.8;

      const vGrad = ctx.createRadialGradient(antiSunX, hy, W * 0.1, antiSunX, hy, W * 0.8);
      vGrad.addColorStop(0, 'rgba(180, 100, 150, 0.4)');
      vGrad.addColorStop(0.3, 'rgba(120, 80, 140, 0.2)');
      vGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = vGrad;
      ctx.fillRect(antiSunX - W, hy - W * 0.4, W * 2, W * 0.5);

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

  const glowT = Math.max(0, 1 - Math.abs(sunAlt_deg - 3) / 15);
  const dayGlowT = Math.max(0, Math.min(1, (sunAlt_deg - 10) / 20));

  const sunP = altAzToXY((sunAlt_deg * Math.PI) / 180, sunAz_rad);

  if ((glowT > 0.05 || dayGlowT > 0.05) && sunP) {
    const sx = sunP.x;
    const sy = sunP.y;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    if (dayGlowT > 0) {
      ctx.globalAlpha = dayGlowT * 0.3;
      const radius = W * 1.2;
      const dGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
      dGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
      dGrad.addColorStop(0.3, 'rgba(200,220,255,0.25)');
      dGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = dGrad;
      ctx.fillRect(sx - radius, sy - radius, radius * 2, radius * 2);
    }

    if (glowT > 0) {
      ctx.globalAlpha = glowT * 0.3;
      const radius = W * 1.5;
      const sGrad = ctx.createRadialGradient(sx, sy + 30, 0, sx, sy + 30, radius);
      const altShift = Math.max(0, Math.min(1, (sunAlt_deg + 4) / 8));
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

export function drawAtmosphericEffects(ctx, astro, W, H) {
  const { sunRaDec, sunAltAz, sunAlt_deg, moonRaDec, lst_deg } = astro;

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

  const zlVisibility = 0; // Disabled Zodiacal Light as it causes visual confusion

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

  const rayVisibility = Math.max(0, 1 - Math.abs(sunAlt_deg - 2) / 8);
  if (rayVisibility > 0 && sunP && window.toggles.atmosphere) {
    const hy = horizonY();
    if (sunP.y > hy - H * 0.5) {
      ctx.save();
      ctx.beginPath();
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

export function drawLabels2D(ctx, labels) {
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

function addConstellationNameLabels(labels, starVisibility, state, CX, CY, W, H) {
  const centroids = {};
  for (const star of window.STARS) {
    const c = _starPosPoolMap ? _starPosPoolMap.get(star.cn) : null;
    if (!c || !c.visible) continue;
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

function addStarNameLabels(labels, lst_deg, starVisibility, state) {
  if (!window.toggles.starNames) return;

  for (const { x, y, star } of state.screenPos) {
    const rad = Math.max(0.25, 4.2 - star.mag * 0.75);
    const hFOV_deg = (state.hFOV * 180) / Math.PI;

    const fovFull = Math.max(10.0, (8.5 - star.mag) * 15.0);
    const fovStart = fovFull + 20.0;

    let fovAlpha = 1.0;
    if (star.mag > 1.5) {
      if (hFOV_deg >= fovStart) continue;
      if (hFOV_deg > fovFull) {
        let t = (fovStart - hFOV_deg) / (fovStart - fovFull);
        fovAlpha = t * t * (3.0 - 2.0 * t);
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
      mag: star.mag,
    });
  }
}

function addCardinalLabels(labels, W, H) {
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

function addZenithLabel(labels, state, W, H) {
  const p = altAzToXY(toRad(90), state.lookAz);
  if (!p || p.x < 0 || p.x > W || p.y < 0 || p.y > H) return;
  labels.push({
    text: '•',
    x: p.x,
    y: p.y - 2,
    size: 18,
    align: 'center',
    baseline: 'middle',
    color: [0.35, 0.56, 1.0],
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

function addAltAzGridLabels(labels, state, W, H) {
  const fovOpacity = Math.max(0, Math.min(1, (state.hFOV - 0.4) / 0.5));
  if (fovOpacity <= 0.01) return;

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
        alpha: 0.38 * fovOpacity,
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
        alpha: 0.3 * fovOpacity,
      });
    }
  }
}

function addEclipticLabel(labels, lst_deg, starVisibility, state, W, H) {
  const fovOpacity = Math.max(0, Math.min(1, (state.hFOV - 0.4) / 0.5));
  if (fovOpacity <= 0.01) return;

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
      alpha: 0.6 * starVisibility * fovOpacity,
    });
  }
}

export function buildWebGLLabels(lst_deg, starVisibility, state, CX, CY, W, H) {
  const candidates = [];
  if (starVisibility > 0) {
    if (window.toggles.grid) {
      addZenithLabel(candidates, state, W, H);
      addAltAzGridLabels(candidates, state, W, H);
    }
    if (window.toggles.ecliptic) addEclipticLabel(candidates, lst_deg, starVisibility, state, W, H);
    if (window.toggles.conNames) addConstellationNameLabels(candidates, starVisibility, state, CX, CY, W, H);
    addStarNameLabels(candidates, lst_deg, starVisibility, state);
  } else {
    state.screenPos.length = 0;
    if (window.toggles.grid) {
      addZenithLabel(candidates, state, W, H);
      addAltAzGridLabels(candidates, state, W, H);
    }
  }
  addCardinalLabels(candidates, W, H);
  
  // Assign priorities
  for (const lbl of candidates) {
      if (!lbl.priority) {
          if (lbl.color === LABEL_COLORS.cardinal || lbl.color === LABEL_COLORS.cardinalRed || lbl.color === LABEL_COLORS.zenith) {
              lbl.priority = 1000;
          } else if (lbl.color === LABEL_COLORS.con) {
              lbl.priority = 500;
          } else if (lbl.color === LABEL_COLORS.ecliptic) {
              lbl.priority = 400;
          } else if (lbl.color === LABEL_COLORS.star) {
              lbl.priority = 300 - (lbl.mag || 0) * 10;
          } else if (lbl.color === LABEL_COLORS.grid) {
              lbl.priority = 100;
          } else {
              lbl.priority = 0;
          }
      }
  }
  
  // Sort by priority (descending)
  candidates.sort((a, b) => b.priority - a.priority);
  
  const finalLabels = [];
  const occupiedBoxes = [];
  
  const checkCollision = (box1) => {
      // Add a small margin
      const margin = 2;
      for (const box2 of occupiedBoxes) {
          if (box1.xMax + margin < box2.xMin || 
              box1.xMin - margin > box2.xMax || 
              box1.yMax + margin < box2.yMin || 
              box1.yMin - margin > box2.yMax) {
              continue; // No collision
          }
          return true; // Collision
      }
      return false;
  };
  
  for (const lbl of candidates) {
      // Estimate width (approx 0.6 times size per char, varies by font but good enough)
      const textLen = String(lbl.text || '').length;
      const width = textLen * (lbl.size || 12) * 0.6;
      const height = (lbl.size || 12) * 1.2;
      
      let xMin, xMax, yMin, yMax;
      
      if (lbl.align === 'center') {
          xMin = lbl.x - width * 0.5;
          xMax = lbl.x + width * 0.5;
      } else if (lbl.align === 'right') {
          xMin = lbl.x - width;
          xMax = lbl.x;
      } else { // left
          xMin = lbl.x;
          xMax = lbl.x + width;
      }
      
      if (lbl.baseline === 'middle') {
          yMin = lbl.y - height * 0.5;
          yMax = lbl.y + height * 0.5;
      } else if (lbl.baseline === 'bottom') {
          yMin = lbl.y - height;
          yMax = lbl.y;
      } else { // top
          yMin = lbl.y;
          yMax = lbl.y + height;
      }
      
      const box = { xMin, xMax, yMin, yMax };
      
      if (!checkCollision(box)) {
          occupiedBoxes.push(box);
          finalLabels.push(lbl);
      }
  }
  
  return finalLabels;
}
