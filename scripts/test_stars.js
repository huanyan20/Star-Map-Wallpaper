import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// --- Mock Environment for stars.js ---
global.window = {
  innerWidth: 1920,
  innerHeight: 1080,
  scene: { add: () => {} },
  devicePixelRatio: 1,
  starCatalogPromise: null
};

global.fetch = async (url) => {
  if (url === 'assets/stars.bin') {
    // Create mock ArrayBuffer for STRB
    const count = 2;
    const headerSize = 32;
    const posSize = count * 3 * 4; // float32
    const magSize = count * 4;     // float32
    const colorSize = count * 3;   // uint8
    const totalSize = headerSize + posSize + magSize + colorSize;
    
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    
    // Magic: STRB
    view.setUint8(0, 'S'.charCodeAt(0));
    view.setUint8(1, 'T'.charCodeAt(0));
    view.setUint8(2, 'R'.charCodeAt(0));
    view.setUint8(3, 'B'.charCodeAt(0));
    
    // Version: 1
    view.setUint32(4, 1, true);
    
    // Count: 2
    view.setUint32(8, count, true);
    
    // Offsets
    view.setUint32(12, headerSize, true); // pos offset
    view.setUint32(16, headerSize + posSize, true); // mag offset
    view.setUint32(20, headerSize + posSize + magSize, true); // color offset
    
    // Write some dummy positions
    const posView = new Float32Array(buffer, headerSize, count * 3);
    posView[0] = 1.0; posView[1] = 0.0; posView[2] = 0.0;
    
    return {
      ok: true,
      arrayBuffer: async () => buffer
    };
  }
  return { ok: false, status: 404 };
};

test('stars: loadStarCatalog parsing', async () => {
  await import('../src/webgl/stars.js');
  
  const catalog = await window.loadStarCatalog();
  assert.equal(catalog.count, 2, 'Should parse count correctly');
  assert.equal(catalog.positions.length, 6, 'Positions array length should be count * 3');
  assert.equal(catalog.magnitudes.length, 2, 'Magnitudes array length should be count');
  assert.equal(catalog.colors.length, 6, 'Colors array length should be count * 3');
  assert.equal(catalog.positions[0], 1.0, 'Should read float32 positions correctly');
});
