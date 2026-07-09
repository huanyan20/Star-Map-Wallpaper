import * as THREE from 'three';
import { skyRuntime } from '../core/runtime.js';
import skyFragmentShader from '../shaders/skyFragment.frag.glsl';
import skyVertexShader from '../shaders/skyVertex.vert.glsl';

const runtime = skyRuntime;

async function initWebGL() {
  const [starCatalog, labelFont] = await Promise.all([runtime.get('loadStarCatalog')(), runtime.get('loadLabelFont')()]);
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

  runtime.set('renderer', new THREE.WebGLRenderer({ canvas: webglCanvas, antialias: true, alpha: true }));
  runtime.get('renderer').setSize(window.innerWidth, window.innerHeight);
  runtime.get('renderer').setPixelRatio(runtime.get('RENDER_DPR') || Math.min(window.devicePixelRatio || 1, 1.5));
  // Bloom pipeline — must come right after renderer so RTs match its output size
  if (runtime.get('setupBloom')) runtime.get('setupBloom')(window.innerWidth, window.innerHeight);

  runtime.get('renderer').toneMapping = THREE.NoToneMapping;
  runtime.get('renderer').outputColorSpace = THREE.SRGBColorSpace;

  window.addEventListener('resize', () => {
    runtime.get('renderer').setSize(window.innerWidth, window.innerHeight);
    runtime.get('renderer').setPixelRatio(runtime.get('RENDER_DPR') || Math.min(window.devicePixelRatio || 1, 1.5));
    if (runtime.get('resizeBloom')) runtime.get('resizeBloom')(window.innerWidth, window.innerHeight);
    runtime.get('camera').left = -window.innerWidth / 2;
    runtime.get('camera').right = window.innerWidth / 2;
    runtime.get('camera').top = window.innerHeight / 2;
    runtime.get('camera').bottom = -window.innerHeight / 2;
    runtime.get('camera').updateProjectionMatrix();
    if (runtime.get('updateSkyGeometry')) runtime.get('updateSkyGeometry')();
    if (runtime.get('skyMaterial') && runtime.get('skyMaterial').uniforms.resolution) {
      runtime.get('skyMaterial').uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }
    if (runtime.get('oceanMaterial') && runtime.get('oceanMaterial').uniforms.resolution) {
      runtime.get('oceanMaterial').uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    }
  });

  runtime.set('scene', new THREE.Scene());

  runtime.set('camera', new THREE.OrthographicCamera(
    -window.innerWidth / 2,
    window.innerWidth / 2,
    window.innerHeight / 2,
    -window.innerHeight / 2,
    0.1,
    1000
  ));
  runtime.get('camera').position.z = 100;

  if (runtime.get('setupShaders')) runtime.get('setupShaders')();
  if (runtime.get('setupStars')) runtime.get('setupStars')(starCatalog);
  if (runtime.get('setupGrids')) runtime.get('setupGrids')();
  if (runtime.get('setupLabelLayer')) runtime.get('setupLabelLayer')(labelFont);
  if (runtime.get('setupOcean')) runtime.get('setupOcean')();
  if (runtime.get('setupSun')) runtime.get('setupSun')();
  if (runtime.get('setupMoon')) runtime.get('setupMoon')();
  if (runtime.get('setupMilkyWayGlow')) runtime.get('setupMilkyWayGlow')(runtime.get('scene'));
  if (runtime.get('setupMilkyWay')) runtime.get('setupMilkyWay')(runtime.get('scene'));
  if (runtime.get('setupNebulas')) runtime.get('setupNebulas')(runtime.get('scene'));

  runtime.set('skyMaterial', new THREE.ShaderMaterial({
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    extensions: { derivatives: true },
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
      dpr: { value: window.devicePixelRatio || 1.0 },
    },
    depthWrite: false,
    transparent: true,
  }));

  runtime.set('skyW', window.innerWidth);
  runtime.set('skyH', window.innerHeight);
  const skyGeo = new THREE.PlaneGeometry(runtime.get('skyW'), runtime.get('skyH'));
  runtime.set('skyMesh', new THREE.Mesh(skyGeo, runtime.get('skyMaterial')));
  runtime.get('skyMesh').frustumCulled = false;
  runtime.get('skyMesh').position.z = -500;
  runtime.get('skyMesh').renderOrder = -20;
  runtime.get('scene').add(runtime.get('skyMesh'));
}

runtime.set('initWebGL', initWebGL);

