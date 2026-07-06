import * as THREE from 'three';
import oceanFragmentShader from '../shaders/oceanFragment.frag.glsl';
import oceanVertexShader from '../shaders/oceanVertex.vert.glsl';
function setupOcean() {
  const size = 2.0; // LOD exponential mapping in shader
  const segments = 128; // High resolution for central area
  const oceanGeo = new THREE.PlaneGeometry(size, size, segments, segments);

  function generateSkylineData() {
    const width = 2048;
    const data = new Uint8Array(width * 4);
    const PI = Math.PI;
    const distU = (u, center) => {
      let d = Math.abs(u - center);
      return d > 0.5 ? 1.0 - d : d;
    };

    for (let i = 0; i < width; i++) {
      const rawU = i / width;
      let mountAlt = 0;
      mountAlt += (Math.sin(rawU * PI * 24.0) * 0.5 + 0.5) * 0.015;
      mountAlt += (Math.sin(rawU * PI * 70.0) * 0.5 + 0.5) * 0.008;
      
      const shoushan = Math.exp(-Math.pow(distU(rawU, 0.45) * 40.0, 2.0)) * 0.04;
      mountAlt += shoushan;

      const uDist85 = distU(rawU, 0.52);
      const tower85 = Math.exp(-Math.pow(uDist85 * 1000.0, 2.0)) * 0.06;
      const towerBase = Math.exp(-Math.pow(uDist85 * 300.0, 2.0)) * 0.03;
      
      const b1 = Math.sin(rawU * PI * 300.0);
      const b2 = Math.sin(rawU * PI * 100.0);
      let buildings = (b1 * 0.5 + 0.5) * 0.015;
      buildings *= (b2 * 0.5 + 0.5);
      
      const finalAlt = Math.max(mountAlt, buildings, tower85, towerBase);
      
      data[i * 4 + 0] = Math.min(255, finalAlt * 2550); 
      data[i * 4 + 1] = (buildings > 0.005 || uDist85 < 0.01) ? 255 : 0; 
      data[i * 4 + 2] = shoushan > 0.001 ? Math.min(255, mountAlt * 2550) : 0; 
      data[i * 4 + 3] = Math.min(255, uDist85 * 2550); 
    }
    
    const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  const bakedSkylineTex = generateSkylineData();

  window.oceanMaterial = new THREE.ShaderMaterial({
    vertexShader: oceanVertexShader,
    fragmentShader: oceanFragmentShader,
    uniforms: {
      topRGB: { value: new THREE.Vector3() },
      midRGB: { value: new THREE.Vector3() },
      horRGB: { value: new THREE.Vector3() },
      time: { value: 0 },
      lookAz: { value: 0 },
      lookEl: { value: 0 },
      focalLen: { value: 500 },
      resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      lightDir: { value: new THREE.Vector3(0, 0, 1) },
      lightIntensity: { value: 0.0 },
      lightColor: { value: new THREE.Vector3(0.8, 0.9, 1.0) },
      skylineTex: { value: bakedSkylineTex },
    },
    transparent: true,
    depthWrite: false,
  });

  window.oceanMesh = new THREE.Mesh(oceanGeo, window.oceanMaterial);
  // 讓海面的 renderOrder 大於星星 (0)，這樣星星就會被繪製在海面「之下」，配合透明度達成真正的透底效果
  window.oceanMesh.renderOrder = 10;
  window.scene.add(window.oceanMesh);
}

window.setupOcean = setupOcean;

