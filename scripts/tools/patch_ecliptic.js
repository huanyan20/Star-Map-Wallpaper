const fs = require('fs');
let code = fs.readFileSync('webgl_engine.js', 'utf8');

const setupEclipticCode = `
    // --- Ecliptic Line ---
    const eclipticGeo = new THREE.BufferGeometry();
    const numEclipticPts = 180;
    const eclipticPositions = new Float32Array(numEclipticPts * 3);
    const eps = 23.439 * Math.PI / 180;
    
    for (let i = 0; i < numEclipticPts; i++) {
        const lambda = (i / numEclipticPts) * Math.PI * 2;
        eclipticPositions[i*3 + 0] = Math.cos(lambda);
        eclipticPositions[i*3 + 1] = Math.cos(eps) * Math.sin(lambda);
        eclipticPositions[i*3 + 2] = Math.sin(eps) * Math.sin(lambda);
    }
    
    eclipticGeo.setAttribute('position', new THREE.BufferAttribute(eclipticPositions, 3));
    
    const eclipticFragmentShader = \`
        varying float vDepth;
        uniform float starVisibility;
        void main() {
            if (vDepth < -0.4) discard;
            // Draw a yellow/gold line for Ecliptic
            gl_FragColor = vec4(0.9, 0.8, 0.3, 0.6 * starVisibility);
        }
    \`;
    
    window.eclipticMaterial = new THREE.ShaderMaterial({
        vertexShader: lineVertexShader,
        fragmentShader: eclipticFragmentShader,
        uniforms: starsMaterial.uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    
    window.eclipticMesh = new THREE.LineLoop(eclipticGeo, window.eclipticMaterial);
    scene.add(window.eclipticMesh);
`;

code = code.replace(
  /const lineMesh = new THREE\.LineSegments\(lineGeo, window\.constellationLinesMaterial\);\s*scene\.add\(lineMesh\);/,
  `window.constellationLineMesh = new THREE.LineSegments(lineGeo, window.constellationLinesMaterial);
        scene.add(window.constellationLineMesh);
        ${setupEclipticCode}`
);

// Toggle visibility of ecliptic based on toggles.equator (since there is no toggles.ecliptic currently, or we can use toggles.constellations)
code = code.replace(
  /if \(window\.constellationLineMesh && typeof toggles \!== 'undefined'\) \{/,
  `if (window.constellationLineMesh && typeof toggles !== 'undefined') {
        window.constellationLineMesh.visible = toggles.constellations;
        if (window.eclipticMesh) window.eclipticMesh.visible = toggles.equator;`
);

fs.writeFileSync('webgl_engine.js', code);
console.log('webgl_engine.js patched with Ecliptic line');
