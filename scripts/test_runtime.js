import test from 'node:test';
import assert from 'node:assert/strict';
import { createSkyRuntime } from '../src/core/runtime.js';

test('runtime: stores values and mirrors them to the host object', () => {
  const host = {};
  const runtime = createSkyRuntime(host);

  runtime.set('scene', { id: 'scene-1' });
  runtime.set('renderer', { id: 'renderer-1' });

  assert.equal(runtime.get('scene').id, 'scene-1');
  assert.equal(runtime.scene.id, 'scene-1');
  assert.equal(host.scene.id, 'scene-1');
  assert.equal(runtime.get('renderer').id, 'renderer-1');
  assert.equal(runtime.has('renderer'), true);
});

test('runtime: can read host properties without explicit registration', () => {
  const host = { camera: { id: 'camera-1' } };
  const runtime = createSkyRuntime(host);

  assert.equal(runtime.get('camera').id, 'camera-1');
  assert.equal(runtime.camera.id, 'camera-1');
});
