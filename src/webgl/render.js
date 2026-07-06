import * as THREE from 'three';
import { LAT_RAD } from '../vendor/astronomy_engine.js';
import { syncAdditiveSkyMaterials } from './additiveSkyMaterial.js';

function updateSkyOceanUniforms(topRGB, midRGB, horRGB, hy, ts, atmosphereEnabled) {
  if (window.skyMaterial && topRGB && midRGB && horRGB) {
    window.skyMaterial.uniforms.topRGB.value.set(topRGB[0] / 255, topRGB[1] / 255, topRGB[2] / 255);
    window.skyMaterial.uniforms.midRGB.value.set(midRGB[0] / 255, midRGB[1] / 255, midRGB[2] / 255);
    window.skyMaterial.uniforms.horRGB.value.set(horRGB[0] / 255, horRGB[1] / 255, horRGB[2] / 255);
    window.skyMaterial.uniforms.hy.value = hy;
    window.skyMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    window.skyMaterial.uniforms.time.value = ts / 1000.0;
    window.skyMaterial.uniforms.lookAz.value = window.lookAz;
    window.skyMaterial.uniforms.lookEl.value = window.lookEl;
    window.skyMaterial.uniforms.focalLen.value = window.focalLen();
    if (window.skyMaterial.uniforms.dpr) {
      window.skyMaterial.uniforms.dpr.value = window.RENDER_DPR || Math.min(window.devicePixelRatio || 1.0, 1.5);
    }
  }
}

function updateSunMoonUniforms(sunEqPos, moonEqPos, m, ts, atmosphereEnabled) {
  let currentLightDir = new THREE.Vector3(0, 0, 1);
  let currentLightIntensity = 0.0;
  let lightColor = new THREE.Vector3(0.8, 0.9, 1.0);
  let physicalSunPos = new THREE.Vector3(0, 0, -1);

  if (sunEqPos) {
    const sunPos = new THREE.Vector3(
      sunEqPos.x,
      sunEqPos.y,
      sunEqPos.z
    );
    const celestialPos = sunPos.clone();
    
    sunPos.applyMatrix3(m);
    physicalSunPos.copy(sunPos).normalize();
    
    if (atmosphereEnabled && sunPos.z > -0.05) {
      currentLightDir = sunPos.normalize();
      currentLightIntensity = Math.min(1.0, (sunPos.z + 0.05) * 20.0);
      lightColor.set(1.0, 0.9, 0.8);
    }

    if (window.sunMesh) {
      window.sunMaterial.uniforms.celestialPos.value.copy(celestialPos);
      window.sunMaterial.uniforms.eqToHoriz.value.copy(m);
      window.sunMaterial.uniforms.lookAz.value = window.lookAz;
      window.sunMaterial.uniforms.lookEl.value = window.lookEl;
      window.sunMaterial.uniforms.focalLen.value = window.focalLen();
      window.sunMaterial.uniforms.time.value = ts / 1000.0;
      
      if (!window.sunMaterial.uniforms.atmosphereBlend) {
          window.sunMaterial.uniforms.atmosphereBlend = { value: 1.0 };
      }
      if (window.skyMaterial && typeof window.skyMaterial.uniforms.atmosphereBlend !== 'undefined') {
          window.sunMaterial.uniforms.atmosphereBlend.value = window.skyMaterial.uniforms.atmosphereBlend.value;
      } else {
          window.sunMaterial.uniforms.atmosphereBlend.value = atmosphereEnabled ? 1.0 : 0.0;
      }
    }
  }

  if (currentLightIntensity < 0.5 && moonEqPos) {
    const moonPos = new THREE.Vector3(
      moonEqPos.x,
      moonEqPos.y,
      moonEqPos.z
    );
    const celestialPos = moonPos.clone();
    moonPos.applyMatrix3(m);
    
    if (moonPos.z > 0.0) {
      const moonInt = Math.min(1.0, moonPos.z * 10.0) * 0.8;
      if (moonInt > currentLightIntensity) {
        currentLightDir = moonPos.normalize();
        currentLightIntensity = moonInt;
        lightColor.set(0.8, 0.9, 1.0);
      }
    }

    if (window.moonMesh) {
      window.moonMaterial.uniforms.celestialPos.value.copy(celestialPos);
      if (sunEqPos) {
        window.moonMaterial.uniforms.sunPos.value.set(
          sunEqPos.x,
          sunEqPos.y,
          sunEqPos.z
        );
      }
      window.moonMaterial.uniforms.eqToHoriz.value.copy(m);
      window.moonMaterial.uniforms.lookAz.value = window.lookAz;
      window.moonMaterial.uniforms.lookEl.value = window.lookEl;
      window.moonMaterial.uniforms.focalLen.value = window.focalLen();
    }
  }

  return { currentLightDir, currentLightIntensity, lightColor, physicalSunPos };
}

