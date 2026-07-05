import * as THREE from 'three';

const additiveSkyMaterials = [];

export function createAdditiveSkyUniforms(overrides = {}) {
  return {
    eqToHoriz: { value: new THREE.Matrix3() },
    lookAz: { value: 0 },
    lookEl: { value: 0 },
    focalLen: { value: 500 },
    time: { value: 0 },
    starVisibility: { value: 1.0 },
    dpr: { value: 1.0 },
    ...overrides,
  };
}

export function createAdditiveSkyMaterial(options = {}) {
  const uniforms = createAdditiveSkyUniforms(options.uniforms);
  const material = new THREE.ShaderMaterial({
    vertexShader: options.vertexShader || '',
    fragmentShader: options.fragmentShader || '',
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: options.blending || THREE.AdditiveBlending,
    ...options.materialOptions,
  });

  return material;
}

export function registerAdditiveSkyMaterial(material) {
  if (!material || !material.uniforms) return material;
  if (!additiveSkyMaterials.includes(material)) {
    additiveSkyMaterials.push(material);
  }
  return material;
}

export function syncAdditiveSkyMaterials(frameUniforms = {}) {
  for (const material of additiveSkyMaterials) {
    if (!material || !material.uniforms) continue;

    if (material.uniforms.eqToHoriz && frameUniforms.eqToHoriz) {
      material.uniforms.eqToHoriz.value.copy(frameUniforms.eqToHoriz);
    }
    if (material.uniforms.lookAz && typeof frameUniforms.lookAz !== 'undefined') {
      material.uniforms.lookAz.value = frameUniforms.lookAz;
    }
    if (material.uniforms.lookEl && typeof frameUniforms.lookEl !== 'undefined') {
      material.uniforms.lookEl.value = frameUniforms.lookEl;
    }
    if (material.uniforms.focalLen && typeof frameUniforms.focalLen !== 'undefined') {
      material.uniforms.focalLen.value = frameUniforms.focalLen;
    }
    if (material.uniforms.time && typeof frameUniforms.time !== 'undefined') {
      material.uniforms.time.value = frameUniforms.time;
    }
    if (material.uniforms.starVisibility && typeof frameUniforms.starVisibility !== 'undefined') {
      material.uniforms.starVisibility.value = frameUniforms.starVisibility;
    }
    if (material.uniforms.dpr && typeof frameUniforms.dpr !== 'undefined') {
      material.uniforms.dpr.value = frameUniforms.dpr;
    }
  }

  return additiveSkyMaterials;
}

export function clearAdditiveSkyMaterials() {
  additiveSkyMaterials.length = 0;
}

const globalTarget = typeof window !== 'undefined' ? window : globalThis;
globalTarget.createAdditiveSkyUniforms = createAdditiveSkyUniforms;
globalTarget.createAdditiveSkyMaterial = createAdditiveSkyMaterial;
globalTarget.registerAdditiveSkyMaterial = registerAdditiveSkyMaterial;
globalTarget.syncAdditiveSkyMaterials = syncAdditiveSkyMaterials;
globalTarget.clearAdditiveSkyMaterials = clearAdditiveSkyMaterials;
