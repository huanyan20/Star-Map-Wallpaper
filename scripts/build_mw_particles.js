const fs = require('fs');
const { Jimp } = require('jimp');

const IMAGE_PATH = 'public/assets/milkyway.png';
const OUT_PATH = 'public/assets/mw_particles.bin';

const TARGET_PARTICLES = 300000; // 300k points for a lush milky way
const MAX_ATTEMPTS = 50000000;
const BLUR_RADIUS = 18; // box radius per pass (px)
const BLUR_PASSES = 4;  // more passes → closer to true Gaussian
const GALACTIC_PLANE_SIGMA = 0.30;
const GALACTIC_CORE_SIGMA = 1.05;
const RIFT_WIDTH = 0.07;
const RIFT_STRENGTH = 0.45;

// J2000 Equatorial to Galactic matrix
// J2000 NGP: RA=192.85948, Dec=27.12825
const eqToGalMat = [
  [-0.054876, -0.873437, -0.483835],
  [0.494109, -0.444830,  0.746982],
  [-0.867666, -0.198076,  0.455984]
];

function blurH(data, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sumR = 0, sumG = 0, sumB = 0;
    for (let k = -r; k <= r; k++) {
      const xi = Math.max(0, Math.min(w - 1, k));
      const i = (row + xi) * 4;
      sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2];
    }
    for (let x = 0; x < w; x++) {
      const i = (row + x) * 4;
      data[i] = sumR * inv;
      data[i + 1] = sumG * inv;
      data[i + 2] = sumB * inv;
      const xOut = Math.min(w - 1, x + r + 1);
      const xIn = Math.max(0, x - r);
      const iOut = (row + xOut) * 4;
      const iIn = (row + xIn) * 4;
      sumR += data[iOut] - data[iIn];
      sumG += data[iOut + 1] - data[iIn + 1];
      sumB += data[iOut + 2] - data[iIn + 2];
    }
  }
}

function blurV(data, w, h, r) {
  const inv = 1 / (2 * r + 1);
  for (let x = 0; x < w; x++) {
    let sumR = 0, sumG = 0, sumB = 0;
    for (let k = -r; k <= r; k++) {
      const yi = Math.max(0, Math.min(h - 1, k));
      const i = (yi * w + x) * 4;
      sumR += data[i]; sumG += data[i + 1]; sumB += data[i + 2];
    }
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      data[i] = sumR * inv;
      data[i + 1] = sumG * inv;
      data[i + 2] = sumB * inv;
      const yOut = Math.min(h - 1, y + r + 1);
      const yIn = Math.max(0, y - r);
      const iOut = (yOut * w + x) * 4;
      const iIn = (yIn * w + x) * 4;
      sumR += data[iOut] - data[iIn];
      sumG += data[iOut + 1] - data[iIn + 1];
      sumB += data[iOut + 2] - data[iIn + 2];
    }
  }
}

function blurImage(data, w, h, r, passes) {
  for (let pass = 0; pass < passes; pass++) {
    blurH(data, w, h, r);
    blurV(data, w, h, r);
  }
}

function eqToGal(x, y, z) {
  return [
    x * eqToGalMat[0][0] + y * eqToGalMat[0][1] + z * eqToGalMat[0][2],
    x * eqToGalMat[1][0] + y * eqToGalMat[1][1] + z * eqToGalMat[1][2],
    x * eqToGalMat[2][0] + y * eqToGalMat[2][1] + z * eqToGalMat[2][2]
  ];
}

function shapeEnvelope(l, b) {
  const absLat = Math.abs(b);
  const longitudinalBias = Math.exp(-0.5 * Math.pow(l / GALACTIC_CORE_SIGMA, 2));
  const planeBand = Math.exp(-0.5 * Math.pow(absLat / GALACTIC_PLANE_SIGMA, 2));
  const riftShift = 0.06 * Math.sin(l * 2.0 + 0.6);
  const riftMask = Math.exp(-0.5 * Math.pow((absLat - riftShift) / RIFT_WIDTH, 2));
  const envelope = 0.20 + 0.75 * planeBand * (0.55 + 0.45 * longitudinalBias) - RIFT_STRENGTH * riftMask;
  return Math.max(0.04, Math.min(1.0, envelope));
}

