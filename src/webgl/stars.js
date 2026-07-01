import * as THREE from 'three';
async function loadStarCatalog() {
  if (window.starCatalogPromise) return window.starCatalogPromise;
  window.starCatalogPromise = fetch('assets/stars.bin')
    .then((resp) => {
      if (!resp.ok) throw new Error(`Failed to load assets/stars.bin: ${resp.status}`);
      return resp.arrayBuffer();
    })
    .then((buffer) => {
      const header = new DataView(buffer, 0, 32);
      const magic =
        String.fromCharCode(header.getUint8(0)) +
        String.fromCharCode(header.getUint8(1)) +
        String.fromCharCode(header.getUint8(2)) +
        String.fromCharCode(header.getUint8(3));
      if (magic !== 'STRB') throw new Error('Invalid stars.bin magic');
      const version = header.getUint32(4, true);
      if (version !== 1) throw new Error(`Unsupported stars.bin version ${version}`);
      const count = header.getUint32(8, true);
      const positionsOffset = header.getUint32(12, true);
      const magOffset = header.getUint32(16, true);
      const colorOffset = header.getUint32(20, true);
      return {
        count,
        positions: new Float32Array(buffer, positionsOffset, count * 3),
        magnitudes: new Float32Array(buffer, magOffset, count),
        colors: new Uint8Array(buffer, colorOffset, count * 3),
      };
    });
  return window.starCatalogPromise;
}

window.STAR_CHUNKS = [
  // ?�入 loadFov ?�早觸發網路下�?，避?�縮?��?快�??��??�步下�?延遲?��??�「�?塊瞬?��???(Pop-in)??
  {
    url: 'assets/stars_chunk_1.bin',
    loadFov: (120 * Math.PI) / 180,
    maxFov: (60 * Math.PI) / 180,
    loaded: false,
    promise: null,
    pointsMesh: null,
  },
  {
    url: 'assets/stars_chunk_2.bin',
    loadFov: (60 * Math.PI) / 180,
    maxFov: (30 * Math.PI) / 180,
    loaded: false,
    promise: null,
    pointsMesh: null,
  },
];