function updateLightUniformsForSkyOcean(topRGB, midRGB, horRGB, ts, lights) {
  const { currentLightDir, currentLightIntensity, lightColor, physicalSunPos } = lights;

  if (window.oceanMaterial && horRGB) {
    if (topRGB && midRGB) {
      window.oceanMaterial.uniforms.topRGB.value.set(
        topRGB[0] / 255,
        topRGB[1] / 255,
        topRGB[2] / 255,
      );
      window.oceanMaterial.uniforms.midRGB.value.set(
        midRGB[0] / 255,
        midRGB[1] / 255,
        midRGB[2] / 255,
      );
    }
    window.oceanMaterial.uniforms.horRGB.value.set(
      horRGB[0] / 255,
      horRGB[1] / 255,
      horRGB[2] / 255,
    );
    window.oceanMaterial.uniforms.time.value = ts / 1000.0;
    window.oceanMaterial.uniforms.lookAz.value = window.lookAz;
    window.oceanMaterial.uniforms.lookEl.value = window.lookEl;
    window.oceanMaterial.uniforms.focalLen.value = window.focalLen();

    if (!window.oceanMaterial.uniforms.lightDir) {
      window.oceanMaterial.uniforms.lightDir = { value: new THREE.Vector3(0, 0, 1) };
      window.oceanMaterial.uniforms.lightIntensity = { value: 0.0 };
      window.oceanMaterial.uniforms.lightColor = { value: new THREE.Vector3(0.8, 0.9, 1.0) };
    }
    window.oceanMaterial.uniforms.lightDir.value.copy(currentLightDir);
    window.oceanMaterial.uniforms.lightIntensity.value = currentLightIntensity;
    window.oceanMaterial.uniforms.lightColor.value.copy(lightColor);
  }

  if (window.skyMaterial) {
    if (!window.skyMaterial.uniforms.lightDir) {
      window.skyMaterial.uniforms.lightDir = { value: new THREE.Vector3(0, 0, 1) };
      window.skyMaterial.uniforms.lightIntensity = { value: 0.0 };
      window.skyMaterial.uniforms.sunPosition = { value: new THREE.Vector3(0, 0, -1) };
    }
    window.skyMaterial.uniforms.lightDir.value.copy(currentLightDir);
    window.skyMaterial.uniforms.lightIntensity.value = currentLightIntensity;
    if (window.skyMaterial.uniforms.sunPosition) {
      window.skyMaterial.uniforms.sunPosition.value.copy(physicalSunPos);
    }
  }
}

function updateGridVisibility() {
  if (typeof window.toggles !== 'undefined') {
    if (window.constellationLineMesh) window.constellationLineMesh.visible = window.toggles.constellations;
    if (window.eclipticMesh) window.eclipticMesh.visible = window.toggles.ecliptic;
    if (window.mwMesh) window.mwMesh.visible = window.toggles.milkyway;
    if (window.eqGridMesh) window.eqGridMesh.visible = window.toggles.equatorial;
    if (window.altAzGridMesh) window.altAzGridMesh.visible = window.toggles.grid;
  }
}

function renderWebGL(fState, screenH, labels) {
  const {
    ts,
    lst_deg,
    starVisibility,
    topRGB,
    midRGB,
    horRGB,
    hy,
    sunEqPos,
    moonEqPos,
    moonPhase,
    atmosphereEnabled = true
  } = fState;
  const lst_rad = (lst_deg * Math.PI) / 180;
  const sinL = Math.sin(LAT_RAD);
  const cosL = Math.cos(LAT_RAD);
  const sinLST = Math.sin(lst_rad);
  const cosLST = Math.cos(lst_rad);

  const m = new THREE.Matrix3();
  m.set(
    -sinLST,
    cosLST,
    0,
    -sinL * cosLST,
    -sinL * sinLST,
    cosL,
    cosL * cosLST,
    cosL * sinLST,
    sinL,
  );

  syncAdditiveSkyMaterials({
    eqToHoriz: m,
    lookAz: window.lookAz,
    lookEl: window.lookEl,
    focalLen: window.focalLen(),
    time: ts / 1000.0,
    starVisibility: typeof starVisibility !== 'undefined' ? starVisibility : 1.0,
    dpr: window.RENDER_DPR || Math.min(window.devicePixelRatio || 1.0, 1.5),
  });

  updateSkyOceanUniforms(topRGB, midRGB, horRGB, hy, ts, atmosphereEnabled);
  
  const lights = updateSunMoonUniforms(sunEqPos, moonEqPos, m, ts, atmosphereEnabled);
  
  updateLightUniformsForSkyOcean(topRGB, midRGB, horRGB, ts, lights);
  
  updateGridVisibility();

  if (window.labelLayer) window.labelLayer.update(labels || []);

  if (window.renderBloom) {
    window.renderBloom(window.renderer, window.scene, window.camera);
  } else {
    window.renderer.render(window.scene, window.camera);
  }
}

window.renderWebGL = renderWebGL;
