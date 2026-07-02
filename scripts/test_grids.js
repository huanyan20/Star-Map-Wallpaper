import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

// --- Mock Environment for grids.js ---
global.window = {
  innerWidth: 1920,
  innerHeight: 1080,
  scene: { add: () => {} },
  createGridMaterial: () => new THREE.Material(),
  devicePixelRatio: 1
};

test('grids: setupEquatorialGrid', async () => {
  await import('../src/webgl/grids.js');
  window.setupGrids(); // This will populate window.eqGridMesh, window.eclipticMesh, window.altAzGridMesh
  
  assert.ok(window.eqGridMesh, 'eqGridMesh should be created');
  assert.ok(window.eclipticMesh, 'eclipticMesh should be created');
  assert.ok(window.altAzGridMesh, 'altAzGridMesh should be created');

  const eqGeo = window.eqGridMesh.geometry;
  const positions = eqGeo.attributes.position.array;
  assert.ok(positions.length > 0, 'Equatorial grid should have vertices');
  assert.equal(positions.length % 3, 0, 'Vertices length should be multiple of 3');

  const ecGeo = window.eclipticMesh.geometry;
  assert.ok(ecGeo.attributes.position.array.length > 0, 'Ecliptic grid should have vertices');

  const altAzGeo = window.altAzGridMesh.geometry;
  assert.ok(altAzGeo.attributes.position.array.length > 0, 'AltAz grid should have vertices');
});
