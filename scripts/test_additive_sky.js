import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  createAdditiveSkyUniforms,
  createAdditiveSkyMaterial,
  registerAdditiveSkyMaterial,
  syncAdditiveSkyMaterials,
} from '../src/webgl/additiveSkyMaterial.js';

test('createAdditiveSkyUniforms provides the expected defaults', () => {
  const uniforms = createAdditiveSkyUniforms();
  assert.ok(uniforms.eqToHoriz.value instanceof THREE.Matrix3);
  assert.equal(uniforms.starVisibility.value, 1.0);
  assert.equal(uniforms.dpr.value, 1.0);
  assert.equal(uniforms.lookAz.value, 0);
});

test('register and sync additive sky materials through the shared registry', () => {
  const material = createAdditiveSkyMaterial({
    uniforms: {
      starVisibility: { value: 0.25 },
    },
  });

  registerAdditiveSkyMaterial(material);

  const frameUniforms = {
    eqToHoriz: new THREE.Matrix3().set(1, 0, 0, 0, 1, 0, 0, 0, 1),
    lookAz: 0.5,
    lookEl: 0.25,
    focalLen: 600,
    time: 3.5,
    starVisibility: 0.75,
    dpr: 2.0,
  };

  syncAdditiveSkyMaterials(frameUniforms);

  assert.ok(material.uniforms.eqToHoriz.value.equals(frameUniforms.eqToHoriz));
  assert.equal(material.uniforms.lookAz.value, 0.5);
  assert.equal(material.uniforms.lookEl.value, 0.25);
  assert.equal(material.uniforms.focalLen.value, 600);
  assert.equal(material.uniforms.time.value, 3.5);
  assert.equal(material.uniforms.starVisibility.value, 0.75);
  assert.equal(material.uniforms.dpr.value, 2.0);
});
