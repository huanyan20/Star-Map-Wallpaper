const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const readline = require('readline');
const hp = require('healpixjs');

const nside = 2; // HEALPix nside=2 => 48 chunks
const healpix = new hp.Healpix(nside);

const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'public', 'assets');
const tempDir = path.join(root, 'temp');
const tycho2BaseUrl = 'https://cdsarc.cds.unistra.fr/ftp/I/259/';
const numParts = 20;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) {
      console.log(`Using cached file: ${dest}`);
      resolve();
      return;
    }
    console.log(`Downloading ${url}...`);
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          fs.unlink(dest, () => {}); // Delete temp file
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('Download complete.');
          resolve();
        });
      })
      .on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

function kelvinToRGB(kelvin) {
  let temp = kelvin / 100;
  let r, g, b;

  if (temp <= 66) {
    r = 255;
    g = temp;
    g = 99.4708025861 * Math.log(g) - 161.1195681661;
    if (temp <= 19) {
      b = 0;
    } else {
      b = temp - 10;
      b = 138.5177312231 * Math.log(b) - 305.0447927307;
    }
  } else {
    r = temp - 60;
    r = 329.698727446 * Math.pow(r, -0.1332047592);
    g = temp - 60;
    g = 288.1221695283 * Math.pow(g, -0.0755148492);
    b = 255;
  }

  return [
    Math.max(0, Math.min(255, r)),
    Math.max(0, Math.min(255, g)),
    Math.max(0, Math.min(255, b)),
  ];
}

function colorForBv(bv) {
  const t = 4600 * (1.0 / (0.92 * bv + 1.7) + 1.0 / (0.92 * bv + 0.62));
  const clampedT = Math.max(2000, Math.min(40000, t));
  return kelvinToRGB(clampedT);
}

function getHealpixChunk(x, y, z) {
  const vec = new hp.Vec3(x, y, z);
  const pt = new hp.Pointing(vec);
  return healpix.ang2pix(pt).toString();
}

