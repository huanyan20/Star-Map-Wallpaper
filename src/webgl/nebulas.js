import * as THREE from 'three';

let nebulasGroup = null;

function radecToVector(raHours, decDeg) {
  const raRad = (raHours * 15 * Math.PI) / 180;
  const decRad = (decDeg * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(decRad) * Math.cos(raRad),
    Math.cos(decRad) * Math.sin(raRad),
    Math.sin(decRad)
  );
}

export function setupNebulas(scene) {
  nebulasGroup = new THREE.Group();
  scene.add(nebulasGroup);
  
  window.nebulaMaterials = [];

  fetch('assets/nebulas.json')
    .then(r => {
        if (!r.ok) throw new Error('nebulas.json not found');
        return r.json();
    })
    .then(config => {
      const textureLoader = new THREE.TextureLoader();
      
      for (const item of config) {
        const texture = textureLoader.load(item.texturePath);
        
        const vertexShader = `
          uniform mat3 eqToHoriz;
          uniform float lookAz;
          uniform float lookEl;
          uniform float focalLen;
          
          varying vec2 vUv;
          varying float vHorizonFade;
          
          void main() {
            vUv = uv;
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vec3 sxsyz = eqToHoriz * worldPos.xyz;
            
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
            vHorizonFade = smoothstep(-0.02, 0.08, sz) * depthAtten;
          }
        `;
        
        const fragmentShader = `
          uniform sampler2D tDiffuse;
          uniform float starVisibility;
          varying vec2 vUv;
          varying float vHorizonFade;
          void main() {
            vec4 texColor = texture2D(tDiffuse, vUv);
            float alpha = texColor.a * vHorizonFade * starVisibility;
            gl_FragColor = vec4(texColor.rgb * alpha, alpha);
          }
        `;
        
        const material = new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms: {
            tDiffuse: { value: texture },
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
        
        window.nebulaMaterials.push(material);
        
        if (window.starsMaterial && window.starsMaterial.uniforms.eqToHoriz) {
          material.uniforms.eqToHoriz.value.copy(window.starsMaterial.uniforms.eqToHoriz.value);
        }
        
        const scaleRad = (item.scale * Math.PI) / 180;
        const width = 2.0 * Math.tan(scaleRad / 2);
        const geometry = new THREE.PlaneGeometry(width, width);
        
        const mesh = new THREE.Mesh(geometry, material);
        
        const dir = radecToVector(item.ra, item.dec);
        mesh.position.copy(dir);
        
        mesh.lookAt(new THREE.Vector3(0, 0, 0));
        
        if (item.rotation) {
           mesh.rotateZ((item.rotation * Math.PI) / 180);
        }
        
        nebulasGroup.add(mesh);
      }
    })
    .catch(err => {
      console.log('Nebula decal system inactive (no config found).');
    });
}
