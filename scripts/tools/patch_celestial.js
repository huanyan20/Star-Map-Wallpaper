const fs = require('fs');
let code = fs.readFileSync('webgl_engine.js', 'utf8');

const setupCelestialBodiesCode = `
    // --- Celestial Bodies (Sun & Moon) ---
    const celestialGeo = new THREE.PlaneGeometry(1, 1);
    
    const celestialVertexShader = \`
        uniform mat3 eqToHoriz;
        uniform float lookAz;
        uniform float lookEl;
        uniform float focalLen;
        uniform vec3 celestialPos;
        uniform float scale;
        
        varying vec2 vUv;
        varying float vDepth;
        
        void main() {
            vUv = uv;
            vec3 horiz = eqToHoriz * celestialPos;
            float sx = horiz.x;
            float sy = horiz.y;
            float sz = horiz.z;
            
            float lx = sin(lookAz) * cos(lookEl);
            float ly = cos(lookAz) * cos(lookEl);
            float lz = sin(lookEl);
            
            float rx = cos(lookAz);
            float ry = -sin(lookAz);
            float rz = 0.0;
            
            float ux = ry * lz - rz * ly;
            float uy = rz * lx - rx * lz;
            float uz = rx * ly - ry * lx;
            
            float depth = sx*lx + sy*ly + sz*lz;
            vDepth = depth;
            
            if (depth < -0.1) {
                gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                vDepth = -1.0;
                return;
            }
            
            float pr = sx*rx + sy*ry + sz*rz;
            float pu = sx*ux + sy*uy + sz*uz;
            
            float k = 2.0 / (1.0 + depth);
            float px = pr * k * focalLen;
            float py = -pu * k * focalLen;
            
            vec2 offset = (uv - 0.5) * scale;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(px + offset.x, py + offset.y, 0.0, 1.0);
        }
    \`;
    
    const sunFragmentShader = \`
        varying vec2 vUv;
        varying float vDepth;
        uniform float starVisibility; // 0 at night, 1 during day
        void main() {
            if (vDepth < -0.4) discard;
            float r = distance(vUv, vec2(0.5));
            if (r > 0.5) discard;
            
            // Core
            float core = smoothstep(0.15, 0.0, r);
            // Corona/Halo
            float halo = smoothstep(0.5, 0.15, r);
            
            vec3 color = mix(vec3(1.0, 0.8, 0.4), vec3(1.0, 1.0, 1.0), core);
            float alpha = core + halo * 0.6;
            
            gl_FragColor = vec4(color, alpha);
        }
    \`;
    
    window.sunMaterial = new THREE.ShaderMaterial({
        vertexShader: celestialVertexShader,
        fragmentShader: sunFragmentShader,
        uniforms: {
            eqToHoriz: starsMaterial.uniforms.eqToHoriz,
            lookAz: starsMaterial.uniforms.lookAz,
            lookEl: starsMaterial.uniforms.lookEl,
            focalLen: starsMaterial.uniforms.focalLen,
            starVisibility: starsMaterial.uniforms.starVisibility,
            celestialPos: { value: new THREE.Vector3(1,0,0) },
            scale: { value: 120.0 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    
    window.sunMesh = new THREE.Mesh(celestialGeo, window.sunMaterial);
    scene.add(window.sunMesh);
    
    const moonFragmentShader = \`
        varying vec2 vUv;
        varying float vDepth;
        uniform float phase; // 0 to 1
        
        void main() {
            if (vDepth < -0.4) discard;
            float r = distance(vUv, vec2(0.5));
            if (r > 0.5) discard;
            
            // Basic moon sphere
            vec3 color = vec3(0.9, 0.9, 0.8);
            float alpha = smoothstep(0.5, 0.45, r);
            
            // Simple phase shading (terminator line)
            // vUv.x goes from 0 to 1. 
            // Phase 0: New Moon (dark), Phase 0.5: Full Moon (bright), Phase 1: New Moon
            // We'll simulate sunlight coming from the side based on phase
            float light = 1.0;
            if (phase < 0.5) {
                // Waxing: right side lit
                float terminator = phase * 2.0; // 0 to 1
                if (vUv.x < 1.0 - terminator) light = 0.1;
            } else {
                // Waning: left side lit
                float terminator = (phase - 0.5) * 2.0; // 0 to 1
                if (vUv.x > 1.0 - terminator) light = 0.1;
            }
            
            // Glow
            float glow = smoothstep(0.5, 0.2, r) * 0.3;
            
            gl_FragColor = vec4(color * light + vec3(glow), alpha);
        }
    \`;
    
    window.moonMaterial = new THREE.ShaderMaterial({
        vertexShader: celestialVertexShader,
        fragmentShader: moonFragmentShader,
        uniforms: {
            eqToHoriz: starsMaterial.uniforms.eqToHoriz,
            lookAz: starsMaterial.uniforms.lookAz,
            lookEl: starsMaterial.uniforms.lookEl,
            focalLen: starsMaterial.uniforms.focalLen,
            celestialPos: { value: new THREE.Vector3(1,0,0) },
            scale: { value: 80.0 },
            phase: { value: 0.5 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending
    });
    
    window.moonMesh = new THREE.Mesh(celestialGeo, window.moonMaterial);
    scene.add(window.moonMesh);
`;

code = code.replace(
  /window\.eclipticMesh = new THREE\.LineLoop\(eclipticGeo, window\.eclipticMaterial\);\s*scene\.add\(window\.eclipticMesh\);/,
  `window.eclipticMesh = new THREE.LineLoop(eclipticGeo, window.eclipticMaterial);
    scene.add(window.eclipticMesh);
    ${setupCelestialBodiesCode}`
);

// We need to add arguments to renderWebGL for sun and moon
code = code.replace(
  /function renderWebGL\(ts, lst_deg, starVisibility, topRGB, horRGB, hy, screenH\) \{/,
  `function renderWebGL(ts, lst_deg, starVisibility, topRGB, horRGB, hy, screenH, sunCoords, moonCoords, moonPhase) {`
);

code = code.replace(
  /renderer\.render\(scene, camera\);/,
  `
    if (window.sunMesh && sunCoords) {
        window.sunMaterial.uniforms.celestialPos.value.set(
            Math.cos(sunCoords.dec) * Math.cos(sunCoords.ra),
            Math.cos(sunCoords.dec) * Math.sin(sunCoords.ra),
            Math.sin(sunCoords.dec)
        );
    }
    
    if (window.moonMesh && moonCoords) {
        window.moonMaterial.uniforms.celestialPos.value.set(
            Math.cos(moonCoords.dec) * Math.cos(moonCoords.ra),
            Math.cos(moonCoords.dec) * Math.sin(moonCoords.ra),
            Math.sin(moonCoords.dec)
        );
        window.moonMaterial.uniforms.phase.value = moonPhase;
    }
    
    renderer.render(scene, camera);`
);

fs.writeFileSync('webgl_engine.js', code);
console.log('webgl_engine.js patched with Sun and Moon');
