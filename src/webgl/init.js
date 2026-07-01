import * as THREE from 'three';
import skyFragmentShader from '../shaders/skyFragment.frag.glsl';
import skyVertexShader from '../shaders/skyVertex.vert.glsl';

async function initWebGL() {
  const [starCatalog, labelFont] = await Promise.all([window.loadStarCatalog(), window.loadLabelFont()]);
  const webglCanvas = document.createElement('canvas');
  webglCanvas.id = 'webgl-canvas';
  webglCanvas.style.position = 'absolute';
  webglCanvas.style.top = '0';
  webglCanvas.style.left = '0';
  webglCanvas.style.width = '100vw';
  webglCanvas.style.height = '100vh';
  webglCanvas.style.zIndex = '0';

  const canvas2d = document.getElementById('canvas');
  canvas2d.style.position = 'absolute';
  canvas2d.style.zIndex = '1';
  canvas2d.style.background = 'transparent';
  canvas2d.parentElement.insertBefore(webglCanvas, canvas2d);

  window.renderer = new THREE.WebGLRenderer({ canvas: webglCanvas, antialias: true, alpha: true });
  window.renderer.setSize(window.innerWidth, window.innerHeight);
  window.renderer.setPixelRatio(window.devicePixelRatio || 1);

  window.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  window.renderer.toneMappingExposure = 1.0;

  window.addEventListener('resize', () => {
    window.renderer.setSize(window.innerWidth, window.innerHeight);
    window.camera.left = -window.innerWidth / 2;
    window.camera.right = window.innerWidth / 2;
    window.camera.top = window.innerHeight / 2;
    window.camera.bottom = -window.innerHeight / 2;
    window.camera.updateProjectionMatrix();
    if (window.updateSkyGeometry) window.updateSkyGeometry();
    if (window.skyMaterial && window.skyMaterial.uniforms.resolution) {
      window.skyMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }
    if (window.oceanMaterial && window.oceanMaterial.uniforms.resolution) {
      window.oceanMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }
  });

  window.scene = new THREE.Scene();

  window.camera = new THREE.OrthographicCamera(
    -window.innerWidth / 2,
    window.innerWidth / 2,
    window.innerHeight / 2,
    -window.innerHeight / 2,
    0.1,
    1000
  );
  window.camera.position.z = 100;

  if (window.setupShaders) window.setupShaders();
  if (window.setupStars) window.setupStars(starCatalog);
  if (window.setupGrids) window.setupGrids();
  if (window.setupLabelLayer) window.setupLabelLayer(labelFont);
  if (window.setupOcean) window.setupOcean();
  if (window.setupSun) window.setupSun();
  if (window.setupMoon) window.setupMoon();

  window.skyMaterial = new THREE.ShaderMaterial({
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    derivatives: true,
    uniforms: {
      topRGB: { value: new THREE.Vector3() },
      midRGB: { value: new THREE.Vector3() },
      horRGB: { value: new THREE.Vector3() },
      lightDir: { value: new THREE.Vector3(0, 0, 1) },
      lightIntensity: { value: 0.0 },
      hy: { value: 0 },
      resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      time: { value: 0 },
      lookAz: { value: 0 },
      lookEl: { value: 0 },
      focalLen: { value: 500 },
      sunPosition: { value: new THREE.Vector3(0, 0, -1) },
      turbidity: { value: 1.5 },
      atmosphereBlend: { value: 1.0 },
    },
    depthWrite: false,
    transparent: true,
  });

  window.skyW = window.innerWidth;
  window.skyH = window.innerHeight;
  const skyGeo = new THREE.PlaneGeometry(window.skyW, window.skyH);
  window.skyMesh = new THREE.Mesh(skyGeo, window.skyMaterial);
  window.skyMesh.frustumCulled = false;
  window.skyMesh.position.z = -500;
  window.skyMesh.renderOrder = -20;
  window.scene.add(window.skyMesh);
}

window.initWebGL = initWebGL;

