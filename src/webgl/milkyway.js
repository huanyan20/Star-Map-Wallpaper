import * as THREE from 'three';

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
      void main() {
        // Soft circle particle
        vec2 xy = gl_PointCoord.xy - vec2(0.5);
        float ll = length(xy);
        if (ll > 0.5) discard;
        float a = (0.5 - ll) * 2.0;
        gl_FragColor = vec4(vColor * a, vAlpha * a);
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
        
        gl_PointSize = max(1.0, exactPtSize);
        
        vColor = color;
        float horizonFade = smoothstep(-0.02, 0.08, sz);
        vAlpha = starVisibility * horizonFade * 0.25 * depthAtten;
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
