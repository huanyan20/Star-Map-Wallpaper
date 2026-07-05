import * as THREE from 'three';
import { registerAdditiveSkyMaterial } from './additiveSkyMaterial.js';

let mwParticles = null;

export function setupMilkyWay(scene) {
  const loader = new THREE.FileLoader();
  loader.setResponseType('arraybuffer');
  loader.load('assets/mw_particles.bin', (buffer) => {
    const data = new DataView(buffer);
    const numPoints = buffer.byteLength / 16;

    const positions = new Float32Array(numPoints * 3);
    const colors = new Float32Array(numPoints * 3);
    const sizes = new Float32Array(numPoints);

    let offset = 0;
    for (let i = 0; i < numPoints; i++) {
      positions[i * 3] = data.getFloat32(offset, true);
      positions[i * 3 + 1] = data.getFloat32(offset + 4, true);
      positions[i * 3 + 2] = data.getFloat32(offset + 8, true);

      colors[i * 3] = data.getUint8(offset + 12) / 255.0;
      colors[i * 3 + 1] = data.getUint8(offset + 13) / 255.0;
      colors[i * 3 + 2] = data.getUint8(offset + 14) / 255.0;

      sizes[i] = data.getUint8(offset + 15) / 255.0;
      offset += 16;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const fragmentShader = `
      varying vec3 vColor;
      varying float vAlpha;
      varying float vPtRatio;  // paddedSize / renderSize — rescales padded UV back
      varying vec3 vGlowTint;
      void main() {
        // Gaussian falloff — no hard boundary, neighbouring particles blend naturally.
        // vPtRatio maps the padded gl_PointCoord back to the true mathematical radius
        // so the Gaussian shape is independent of the anti-flicker padding.
        vec2 xy = (gl_PointCoord.xy - vec2(0.5)) * vPtRatio;
        float r2 = dot(xy, xy);
        float a = exp(-r2 * 8.0); // tune: larger = tighter falloff
        vec3 mutedColor = mix(vColor, vec3(dot(vColor, vec3(0.299, 0.587, 0.114))), 0.35);
        vec3 tintedColor = mutedColor * vGlowTint;
        gl_FragColor = vec4(tintedColor * a, vAlpha * a);
      }
    `;

    window.mwMaterial = new THREE.ShaderMaterial({
      vertexShader: `
      uniform mat3 eqToHoriz;
      uniform float starVisibility;
      uniform float focalLen;
      uniform float lookAz;
      uniform float lookEl;
      uniform float dpr;
      
      attribute float size;
      attribute vec3 color;
      
      varying vec3 vColor;
      varying float vAlpha;
      varying float vPtRatio;
      varying vec3 vGlowTint;
      
      void main() {
        vec3 sxsyz = eqToHoriz * position;
        float sx = sxsyz.x;
        float sy = sxsyz.y;
        float sz = sxsyz.z;
        
        float lx = sin(lookAz) * cos(lookEl);
        float ly = cos(lookAz) * cos(lookEl);
        float lz = sin(lookEl);
        
        float rx = cos(lookAz);
        float ry = -sin(lookAz);
        
        float ux = ry * lz;
        float uy = -rx * lz;
        float uz = cos(lookEl);
        
        float depth = sx*lx + sy*ly + sz*lz;
        float pr = sx*rx + sy*ry;
        float pu = sx*ux + sy*uy + sz*uz;
        
        float safeDepth = max(depth, -0.999);
        float k = 2.0 / (1.0 + safeDepth);
        float px = pr * k * focalLen;
        float py = pu * k * focalLen;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(px, py, 0.0, 1.0);
        
        float depthAtten = smoothstep(-0.4, 0.0, depth);
        
        float zoomScale = focalLen / 500.0;
        float exactPtSize = (1.0 + size * 1.5) * pow(zoomScale, 0.5) * depthAtten * dpr;
        
        // Anti-flicker: clamp to at least 1px for the padding calculation.
        // If we used exactPtSize directly, vPtRatio = paddedSize/exactPtSize could
        // become 50x for a 0.1px particle — the discard circle would be smaller than
        // a pixel, causing all rasterised samples to be discarded and the particle
        // to flicker in and out as the camera pans.
        // By clamping renderSize to 1.0, vPtRatio stays ≤ paddedSize/1 = 5,
        // so the center pixel of the padded sprite always passes discard.
        float renderSize  = max(exactPtSize, 1.0);
        float paddedSize  = ceil(renderSize) + 4.0;
        vPtRatio = paddedSize / renderSize;
        gl_PointSize = max(paddedSize, 1.0);
        
        vColor = color;
        vec2 cityDir = normalize(vec2(0.866, 0.5));
        vec2 viewAz = normalize(vec2(sx, sy) + vec2(1e-4, 1e-4));
        float cityFactor = dot(viewAz, cityDir) * 0.5 + 0.5;
        cityFactor = smoothstep(0.1, 0.9, cityFactor);
        float horizonFade = smoothstep(-0.02, 0.08, sz) * depthAtten;
        float directionalFade = mix(0.4, 1.0, cityFactor);
        // Sub-pixel coverage: a particle smaller than 1px covers only a fraction
        // of its host pixel. Scale alpha by the area ratio (r²) so sub-pixel
        // particles dim gracefully instead of popping on/off.
        float coverage = min(1.0, exactPtSize * exactPtSize);
        vAlpha = starVisibility * horizonFade * directionalFade * 0.25 * coverage;
        vGlowTint = mix(vec3(0.42, 0.52, 0.95), vec3(1.0, 0.55, 0.22), cityFactor);
      }
      `,
      fragmentShader,
      uniforms: {
        eqToHoriz: { value: new THREE.Matrix3() },
        starVisibility: { value: 1.0 },
        lookAz: { value: 0 },
        lookEl: { value: 0 },
        focalLen: { value: 500 },
        time: { value: 0 },
        dpr: { value: 1.0 }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    mwParticles = new THREE.Points(geometry, window.mwMaterial);
    registerAdditiveSkyMaterial(window.mwMaterial);
    mwParticles.frustumCulled = false;
    scene.add(mwParticles);
    window.mwMesh = mwParticles;

    if (window.starsMaterial && window.starsMaterial.uniforms.eqToHoriz) {
      window.mwMaterial.uniforms.eqToHoriz.value.copy(window.starsMaterial.uniforms.eqToHoriz.value);
    }
  });
}

export function updateMilkyWayGeometry() {
  // Not needed for particle points
}

// ─── Galactic conversion matrix (J2000) ─────────────────────────────────────
// Same matrix as build_mw_particles.js / build_mw_glow.js so UV sampling is
// consistent with how the particle positions were generated.
const EQ_TO_GAL = [
  [-0.054876, -0.873437, -0.483835],
  [ 0.494109, -0.444830,  0.746982],
  [-0.867666, -0.198076,  0.455984],
];
const MW_MAX_B_RAD = 55.0 * Math.PI / 180.0; // texture covers ±55° galactic lat

function eqToGalUV(ex, ey, ez) {
  // Rotate equatorial → galactic Cartesian
  const gx = EQ_TO_GAL[0][0]*ex + EQ_TO_GAL[0][1]*ey + EQ_TO_GAL[0][2]*ez;
  const gy = EQ_TO_GAL[1][0]*ex + EQ_TO_GAL[1][1]*ey + EQ_TO_GAL[1][2]*ez;
  const gz = EQ_TO_GAL[2][0]*ex + EQ_TO_GAL[2][1]*ey + EQ_TO_GAL[2][2]*ez;
  const l  = Math.atan2(gy, gx);          // galactic longitude −π…π
  const b  = Math.asin(Math.max(-1, Math.min(1, gz))); // galactic latitude −π/2…π/2
  const u  = l / (2.0 * Math.PI) + 0.5;  // 0…1
  const v  = 1.0 - (b + MW_MAX_B_RAD) / (2.0 * MW_MAX_B_RAD); // 0…1 (image Y down)
  return [ Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v)) ];
}

/**
 * Adds a continuous glow layer beneath the milkyway particles.
 * Uses the same billboard/decal projection technique as nebulas.js:
 * a unit sphere whose UVs are galactic-coordinate-mapped to mw_glow.png,
 * rendered with AdditiveBlending + luminance-as-alpha at low opacity.
 */
export function setupMilkyWayGlow(scene) {
  // ── Build sphere geometry with galactic UV mapping ─────────────────────────
  // Resolution: 256×128 = ~32 k tris, small quads (≈1.4°) keep projection error low
  const sphereGeo = new THREE.SphereGeometry(1, 256, 128);

  // SphereGeometry places north pole at +Y; our equatorial system has north at +Z.
  // Remap: eq_x = geo_x, eq_y = geo_z, eq_z = geo_y
  // Then compute galactic UV for each remapped vertex.
  const posAttr = sphereGeo.attributes.position;
  const uvAttr  = sphereGeo.attributes.uv;
  const basePositions = [];
  const baseUvs = [];
  for (let i = 0; i < posAttr.count; i++) {
    const gx = posAttr.getX(i); // geo X  = equatorial X
    const gy = posAttr.getY(i); // geo Y  = equatorial Z (north pole)
    const gz = posAttr.getZ(i); // geo Z  = equatorial Y
    basePositions.push(gx, gz, gy);
    const [u, v] = eqToGalUV(gx, gz, gy);
    baseUvs.push(u, v);
  }

  // Split UV seams per triangle so the longitude wraparound stays continuous.
  // The original sphere geometry duplicates seam vertices, but those duplicates
  // were overwritten with a single UV value; we need separate vertex entries for
  // each triangle corner after the seam is remapped.
  const seamGeo = new THREE.BufferGeometry();
  const seamPositions = [];
  const seamUvs = [];
  const seamIndices = [];
  const indexAttr = sphereGeo.index ? sphereGeo.index.array : null;
  const triCount = indexAttr ? indexAttr.length / 3 : posAttr.count / 3;

  const pushVertex = (vertexIndex, u, v) => {
    const baseOffset = vertexIndex * 3;
    seamPositions.push(basePositions[baseOffset], basePositions[baseOffset + 1], basePositions[baseOffset + 2]);
    seamUvs.push(u, v);
    return seamPositions.length / 3 - 1;
  };

  for (let i = 0; i < triCount; i++) {
    const a = indexAttr ? indexAttr[i * 3] : i * 3;
    const b = indexAttr ? indexAttr[i * 3 + 1] : i * 3 + 1;
    const c = indexAttr ? indexAttr[i * 3 + 2] : i * 3 + 2;

    const baseU = baseUvs[a * 2];
    const v0 = baseUvs[a * 2 + 1];
    const u1 = baseUvs[b * 2] + Math.round(baseU - baseUvs[b * 2]);
    const v1 = baseUvs[b * 2 + 1];
    const u2 = baseUvs[c * 2] + Math.round(baseU - baseUvs[c * 2]);
    const v2 = baseUvs[c * 2 + 1];

    seamIndices.push(pushVertex(a, baseU, v0));
    seamIndices.push(pushVertex(b, u1, v1));
    seamIndices.push(pushVertex(c, u2, v2));
  }

  seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamPositions, 3));
  seamGeo.setAttribute('uv', new THREE.Float32BufferAttribute(seamUvs, 2));
  seamGeo.setIndex(seamIndices);
  seamGeo.computeVertexNormals();

  // ── Shaders — identical to nebulas.js ────────────────────────────────────
  const vertexShader = `
    uniform mat3 eqToHoriz;
    uniform float lookAz;
    uniform float lookEl;
    uniform float focalLen;

    varying vec2  vUv;
    varying float vHorizonFade;
    varying vec3  vGlowTint;

    void main() {
      vUv = uv;
      // position is already in equatorial Cartesian (set above in JS)
      vec3 sxsyz = eqToHoriz * position;

      float sx = sxsyz.x;
      float sy = sxsyz.y;
      float sz = sxsyz.z;

      float lx = sin(lookAz) * cos(lookEl);
      float ly = cos(lookAz) * cos(lookEl);
      float lz = sin(lookEl);

      float rx = cos(lookAz);
      float ry = -sin(lookAz);

      float ux = ry * lz;
      float uy = -rx * lz;
      float uz = cos(lookEl);

      float depth = sx*lx + sy*ly + sz*lz;
      float pr    = sx*rx + sy*ry;
      float pu    = sx*ux + sy*uy + sz*uz;

      float safeDepth = max(depth, -0.999);
      float k  = 2.0 / (1.0 + safeDepth);
      float px = pr * k * focalLen;
      float py = pu * k * focalLen;

      // viewMatrix only — same fix as nebulas.js (modelMatrix is identity here
      // anyway since the sphere sits at the origin, but be explicit).
      gl_Position = projectionMatrix * viewMatrix * vec4(px, py, 0.0, 1.0);

      float depthAtten = smoothstep(-0.4, 0.0, depth);
      vec2 cityDir = normalize(vec2(0.866, 0.5));
      vec2 viewAz = normalize(vec2(sx, sy) + vec2(1e-4, 1e-4));
      float cityFactor = dot(viewAz, cityDir) * 0.5 + 0.5;
      cityFactor = smoothstep(0.1, 0.9, cityFactor);
      float directionalFade = mix(0.45, 1.0, cityFactor);
      vHorizonFade = smoothstep(-0.02, 0.08, sz) * depthAtten * directionalFade;
      vGlowTint = mix(vec3(0.42, 0.52, 0.95), vec3(1.0, 0.55, 0.22), cityFactor);
    }
  `;

  const fragmentShader = `
    uniform sampler2D tDiffuse;
    uniform float     starVisibility;
    varying vec2      vUv;
    varying float     vHorizonFade;
    varying vec3      vGlowTint;

    void main() {
      vec4  texColor = texture2D(tDiffuse, vUv);
      // Luminance-as-alpha: black regions are transparent without needing a
      // real alpha channel (same technique as nebulas.js).
      float lum   = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
      // 0.12 keeps the glow layer subtle — particles provide the detail on top
      float alpha = lum * vHorizonFade * starVisibility * 0.12;
      vec3 tintedColor = texColor.rgb * vGlowTint;
      gl_FragColor = vec4(tintedColor * alpha, alpha);
    }
  `;

  const texture = new THREE.TextureLoader().load('assets/mw_glow.png');

  window.mwGlowMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      tDiffuse:       { value: texture },
      eqToHoriz:      { value: new THREE.Matrix3() },
      starVisibility: { value: 1.0 },
      lookAz:         { value: 0 },
      lookEl:         { value: 0 },
      focalLen:       { value: 500 },
      time:           { value: 0 },
      dpr:            { value: 1.0 },
    },
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    side:        THREE.BackSide, // render inside of sphere
  });

  // Seed eqToHoriz from stars material if already available
  if (window.starsMaterial && window.starsMaterial.uniforms.eqToHoriz) {
    window.mwGlowMaterial.uniforms.eqToHoriz.value.copy(
      window.starsMaterial.uniforms.eqToHoriz.value
    );
  }

  const glowMesh = new THREE.Mesh(seamGeo, window.mwGlowMaterial);
  registerAdditiveSkyMaterial(window.mwGlowMaterial);
  glowMesh.frustumCulled = false;
  scene.add(glowMesh);
  window.mwGlowMesh = glowMesh;
}

window.setupMilkyWay          = setupMilkyWay;
window.setupMilkyWayGlow      = setupMilkyWayGlow;
window.updateMilkyWayGeometry = updateMilkyWayGeometry;
