/**
 * bloom.js — Multi-pass screen-space bloom (PSF / lens-glow simulation)
 *
 * Pipeline (5 GPU passes):
 *   1. Scene   → rtScene   (full-res, HALF_FLOAT to preserve HDR star peaks)
 *   2. Threshold → rtBright  (half-res — extract pixels brighter than threshold)
 *   3. Blur H   → rtBlurA   (half-res horizontal Gaussian, 9-tap)
 *   4. Blur V   → rtBlurB   (half-res vertical   Gaussian, 9-tap) = final bloom
 *   5. Composite → screen   (scene + bloom * strength, additive)
 *
 * All brightness/strength settings are on window.bloomCfg so the UI can tune them.
 * Call setupBloom() once after the renderer is created, then renderBloom() replaces
 * the single renderer.render() call at the end of renderWebGL().
 */

import * as THREE from 'three';

// ── Render targets ──────────────────────────────────────────────────────────
let rtScene  = null;  // full-res — scene capture
let rtBright = null;  // half-res — threshold extract
let rtBlurA  = null;  // half-res — horizontal blur
let rtBlurB  = null;  // half-res — vertical blur (= final bloom)

// ── Fullscreen-pass scene (shared across all post-process passes) ───────────
let fsScene  = null;
let fsCamera = null;
let fsMesh   = null;  // single mesh; swap .material per pass

// ── Per-pass materials ──────────────────────────────────────────────────────
let matThreshold = null;
let matBlurH     = null;
let matBlurV     = null;
let matComposite = null;

// ── Public config (tune via window.bloomCfg) ────────────────────────────────
window.bloomCfg = {
  enabled:   false,
  threshold: 0.45,   // luminance threshold; 0 = everything blooms, 1 = nothing
  strength:  0.75,   // additive bloom brightness multiplier
};

// ── Layered Bloom Weights (Multipliers) ─────────────────────────────────────
window.bloomLayers = {
  sun: 2.5,        // HDR multiplier for opaque sun
  moon: 1.2,       // HDR multiplier for opaque moon
  brightStar: 1.5, // Alpha multiplier for bright stars
  nebula: 1.2,     // Alpha multiplier for nebulas
  milkyway: 0.8    // Alpha multiplier for milky way
};

// ── Internal helpers ────────────────────────────────────────────────────────

function makeRT(w, h, type) {
  return new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format:    THREE.RGBAFormat,
    type:      type || THREE.UnsignedByteType,
  });
}

/** Single full-screen triangle — avoids diagonal seam of PlaneGeometry */
function buildFSTriangle() {
  const geo = new THREE.BufferGeometry();
  // NDC triangle that covers [-1,1]² exactly
  geo.setAttribute('position', new THREE.Float32BufferAttribute(
    [-1, -1, 0,   3, -1, 0,   -1, 3, 0], 3
  ));
  // UVs: (0,0)→(2,0)→(0,2) — interpolates to (1,1) at NDC corner (1,1) ✓
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(
    [0, 0,   2, 0,   0, 2], 2
  ));
  return geo;
}

// Vertex shader shared by every fullscreen pass.
// gl_Position = vec4(position, 1.0) bypasses Three.js camera math entirely —
// position values are already in NDC [-1,3] range.
const FS_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// ── Setup ───────────────────────────────────────────────────────────────────