async function build() {
  console.log('Loading milkyway.png...');
  const image = await Jimp.read(IMAGE_PATH);
  const width = image.bitmap.width;
  const height = image.bitmap.height;

  console.log(`Image loaded: ${width}x${height}`);
  console.log(`Blurring density map with radius ${BLUR_RADIUS}, ${BLUR_PASSES} passes...`);
  blurImage(image.bitmap.data, width, height, BLUR_RADIUS, BLUR_PASSES);

  console.log(`Synthesizing ${TARGET_PARTICLES} points via rejection sampling...`);

  const buffer = Buffer.alloc(TARGET_PARTICLES * 16);
  let count = 0;
  let attempts = 0;

  while (count < TARGET_PARTICLES && attempts < MAX_ATTEMPTS) {
    attempts++;
    
    // Generate uniform random point on sphere (Equatorial Cartesian)
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    
    const eqX = Math.sin(phi) * Math.cos(theta);
    const eqY = Math.sin(phi) * Math.sin(theta);
    const eqZ = Math.cos(phi);

    // Convert to Galactic
    const gal = eqToGal(eqX, eqY, eqZ);
    
    // Galactic longitude and latitude
    const l = Math.atan2(gal[1], gal[0]); // -PI to PI
    const b = Math.asin(gal[2]); // -PI/2 to PI/2

    // milkyway.png is usually equirectangular
    // Left edge is l = -180, right is l = +180. Center is l = 0.
    const uMap = l / (2.0 * Math.PI) + 0.5;
    
    // Image Y is from b = +55 to -55 deg
    const maxB = 55.0 * Math.PI / 180.0;
    if (b > maxB || b < -maxB) continue;
    
    const vMap = 1.0 - (b + maxB) / (2.0 * maxB); // 1.0 - ... because image Y goes down

    const px = Math.floor(uMap * (width - 1));
    const py = Math.floor(vMap * (height - 1));

    const color = image.getPixelColor(px, py);
    const r = (color >> 24) & 0xFF;
    const g = (color >> 16) & 0xFF;
    const bl = (color >> 8) & 0xFF;

    // Use luminance as probability, but blend it with a simple procedural galactic envelope
    // so the overall shape is no longer driven entirely by the source photo.
    const luminance = (0.299 * r + 0.587 * g + 0.114 * bl) / 255.0;
    const envelope = shapeEnvelope(l, b);
    const probBase = Math.pow(luminance, 0.45);
    let prob = probBase * (0.35 + 0.65 * envelope);
    prob = Math.min(Math.max(prob, 0.02), 0.8);

    if (Math.random() < prob) {
      // Accept point
      const offset = count * 16;
      buffer.writeFloatLE(eqX, offset);
      buffer.writeFloatLE(eqY, offset + 4);
      buffer.writeFloatLE(eqZ, offset + 8);
      
      // Reduce saturation in the stored galaxy colour to match night-vision
      // desaturation logic and avoid photographic color punch.
      const luma = (0.299 * r + 0.587 * g + 0.114 * bl) / 255.0;
      const gray = Math.min(255, Math.max(0, Math.floor(luma * 255)));
      const rOut = Math.min(255, Math.floor(r * 0.4 + gray * 0.6));
      const gOut = Math.min(255, Math.floor(g * 0.4 + gray * 0.6));
      const bOut = Math.min(255, Math.floor(bl * 0.4 + gray * 0.6));
      buffer.writeUInt8(rOut, offset + 12);
      buffer.writeUInt8(gOut, offset + 13);
      buffer.writeUInt8(bOut, offset + 14);
      
      // Size directly tied to luminance with only ±10% random jitter.
      const jitter = 0.9 + Math.random() * 0.2; // uniform [0.9, 1.1]
      const size = Math.min(255, Math.floor(Math.pow(luminance, 0.7) * 255 * jitter));
      buffer.writeUInt8(size, offset + 15);
      
      count++;
      if (count % 10000 === 0) {
        process.stdout.write(`\rGenerated ${count} / ${TARGET_PARTICLES} points...`);
      }
    }
  }

  console.log(`\nFinished generating ${count} points after ${attempts} attempts.`);
  
  fs.writeFileSync(OUT_PATH, buffer.slice(0, count * 16));
  console.log(`Saved to ${OUT_PATH}`);
}

build().catch(console.error);
