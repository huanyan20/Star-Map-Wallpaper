import * as THREE from 'three';
import { LabelLayer } from './grids.js';
async function loadLabelFont() {
  if (window.labelFontPromise) return window.labelFontPromise;
  window.labelFontPromise = Promise.all([
    fetch('assets/labels.json').then((resp) => {
      if (!resp.ok) throw new Error(`Failed to load assets/labels.json: ${resp.status}`);
      return resp.json();
    }),
    new Promise((resolve, reject) => {
      new THREE.TextureLoader().load('assets/labels.png', resolve, undefined, reject);
    }),
  ]).then(([font, texture]) => {
    texture.flipY = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return { font, texture };
  });
  return window.labelFontPromise;
}

function setupLabelLayer(labelFont) {
  window.labelLayer = new LabelLayer(labelFont.font, labelFont.texture);
}

window.setupLabelLayer = setupLabelLayer;
window.loadLabelFont = loadLabelFont;

