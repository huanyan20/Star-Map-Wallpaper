const fs = require('fs');
const { Jimp } = require('jimp');

const IMAGE_PATH = 'public/assets/milkyway.png';
const OUT_PATH = 'public/assets/mw_particles.bin';

const TARGET_PARTICLES = 300000; // 300k points for a lush milky way
const MAX_ATTEMPTS = 50000000;

// J2000 Equatorial to Galactic matrix
// J2000 NGP: RA=192.85948, Dec=27.12825
const eqToGalMat = [
  [-0.054876, -0.873437, -0.483835],
  [0.494109, -0.444830,  0.746982],
  [-0.867666, -0.198076,  0.455984]
];

function eqToGal(x, y, z) {
  return [
    x * eqToGalMat[0][0] + y * eqToGalMat[0][1] + z * eqToGalMat[0][2],
    x * eqToGalMat[1][0] + y * eqToGalMat[1][1] + z * eqToGalMat[1][2],
    x * eqToGalMat[2][0] + y * eqToGalMat[2][1] + z * eqToGalMat[2][2]
  ];
}

async function build() {
  console.log('Loading milkyway.png...');
  const image = await Jimp.read(IMAGE_PATH);
  const width = image.bitmap.width;
  const height = image.bitmap.height;

  console.log(`Image loaded: ${width}x${height}`);
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

    // Use luminance as probability
    const luminance = (0.299 * r + 0.587 * g + 0.114 * bl) / 255.0;
    
    // Non-linear probability to boost contrast (make the core dense and edges sparse)
    const prob = Math.pow(luminance, 1.5);

    if (Math.random() < prob) {
      // Accept point
      const offset = count * 16;
      buffer.writeFloatLE(eqX, offset);
      buffer.writeFloatLE(eqY, offset + 4);
      buffer.writeFloatLE(eqZ, offset + 8);
      
      // slightly randomize color based on the texture
      buffer.writeUInt8(r, offset + 12);
      buffer.writeUInt8(g, offset + 13);
      buffer.writeUInt8(bl, offset + 14);
      
      // Random size variation based on intensity
      const size = Math.floor(Math.random() * 255 * (0.5 + 0.5 * luminance));
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