async function processTycho2(chunks) {
  console.log('Parsing Tycho-2 dataset parts...');
  let totalProcessed = 0;
  let skipped = 0;

  for (let i = 0; i < numParts; i++) {
    const partStr = i.toString().padStart(2, '0');
    const filename = `tyc2.dat.${partStr}.gz`;
    const localPath = path.join(tempDir, filename);

    console.log(`Processing ${filename}...`);

    const fileStream = fs.createReadStream(localPath);
    const rl = readline.createInterface({
      input: fileStream.pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (line.length < 130) continue;

      const raStr = line.substring(15, 27).trim();
      const decStr = line.substring(28, 40).trim();
      const btStr = line.substring(110, 115).trim();
      const vtStr = line.substring(123, 128).trim();

      if (!raStr || !decStr || !vtStr) {
        skipped++;
        continue;
      }

      const raDeg = parseFloat(raStr);
      const decDeg = parseFloat(decStr);
      const vt = parseFloat(vtStr);
      const bt = btStr ? parseFloat(btStr) : vt;

      if (vt <= 6.5) {
        skipped++;
        continue;
      }

      const ra = (raDeg * Math.PI) / 180;
      const dec = (decDeg * Math.PI) / 180;
      const px = Math.cos(dec) * Math.cos(ra);
      const py = Math.cos(dec) * Math.sin(ra);
      const pz = Math.sin(dec);

      const bv = bt - vt;
      const rgb = colorForBv(bv);

      const star = { px, py, pz, mag: vt, r: rgb[0], g: rgb[1], b: rgb[2] };
      const chunkId = getHealpixChunk(px, py, pz);

      if (!chunks[chunkId]) {
        chunks[chunkId] = { lod1: [], lod2: [] };
      }

      if (vt <= 9.5) {
        chunks[chunkId].lod1.push(star);
      } else {
        chunks[chunkId].lod2.push(star);
      }

      totalProcessed++;
      if (totalProcessed % 250000 === 0) {
        console.log(`Processed ${totalProcessed} stars...`);
      }
    }
  }

  console.log(`Parsing complete. Total: ${totalProcessed}. Skipped: ${skipped}.`);
}

function writeBinary(filename, starsArray) {
  if (starsArray.length === 0) return;
  const count = starsArray.length;
  const headerBytes = 32;
  const positionsOffset = headerBytes;
  const magOffset = positionsOffset + count * 3 * 4;
  const colorOffset = magOffset + count * 4;
  const totalBytes = colorOffset + count * 3;
  const buffer = Buffer.alloc(totalBytes);

  buffer.write('STRB', 0, 4, 'ascii');
  buffer.writeUInt32LE(1, 4);
  buffer.writeUInt32LE(count, 8);
  buffer.writeUInt32LE(positionsOffset, 12);
  buffer.writeUInt32LE(magOffset, 16);
  buffer.writeUInt32LE(colorOffset, 20);
  buffer.writeUInt32LE(0, 24);
  buffer.writeUInt32LE(0, 28);

  const positions = new Float32Array(buffer.buffer, buffer.byteOffset + positionsOffset, count * 3);
  const magnitudes = new Float32Array(buffer.buffer, buffer.byteOffset + magOffset, count);
  const colors = new Uint8Array(buffer.buffer, buffer.byteOffset + colorOffset, count * 3);

  for (let i = 0; i < count; i++) {
    const s = starsArray[i];
    positions[i * 3 + 0] = s.px;
    positions[i * 3 + 1] = s.py;
    positions[i * 3 + 2] = s.pz;
    magnitudes[i] = s.mag;
    colors[i * 3 + 0] = s.r;
    colors[i * 3 + 1] = s.g;
    colors[i * 3 + 2] = s.b;
  }

  const outPath = path.join(assetsDir, filename);
  fs.writeFileSync(outPath, buffer);
}

function computeBoundingSphere(starsLOD1, starsLOD2) {
  const allStars = starsLOD1.concat(starsLOD2);
  if (allStars.length === 0) return { center: [1, 0, 0], radiusAngle: 0 };
  
  let cx = 0, cy = 0, cz = 0;
  for (const s of allStars) {
    cx += s.px; cy += s.py; cz += s.pz;
  }
  const len = Math.hypot(cx, cy, cz);
  cx /= len; cy /= len; cz /= len;

  let maxAngle = 0;
  for (const s of allStars) {
    const dot = cx * s.px + cy * s.py + cz * s.pz;
    const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (angle > maxAngle) maxAngle = angle;
  }
  // Add 0.05 radians (~2.8 degrees) padding
  return { center: [cx, cy, cz], radiusAngle: maxAngle + 0.05 };
}

async function main() {
  ensureDir(tempDir);
  ensureDir(assetsDir);

  try {
    for (let i = 0; i < numParts; i++) {
      const partStr = i.toString().padStart(2, '0');
      const filename = `tyc2.dat.${partStr}.gz`;
      const url = tycho2BaseUrl + filename;
      const localPath = path.join(tempDir, filename);
      await downloadFile(url, localPath);
    }

    const chunks = {};
    await processTycho2(chunks);

    const meta = {};
    let totalFiles = 0;
    
    for (const [id, c] of Object.entries(chunks)) {
      if (c.lod1.length > 0) {
        writeBinary(`stars_lod1_${id}.bin`, c.lod1);
        totalFiles++;
      }
      if (c.lod2.length > 0) {
        writeBinary(`stars_lod2_${id}.bin`, c.lod2);
        totalFiles++;
      }
      
      const sphere = computeBoundingSphere(c.lod1, c.lod2);
      meta[id] = {
        center: sphere.center,
        radiusAngle: sphere.radiusAngle,
        lod1Count: c.lod1.length,
        lod2Count: c.lod2.length
      };
    }

    fs.writeFileSync(path.join(assetsDir, 'chunks_meta.json'), JSON.stringify(meta, null, 2));
    console.log(`All done! Wrote ${totalFiles} chunk files and chunks_meta.json.`);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
