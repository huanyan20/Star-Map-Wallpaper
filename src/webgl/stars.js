import * as THREE from 'three';
import { setupFieldStars } from './stars/fieldStars.js';
import { setupNamedStars } from './stars/namedStars.js';
import { setupConstellationLines } from './stars/constellationLines.js';
import { registerAdditiveSkyMaterial } from './additiveSkyMaterial.js';
import { state } from '../core/state.js';

async function loadStarCatalog() {
  fetchChunksMeta();
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

window.STAR_CHUNKS = [];
let chunksMetaPromise = null;

export function fetchChunksMeta() {
  if (!chunksMetaPromise) {
    chunksMetaPromise = fetch('assets/chunks_meta.json')
      .then((r) => {
        if (!r.ok) throw new Error('No chunks_meta.json found');
        return r.json();
      })
      .then((meta) => {
        for (const [id, data] of Object.entries(meta)) {
          if (data.lod1Count > 0) {
            window.STAR_CHUNKS.push({
              id: `lod1_${id}`,
              url: `assets/stars_lod1_${id}.bin`,
              loadFov: (120 * Math.PI) / 180,
              maxFov: (60 * Math.PI) / 180,
              center: new THREE.Vector3(...data.center),
              radiusAngle: data.radiusAngle,
              loaded: false,
              promise: null,
              pointsMesh: null,
              lastVisibleTime: performance.now(),
            });
          }
          if (data.lod2Count > 0) {
            window.STAR_CHUNKS.push({
              id: `lod2_${id}`,
              url: `assets/stars_lod2_${id}.bin`,
              loadFov: (60 * Math.PI) / 180,
              maxFov: (30 * Math.PI) / 180,
              center: new THREE.Vector3(...data.center),
              radiusAngle: data.radiusAngle,
              loaded: false,
              promise: null,
              pointsMesh: null,
              lastVisibleTime: performance.now(),
            });
          }
        }
      })
      .catch((e) => console.warn('Spatial chunks not available:', e));
  }
  return chunksMetaPromise;
}

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

  const lookAz = window.starsMaterial.uniforms.lookAz.value;
  const lookEl = window.starsMaterial.uniforms.lookEl.value;
  const lx = Math.sin(lookAz) * Math.cos(lookEl);
  const ly = Math.cos(lookAz) * Math.cos(lookEl);
  const lz = Math.sin(lookEl);
  const lookDirHoriz = new THREE.Vector3(lx, ly, lz);
  
  // Transform look vector from Horizontal to Equatorial to match chunk centers
  const eqToHoriz = window.starsMaterial.uniforms.eqToHoriz.value;
  const horizToEq = eqToHoriz.clone().transpose();
  const lookDirEq = lookDirHoriz.applyMatrix3(horizToEq);

  const aspect = window.innerHeight / window.innerWidth;
  const diagFov = window.hFOV * Math.sqrt(1 + aspect * aspect);
  const cameraRadius = diagFov / 2;
  const nowTime = performance.now();
  const isIdle = (nowTime - state.lastInteractionTime) > 5000;

  for (const chunk of window.STAR_CHUNKS) {
    const triggerFov = chunk.loadFov || chunk.maxFov;
    const fovOk = window.hFOV <= triggerFov;
    
    let visible = false;
    if (fovOk && !isIdle) {
      const dot = lookDirEq.dot(chunk.center);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
      if (angle <= cameraRadius + chunk.radiusAngle) {
        visible = true;
      }
    }

    if (visible) {
      chunk.lastVisibleTime = nowTime;
      if (!chunk.loaded && !chunk.promise) {
        chunk.promise = loadStarChunk(chunk.url)
          .then((geo) => {
            const mat = window.starsMaterial.clone();
            mat.uniforms = THREE.UniformsUtils.clone(window.starsMaterial.uniforms);
            mat.uniforms.chunkMaxFov.value = chunk.maxFov;
            registerAdditiveSkyMaterial(mat);
            chunk.pointsMesh = new THREE.Points(geo, mat);
            chunk.pointsMesh.renderOrder = window.fieldStarsMesh ? window.fieldStarsMesh.renderOrder : 0;
            window.scene.add(chunk.pointsMesh);
            chunk.loaded = true;
          })
          .catch((e) => {
            console.error('Failed to load LOD chunk:', chunk.url, e);
            chunk.promise = null;
          });
      } else if (chunk.loaded && chunk.pointsMesh) {
        chunk.pointsMesh.visible = true;
      }
    } else {
      if (chunk.loaded && chunk.pointsMesh) {
        chunk.pointsMesh.visible = false;
        
        if (nowTime - chunk.lastVisibleTime > 15000) {
          chunk.pointsMesh.geometry.dispose();
          chunk.pointsMesh.material.dispose();
          window.scene.remove(chunk.pointsMesh);
          chunk.pointsMesh = null;
          chunk.loaded = false;
          chunk.promise = null;
        }
      }
    }
  }
};

// End of setupStars

function setupStars(starCatalog) {
  setupFieldStars(starCatalog);
  setupNamedStars();
  setupConstellationLines();
}

window.setupStars = setupStars;
window.loadStarCatalog = loadStarCatalog;