async function loadStarChunk(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load ${url}: ${resp.status}`);
  const buffer = await resp.arrayBuffer();
  const header = new DataView(buffer, 0, 32);
  const magic =
    String.fromCharCode(header.getUint8(0)) +
    String.fromCharCode(header.getUint8(1)) +
    String.fromCharCode(header.getUint8(2)) +
    String.fromCharCode(header.getUint8(3));
  if (magic !== 'STRB') throw new Error(`Invalid magic in ${url}`);
  const count = header.getUint32(8, true);
  const positionsOffset = header.getUint32(12, true);
  const magOffset = header.getUint32(16, true);
  const colorOffset = header.getUint32(20, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(buffer, positionsOffset, count * 3), 3),
  );
  geo.setAttribute(
    'starMag',
    new THREE.BufferAttribute(new Float32Array(buffer, magOffset, count), 1),
  );
  geo.setAttribute(
    'starColor',
    new THREE.BufferAttribute(new Uint8Array(buffer, colorOffset, count * 3), 3, true),
  );
  return geo;
}

window.updateStarLOD = function (hFOV) {
  if (!window.scene || !window.starsMaterial) return;

  const mats = [window.starsMaterial];
  for (const chunk of window.STAR_CHUNKS) {
    if (chunk.loaded && chunk.pointsMesh && chunk.pointsMesh.material) {
      mats.push(chunk.pointsMesh.material);
    }
  }
  for (const mat of mats) {
    if (mat.uniforms.currentFov) mat.uniforms.currentFov.value = window.hFOV;
  }

  for (const chunk of window.STAR_CHUNKS) {
    // 使用 loadFov 來進�??�早?�景載入，確保使?�者縮?�到 maxFov ?��?Mesh 已�??�場?�中待命
    // Shader ?�自?��?證�???maxFov 之�?完全?��?，�?此�??��???Scene 絕�?安全
    const triggerFov = chunk.loadFov || chunk.maxFov;
    if (window.hFOV <= triggerFov) {
      if (!chunk.loaded && !chunk.promise) {
        // Not loaded, fetch it
        chunk.promise = loadStarChunk(chunk.url)
          .then((geo) => {
            const mat = window.starsMaterial.clone();
            mat.uniforms = THREE.UniformsUtils.clone(window.starsMaterial.uniforms);
            mat.uniforms.chunkMaxFov.value = chunk.maxFov;
            chunk.pointsMesh = new THREE.Points(geo, mat);
            chunk.pointsMesh.renderOrder = window.fieldStarsMesh ? window.fieldStarsMesh.renderOrder : 0;
            window.scene.add(chunk.pointsMesh);
            chunk.loaded = true;
          })
          .catch((e) => {
            console.error('Failed to load LOD chunk:', chunk.url, e);
            chunk.promise = null; // retry possible
          });
      } else if (chunk.loaded && chunk.pointsMesh) {
        chunk.pointsMesh.visible = true;
      }
    } else {
      if (chunk.loaded && chunk.pointsMesh) {
        chunk.pointsMesh.visible = false;
      }
    }
  }
};

function setupStars(starCatalog) {
  if (starCatalog && starCatalog.count > 0) {
    window.fieldStarsGeo = new THREE.BufferGeometry();
    window.fieldStarsGeo.setAttribute('position', new THREE.BufferAttribute(starCatalog.positions, 3));
    window.fieldStarsGeo.setAttribute('starColor', new THREE.BufferAttribute(starCatalog.colors, 3, true));
    window.fieldStarsGeo.setAttribute('starMag', new THREE.BufferAttribute(starCatalog.magnitudes, 1));

    window.fieldStarsMesh = new THREE.Points(window.fieldStarsGeo, window.starsMaterial);
    window.scene.add(window.fieldStarsMesh);
  } else if (typeof REAL_STARS !== 'undefined') {
    // Fallback to JS array REAL_STARS
    const tempPositions = [];
    const tempColors = [];
    const tempMags = [];
    const colors = [
      [192 / 255, 216 / 255, 1.0],
      [1.0, 184 / 255, 112 / 255],
      [1.0, 232 / 255, 144 / 255],
      [216 / 255, 232 / 255, 1.0],
    ];

    for (let i = 0; i < REAL_STARS.length; i++) {
      const star = REAL_STARS[i];
      const mag = star[2];

      // Only move dim stars to GPU to avoid duplicating bright stars which are handled in window.namedStarsMesh
      if (mag <= 3.0) continue;

      const ra_rad = (star[0] * Math.PI) / 180;
      const dec_rad = (star[1] * Math.PI) / 180;
      const bv = star[3];

      tempPositions.push(
        Math.cos(dec_rad) * Math.cos(ra_rad),
        Math.cos(dec_rad) * Math.sin(ra_rad),
        Math.sin(dec_rad),
      );

      tempMags.push(mag);

      let cIdx = 3; // default white-blue
      if (bv < 0.0)
        cIdx = 0; // Blue
      else if (bv > 1.4)
        cIdx = 1; // Orange/Red
      else if (bv > 0.6) cIdx = 2; // Yellow

      const c = colors[cIdx];
      tempColors.push(c[0], c[1], c[2]);
    }

    window.fieldStarsGeo = new THREE.BufferGeometry();
    window.fieldStarsGeo.setAttribute('position', new THREE.Float32BufferAttribute(tempPositions, 3));
    window.fieldStarsGeo.setAttribute('starColor', new THREE.Float32BufferAttribute(tempColors, 3));
    window.fieldStarsGeo.setAttribute('starMag', new THREE.Float32BufferAttribute(tempMags, 1));

    window.fieldStarsMesh = new THREE.Points(window.fieldStarsGeo, window.starsMaterial);
    window.scene.add(window.fieldStarsMesh);
  }

  if (typeof STARS !== 'undefined') {
    const numNamed = STARS.length;
    const positions = new Float32Array(numNamed * 3);
    const colors = new Float32Array(numNamed * 3);
    const mags = new Float32Array(numNamed);

    for (let i = 0; i < numNamed; i++) {
      const star = STARS[i];
      const ra_rad = (star.ra * 15 * Math.PI) / 180;
      const dec_rad = (star.dec * Math.PI) / 180;
      const mag = star.mag;

      positions[i * 3 + 0] = Math.cos(dec_rad) * Math.cos(ra_rad);
      positions[i * 3 + 1] = Math.cos(dec_rad) * Math.sin(ra_rad);
      positions[i * 3 + 2] = Math.sin(dec_rad);

      // True magnitude, no artificial boost
      mags[i] = mag;

      let r = 1.0,
        g = 0.95,
        b = 0.7; // Default to G type
      const sp = star.sp ? star.sp.charAt(0) : 'G';
      if (sp === 'O' || sp === 'B') {
        r = 0.5;
        g = 0.7;
        b = 1.0;
      } else if (sp === 'A') {
        r = 0.8;
        g = 0.85;
        b = 1.0;
      } else if (sp === 'F') {
        r = 1.0;
        g = 1.0;
        b = 0.8;
      } else if (sp === 'G') {
        r = 1.0;
        g = 0.95;
        b = 0.7;
      } else if (sp === 'K') {
        r = 1.0;
        g = 0.75;
        b = 0.4;
      } else if (sp === 'M') {
        r = 1.0;
        g = 0.5;
        b = 0.3;
      }

      colors[i * 3 + 0] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    window.namedStarsGeo = new THREE.BufferGeometry();
    window.namedStarsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    window.namedStarsGeo.setAttribute('starColor', new THREE.BufferAttribute(colors, 3));
    window.namedStarsGeo.setAttribute('starMag', new THREE.BufferAttribute(mags, 1));

    window.namedStarsMesh = new THREE.Points(window.namedStarsGeo, window.starsMaterial);
    window.scene.add(window.namedStarsMesh);
  }

  if (typeof CONSTELLATION_SEGMENTS !== 'undefined') {
    const numLines = CONSTELLATION_SEGMENTS.length;
    const linePositions = new Float32Array(numLines * 6 * 3); // 6 vertices per quad (2 triangles)
    const lineMidPositions = new Float32Array(numLines * 6 * 3);
    const lineUVs = new Float32Array(numLines * 6 * 2);

    for (let i = 0; i < numLines; i++) {
      const seg = CONSTELLATION_SEGMENTS[i];
      const ra1 = (seg[0] * Math.PI) / 180;
      const dec1 = (seg[1] * Math.PI) / 180;
      const ra2 = (seg[2] * Math.PI) / 180;
      const dec2 = (seg[3] * Math.PI) / 180;

      const A = new THREE.Vector3(
        Math.cos(dec1) * Math.cos(ra1),
        Math.cos(dec1) * Math.sin(ra1),
        Math.sin(dec1),
      );
      const B = new THREE.Vector3(
        Math.cos(dec2) * Math.cos(ra2),
        Math.cos(dec2) * Math.sin(ra2),
        Math.sin(dec2),
      );

      const mid = new THREE.Vector3().addVectors(A, B).normalize();
      const dir = new THREE.Vector3().subVectors(B, A).normalize();
      const widthDir = new THREE.Vector3().crossVectors(dir, mid).normalize();

      // Increase geometry width significantly to prevent geometry clipping when zooming out
      const w = 0.02;

      const v0 = new THREE.Vector3().copy(A).addScaledVector(widthDir, w);
      const v1 = new THREE.Vector3().copy(A).addScaledVector(widthDir, -w);
      const v2 = new THREE.Vector3().copy(B).addScaledVector(widthDir, w);
      const v3 = new THREE.Vector3().copy(B).addScaledVector(widthDir, -w);

      // Triangle 1: v0, v1, v2
      linePositions[i * 18 + 0] = v0.x;
      linePositions[i * 18 + 1] = v0.y;
      linePositions[i * 18 + 2] = v0.z;
      linePositions[i * 18 + 3] = v1.x;
      linePositions[i * 18 + 4] = v1.y;
      linePositions[i * 18 + 5] = v1.z;
      linePositions[i * 18 + 6] = v2.x;
      linePositions[i * 18 + 7] = v2.y;
      linePositions[i * 18 + 8] = v2.z;

      lineUVs[i * 12 + 0] = 0;
      lineUVs[i * 12 + 1] = 1;
      lineUVs[i * 12 + 2] = 0;
      lineUVs[i * 12 + 3] = -1;
      lineUVs[i * 12 + 4] = 1;
      lineUVs[i * 12 + 5] = 1;

      // Triangle 2: v2, v1, v3
      linePositions[i * 18 + 9] = v2.x;
      linePositions[i * 18 + 10] = v2.y;
      linePositions[i * 18 + 11] = v2.z;
      linePositions[i * 18 + 12] = v1.x;
      linePositions[i * 18 + 13] = v1.y;
      linePositions[i * 18 + 14] = v1.z;
      linePositions[i * 18 + 15] = v3.x;
      linePositions[i * 18 + 16] = v3.y;
      linePositions[i * 18 + 17] = v3.z;

      lineUVs[i * 12 + 6] = 1;
      lineUVs[i * 12 + 7] = 1;
      lineUVs[i * 12 + 8] = 0;
      lineUVs[i * 12 + 9] = -1;
      lineUVs[i * 12 + 10] = 1;
      lineUVs[i * 12 + 11] = -1;

      for (let vIdx = 0; vIdx < 6; vIdx++) {
        lineMidPositions[(i * 6 + vIdx) * 3 + 0] = mid.x;
        lineMidPositions[(i * 6 + vIdx) * 3 + 1] = mid.y;
        lineMidPositions[(i * 6 + vIdx) * 3 + 2] = mid.z;
      }
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('midPos', new THREE.BufferAttribute(lineMidPositions, 3));
    lineGeo.setAttribute('uv2', new THREE.BufferAttribute(lineUVs, 2));
    window.constellationLinesMaterial = window.createSpindleMaterial('#a0c8ff', 1.0);
    window.constellationLineMesh = new THREE.Mesh(lineGeo, window.constellationLinesMaterial);
    window.scene.add(window.constellationLineMesh);
  }
}

window.setupStars = setupStars;
window.loadStarCatalog = loadStarCatalog;