export function setupBloom(width, height) {
  // Full-res HALF_FLOAT: preserves star peaks > 1.0 (additive blending can exceed 1).
  // Bloom ping-pong at half resolution for performance.
  const bw = Math.max(1, Math.floor(width  * 0.5));
  const bh = Math.max(1, Math.floor(height * 0.5));

  rtScene  = makeRT(width, height, THREE.HalfFloatType);
  rtBright = makeRT(bw, bh);
  rtBlurA  = makeRT(bw, bh);
  rtBlurB  = makeRT(bw, bh);

  // ── Material: luminance threshold extract ────────────────────────────────
  matThreshold = new THREE.ShaderMaterial({
    uniforms: {
      tScene:     { value: null },
      uThreshold: { value: window.bloomCfg.threshold },
    },
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tScene;
      uniform float uThreshold;
      varying vec2 vUv;
      void main() {
        vec4 tex = texture2D(tScene, vUv);
        vec3 c = tex.rgb;
        // tex.a contains the accumulated Bloom Weight (Layered Bloom alpha)
        float bloomWeight = max(1.0, tex.a * 1.5);
        
        // Perceptual luminance
        float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
        
        // Alpha Layered Bloom: effective luminance is boosted by the bloom weight.
        // This makes objects with high alpha (like bright stars) bloom stronger
        // without affecting the threshold of the background sky.
        float effectiveLum = lum * bloomWeight;
        
        // Smooth ramp above threshold so there's no hard jump
        float extract = smoothstep(uThreshold, uThreshold + 0.10, effectiveLum);
        
        // Output RGB scaled by extraction and the bloom weight
        gl_FragColor = vec4(c * extract * 0.75 * bloomWeight, 1.0);
      }
    `,
    depthTest: false, depthWrite: false,
  });

  // ── Material: separable 9-tap Gaussian blur ──────────────────────────────
  // Weights for σ ≈ 1.7 (kernel [-4..4]), pre-normalised to sum = 1.
  // Used for both H and V passes; direction is controlled via uDir uniform.
  const BLUR_FRAG = /* glsl */`
    uniform sampler2D tInput;
    uniform vec2 uDir;   // (1/bw, 0) for H, (0, 1/bh) for V
    varying vec2 vUv;
    void main() {
      vec4 c  = texture2D(tInput, vUv             ) * 0.2270270270;
      c += texture2D(tInput, vUv + uDir * 1.0) * 0.1945945946;
      c += texture2D(tInput, vUv - uDir * 1.0) * 0.1945945946;
      c += texture2D(tInput, vUv + uDir * 2.0) * 0.1216216216;
      c += texture2D(tInput, vUv - uDir * 2.0) * 0.1216216216;
      c += texture2D(tInput, vUv + uDir * 3.0) * 0.0540540541;
      c += texture2D(tInput, vUv - uDir * 3.0) * 0.0540540541;
      c += texture2D(tInput, vUv + uDir * 4.0) * 0.0162162162;
      c += texture2D(tInput, vUv - uDir * 4.0) * 0.0162162162;
      gl_FragColor = c;
    }
  `;

  matBlurH = new THREE.ShaderMaterial({
    uniforms: {
      tInput: { value: null },
      uDir:   { value: new THREE.Vector2(1.0 / bw, 0.0) },
    },
    vertexShader: FS_VERT, fragmentShader: BLUR_FRAG,
    depthTest: false, depthWrite: false,
  });

  matBlurV = new THREE.ShaderMaterial({
    uniforms: {
      tInput: { value: null },
      uDir:   { value: new THREE.Vector2(0.0, 1.0 / bh) },
    },
    vertexShader: FS_VERT, fragmentShader: BLUR_FRAG,
    depthTest: false, depthWrite: false,
  });

  // ── Material: additive composite (scene + bloom) ─────────────────────────
  matComposite = new THREE.ShaderMaterial({
    uniforms: {
      tScene:    { value: null },
      tBloom:    { value: null },
      uStrength: { value: window.bloomCfg.strength },
    },
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tScene;
      uniform sampler2D tBloom;
      uniform float uStrength;
      varying vec2 vUv;

      vec3 ACESFilm(vec3 x) {
        float a = 2.51;
        float b = 0.03;
        float c = 2.43;
        float d = 0.59;
        float e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }

      vec3 linearToSRGB(vec3 c) {
        vec3 lo = c * 12.92;
        vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
        return mix(lo, hi, step(0.0031308, c));
      }

      void main() {
        vec3 scene = texture2D(tScene, vUv).rgb;
        vec3 bloom = texture2D(tBloom, vUv).rgb;
        vec3 hdr = scene + bloom * uStrength;
        vec3 ldr = ACESFilm(hdr * 0.88);
        
        vec3 srgb = linearToSRGB(ldr);
        // Screen-space dithering to fix color banding on 8-bit monitors
        float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        srgb += (dither - 0.5) / 255.0;
        
        gl_FragColor = vec4(srgb, 1.0);
      }
    `,
    depthTest: false, depthWrite: false,
  });

  // ── Fullscreen scene setup ────────────────────────────────────────────────
  fsScene  = new THREE.Scene();
  // Orthographic camera in NDC space [-1,1] — camera doesn't matter since
  // the vertex shader bypasses it, but Three.js requires one for rendering.
  fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  fsMesh   = new THREE.Mesh(buildFSTriangle(), matThreshold); // placeholder
  fsMesh.frustumCulled = false;
  fsScene.add(fsMesh);
}

