const fs = require('fs');
const path = require('path');
const generateBMFont = require('msdf-bmfont-xml');

const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'public', 'assets');
const fontPath = process.env.STAR_LABEL_FONT || 'C:\\Windows\\Fonts\\NotoSansTC-VF.ttf';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseAssignedArray(source, name) {
  const marker = `const ${name} =`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${name}`);
  const arrayStart = source.indexOf('[', start);
  let depth = 0;
  for (let i = arrayStart; i < source.length; i++) {
    const ch = source[i];
    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) {
        return Function(`return ${source.slice(arrayStart, i + 1)}`)();
      }
    }
  }
  throw new Error(`Could not parse ${name}`);
}

function parseAssignedObject(source, name) {
  const marker = `const ${name} =`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${name}`);
  const objectStart = source.indexOf('{', start);
  let depth = 0;
  let inString = false;
  let quote = '';
  let escaped = false;
  for (let i = objectStart; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return Function(`return ${source.slice(objectStart, i + 1)}`)();
      }
    }
  }
  throw new Error(`Could not parse ${name}`);
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

function buildStarsBin() {
  const source = fs.readFileSync(path.join(root, 'src', 'data', 'real_stars.js'), 'utf8');
  const stars = parseAssignedArray(source, 'REAL_STARS');
  const count = stars.length;
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
    const [raDeg, decDeg, mag, bv] = stars[i];
    const ra = (raDeg * Math.PI) / 180;
    const dec = (decDeg * Math.PI) / 180;
    positions[i * 3 + 0] = Math.cos(dec) * Math.cos(ra);
    positions[i * 3 + 1] = Math.cos(dec) * Math.sin(ra);
    positions[i * 3 + 2] = Math.sin(dec);
    magnitudes[i] = mag;
    const rgb = colorForBv(bv);
    colors[i * 3 + 0] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }

  fs.writeFileSync(path.join(assetsDir, 'stars.bin'), buffer);
  console.log(`stars.bin: ${count} stars, ${totalBytes} bytes`);
}

function collectLabelCharset() {
  const starsData = fs.readFileSync(path.join(root, 'src', 'data', 'stars_data.js'), 'utf8');
  const stars = parseAssignedArray(starsData, 'STARS');
  const conNames = parseAssignedObject(starsData, 'CON_NAMES');
  const strings = new Set(['0123456789.-+ °', 'NSEW', '北南東西', '天頂', '黃道 Ecliptic']);

  for (const star of stars) {
    if (star.n) strings.add(star.n);
    if (star.cn) strings.add(star.cn);
  }
  for (const value of Object.values(conNames)) {
    if (value) strings.add(String(value));
  }

  const chars = new Set();
  for (const value of strings) {
    for (const ch of value) chars.add(ch);
  }
  return Array.from(chars).join('');
}

function buildLabels() {
  if (!fs.existsSync(fontPath)) {
    throw new Error(`Font not found: ${fontPath}. Set STAR_LABEL_FONT to a .ttf path.`);
  }

  const charset = collectLabelCharset();
  fs.writeFileSync(path.join(assetsDir, 'labels.charset.txt'), charset, 'utf8');

  return new Promise((resolve, reject) => {
    generateBMFont(
      fontPath,
      {
        outputType: 'json',
        filename: path.join(assetsDir, 'labels'),
        charset,
        fontSize: 48,
        textureSize: [2048, 2048],
        texturePadding: 3,
        border: 1,
        fieldType: 'msdf',
        distanceRange: 4,
        roundDecimal: 0,
        pot: true,
        square: true,
      },
      (error, textures, font) => {
        if (error) {
          reject(error);
          return;
        }
        if (!textures.length) {
          reject(new Error('No label texture generated'));
          return;
        }

        fs.writeFileSync(path.join(assetsDir, 'labels.json'), font.data);
        fs.writeFileSync(path.join(assetsDir, 'labels.png'), textures[0].texture);
        for (const file of fs.readdirSync(assetsDir)) {
          if (/^labels(?:\.\d+)?\.(?:fnt|cfg|png)$/i.test(file) && file !== 'labels.png') {
            fs.rmSync(path.join(assetsDir, file), { force: true });
          }
        }
        console.log(`labels atlas: ${charset.length} glyphs`);
        resolve();
      },
    );
  });
}

async function main() {
  ensureDir(assetsDir);
  buildStarsBin();
  await buildLabels();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
