import * as THREE from 'three';

const additiveSkyMaterials = [];

export function createAdditiveSkyUniforms(overrides = {}) {
  const bl = window.bloomLayers || { brightStar: 1.5, nebula: 1.2, milkyway: 0.8 };
  return {
    eqToHoriz: { value: new THREE.Matrix3() },
    lookAz: { value: 0 },
    lookEl: { value: 0 },
    focalLen: { value: 500 },
    time: { value: 0 },
    starVisibility: { value: 1.0 },
    dpr: { value: 1.0 },
    hFOV: { value: Math.PI / 2.0 },
    currentFov: { value: Math.PI / 2.0 },
    uBloomLayerBrightStar: { value: bl.brightStar },
    uBloomLayerNebula: { value: bl.nebula },
    uBloomLayerMilkyWay: { value: bl.milkyway },
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
    if (material.uniforms.hFOV && typeof frameUniforms.hFOV !== 'undefined') {
      material.uniforms.hFOV.value = frameUniforms.hFOV;
    }
    if (material.uniforms.currentFov && typeof frameUniforms.currentFov !== 'undefined') {
      material.uniforms.currentFov.value = frameUniforms.currentFov;
    }
    
    // Sync layered bloom config if available
    if (window.bloomLayers) {
      if (material.uniforms.uBloomLayerBrightStar) material.uniforms.uBloomLayerBrightStar.value = window.bloomLayers.brightStar;
      if (material.uniforms.uBloomLayerNebula) material.uniforms.uBloomLayerNebula.value = window.bloomLayers.nebula;
      if (material.uniforms.uBloomLayerMilkyWay) material.uniforms.uBloomLayerMilkyWay.value = window.bloomLayers.milkyway;
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
