/**
 * build_mw_glow.js
 * Generates public/assets/mw_glow.png from milkyway.png by:
 *   1. Applying a large separable box-blur (multi-pass ≈ Gaussian)
 *   2. Reducing saturation to ~25% (keeps a hint of colour)
 *   3. Boosting overall brightness slightly so the additive layer is visible
 */

const fs   = require('fs');
const path = require('path');
const { Jimp } = require('jimp');

const IMAGE_PATH = 'public/assets/milkyway.png';
const OUT_PATH   = 'public/assets/mw_glow.png';

// ── Blur parameters ──────────────────────────────────────────────────────────
const BLUR_RADIUS = 18;   // box radius per pass (px)
const BLUR_PASSES = 4;    // more passes → closer to true Gaussian
// ── Colour parameters ────────────────────────────────────────────────────────
const SAT_RETAIN  = 0.25; // keep 25 % of original saturation
const BRIGHTNESS  = 1.4;  // global brightness boost for the fog layer

// ── Helpers ──────────────────────────────────────────────────────────────────

/** In-place horizontal box blur on raw RGBA bitmap */
function blurH(data, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    // Running sum for each channel
    let sumR = 0, sumG = 0, sumB = 0;
    // Seed the window from the left edge (clamped)
    for (let k = -r; k <= r; k++) {
      const xi = Math.max(0, Math.min(w - 1, k));
      const i  = (row + xi) * 4;
      sumR += data[i]; sumG += data[i+1]; sumB += data[i+2];
    }
    for (let x = 0; x < w; x++) {
      const i = (row + x) * 4;
      data[i]   = sumR * inv;
      data[i+1] = sumG * inv;
      data[i+2] = sumB * inv;
      // Advance window
      const xOut = Math.min(w - 1, x + r + 1);
      const xIn  = Math.max(0,     x - r);
      const iOut = (row + xOut) * 4;
      const iIn  = (row + xIn)  * 4;
      sumR += data[iOut] - data[iIn];
      sumG += data[iOut+1] - data[iIn+1];
      sumB += data[iOut+2] - data[iIn+2];
    }
  }
}

/** In-place vertical box blur on raw RGBA bitmap */
function blurV(data, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let sumR = 0, sumG = 0, sumB = 0;
    for (let k = -r; k <= r; k++) {
      const yi = Math.max(0, Math.min(h - 1, k));
      const i  = (yi * w + x) * 4;
      sumR += data[i]; sumG += data[i+1]; sumB += data[i+2];
    }
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      data[i]   = sumR * inv;
      data[i+1] = sumG * inv;
      data[i+2] = sumB * inv;
      const yOut = Math.min(h - 1, y + r + 1);
      const yIn  = Math.max(0,     y - r);
      const iOut = (yOut * w + x) * 4;
      const iIn  = (yIn  * w + x) * 4;
      sumR += data[iOut] - data[iIn];
      sumG += data[iOut+1] - data[iIn+1];
      sumB += data[iOut+2] - data[iIn+2];
    }
  }
}

async function build() {
  console.log('Loading', IMAGE_PATH, '...');
  const image = await Jimp.read(IMAGE_PATH);
  const { width: w, height: h, data } = image.bitmap;
  console.log(`Image: ${w}×${h}`);

  // ── Step 1: multi-pass separable box blur ──────────────────────────────────
  console.log(`Blurring (${BLUR_PASSES} × r${BLUR_RADIUS}) ...`);
  for (let p = 0; p < BLUR_PASSES; p++) {
    blurH(data, w, h, BLUR_RADIUS);
    blurV(data, w, h, BLUR_RADIUS);
    process.stdout.write(`  pass ${p + 1}/${BLUR_PASSES}\r`);
  }
  console.log('\nBlur done.');

  // ── Step 2: desaturate + brightness boost ─────────────────────────────────
  console.log('Desaturating and boosting brightness ...');
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    // Mix toward greyscale
    data[i]   = Math.min(255, (lum + (r - lum) * SAT_RETAIN) * BRIGHTNESS);
    data[i+1] = Math.min(255, (lum + (g - lum) * SAT_RETAIN) * BRIGHTNESS);
    data[i+2] = Math.min(255, (lum + (b - lum) * SAT_RETAIN) * BRIGHTNESS);
    // alpha stays 255
  }

  // ── Step 3: write output ───────────────────────────────────────────────────
  console.log('Writing', OUT_PATH, '...');
  await image.write(OUT_PATH);
  console.log('Done.');
}

build().catch(console.error);