// ── Resize ──────────────────────────────────────────────────────────────────

export function resizeBloom(width, height) {
  if (!rtScene) return;

  rtScene.setSize(width, height);

  const bw = Math.max(1, Math.floor(width  * 0.5));
  const bh = Math.max(1, Math.floor(height * 0.5));
  rtBright.setSize(bw, bh);
  rtBlurA .setSize(bw, bh);
  rtBlurB .setSize(bw, bh);

  // Update blur direction uniforms so they match the new texel size
  if (matBlurH) matBlurH.uniforms.uDir.value.set(1.0 / bw, 0.0);
  if (matBlurV) matBlurV.uniforms.uDir.value.set(0.0, 1.0 / bh);
}

// ── Render ──────────────────────────────────────────────────────────────────

/** Blit: render inputTex through material into outputRT (null = screen). */
function blit(renderer, mat, outputRT) {
  fsMesh.material = mat;
  renderer.setRenderTarget(outputRT);
  renderer.render(fsScene, fsCamera);
}

/**
 * renderBloom — call this INSTEAD OF renderer.render(scene, camera).
 * If bloom is disabled, falls back to a direct render with no overhead.
 */
export function renderBloom(renderer, scene, camera) {
  const cfg = window.bloomCfg;

  if (!rtScene || !cfg.enabled) {
    // Graceful bypass: no render targets set up yet, or bloom disabled
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    return;
  }

  // ── Pass 1: full scene → rtScene (HDR) ────────────────────────────────
  renderer.setRenderTarget(rtScene);
  renderer.render(scene, camera);

  // ── Pass 2: threshold extract → rtBright (half-res) ───────────────────
  matThreshold.uniforms.tScene.value     = rtScene.texture;
  matThreshold.uniforms.uThreshold.value = cfg.threshold;
  blit(renderer, matThreshold, rtBright);

  // ── Pass 3: horizontal Gaussian blur → rtBlurA ────────────────────────
  matBlurH.uniforms.tInput.value = rtBright.texture;
  blit(renderer, matBlurH, rtBlurA);

  // ── Pass 4: vertical Gaussian blur → rtBlurB (= final bloom map) ──────
  matBlurV.uniforms.tInput.value = rtBlurA.texture;
  blit(renderer, matBlurV, rtBlurB);

  // ── Pass 5: composite scene + bloom → screen ──────────────────────────
  matComposite.uniforms.tScene.value    = rtScene.texture;
  matComposite.uniforms.tBloom.value    = rtBlurB.texture;
  matComposite.uniforms.uStrength.value = cfg.strength;
  blit(renderer, matComposite, null);  // null = draw to canvas
}

// Expose on window so render.js (loaded afterward) can call these,
// and the UI can toggle/tune via window.bloomCfg.
window.setupBloom  = setupBloom;
window.resizeBloom = resizeBloom;
window.renderBloom = renderBloom;
