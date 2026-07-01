import * as THREE from 'three';
import oceanFragmentShader from '../shaders/oceanFragment.frag.glsl';
import oceanVertexShader from '../shaders/oceanVertex.vert.glsl';
function setupOcean() {
  const size = 2.0; // LOD exponential mapping in shader
  const segments = 512; // High resolution for central area
  const oceanGeo = new THREE.PlaneGeometry(size, size, segments, segments);

  

  

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
      skylineTex: { value: null },
    },
    transparent: true,
    depthWrite: false,
  });

  window.oceanMesh = new THREE.Mesh(oceanGeo, window.oceanMaterial);
  // 讓海?��? renderOrder 大於?��? (0)，這樣?��?就�?被繪製在海面?��?下」�??��??��?度�??��?�???��??��?
  window.oceanMesh.renderOrder = 10;
  window.scene.add(window.oceanMesh);
}

window.setupOcean = setupOcean;

