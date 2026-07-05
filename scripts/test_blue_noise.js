import test from 'node:test';
import assert from 'node:assert/strict';

import { generateBlueNoiseField } from '../src/webgl/blueNoise.js';

test('generateBlueNoiseField produces a bounded, non-uniform texture', () => {
  const field = generateBlueNoiseField(32, 0.42);
  assert.equal(field.length, 32 * 32);

  let min = 1;
  let max = 0;
  let sum = 0;
  for (let i = 0; i < field.length; i++) {
    min = Math.min(min, field[i]);
    max = Math.max(max, field[i]);
    sum += field[i];
  }

  assert.ok(min >= 0.0, 'field values should not dip below zero');
  assert.ok(max <= 1.0, 'field values should not exceed one');
  assert.ok(max - min > 0.2, 'field should contain meaningful variation');
  assert.ok(Math.abs(sum / field.length - 0.5) < 0.3, 'field should stay roughly centered');
});
