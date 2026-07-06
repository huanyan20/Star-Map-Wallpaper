import test from 'node:test';
import assert from 'node:assert/strict';

import { generateBlueNoiseField } from '../src/webgl/blueNoise.js';

test('generateBlueNoiseField produces a bounded, non-uniform texture', () => {
  const size = 32;
  const field = generateBlueNoiseField(size);
  assert.equal(field.length, size * size);

  let min = 1;
  let max = 0;
  let sum = 0;
  let neighborDiffSum = 0;
  let neighborCount = 0;

  for (let i = 0; i < field.length; i++) {
    min = Math.min(min, field[i]);
    max = Math.max(max, field[i]);
    sum += field[i];
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (x + 1 < size) {
        neighborDiffSum += Math.abs(field[i] - field[i + 1]);
        neighborCount += 1;
      }
      if (y + 1 < size) {
        neighborDiffSum += Math.abs(field[i] - field[i + size]);
        neighborCount += 1;
      }
    }
  }

  const avgNeighborDiff = neighborDiffSum / neighborCount;

  assert.ok(min >= 0.0, 'field values should not dip below zero');
  assert.ok(max <= 1.0, 'field values should not exceed one');
  assert.ok(max - min > 0.2, 'field should contain meaningful variation');
  assert.ok(Math.abs(sum / field.length - 0.5) < 0.3, 'field should stay roughly centered');
  assert.ok(avgNeighborDiff > 0.01, 'field should have sufficient adjacent pixel variation for dithering');
});
