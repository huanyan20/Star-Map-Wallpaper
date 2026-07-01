const fs = require('fs');
let code = fs.readFileSync('webgl_engine.js', 'utf8');

const setupSkyCode = `
    const skyVertexShader = \`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    \`;

    const skyFragmentShader = \`
        uniform vec3 topRGB;
        uniform vec3 horRGB;
        uniform float hy;
        uniform vec2 resolution;
        uniform float time;
        varying vec2 vUv;

        // Simple noise
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            // vUv.y = 1 at top, 0 at bottom
            float pixelY = (1.0 - vUv.y) * resolution.y;
            
            if (pixelY <= hy) {
                // Sky
                float t = pixelY / max(hy, 1.0); // 0 at top, 1 at horizon
                gl_FragColor = vec4(mix(topRGB, horRGB, t), 1.0);
            } else {
                // Ocean
                float oceanY = pixelY - hy; // 0 at horizon, increases downwards
                
                // pseudo-perspective depth
                float depth = 1000.0 / max(oceanY, 0.1);
                
                // Add some waves
                float wave = sin(depth * 5.0 + time * 3.0) * cos(depth * 3.0 - time * 2.0 + vUv.x * 20.0);
                float wave2 = sin(depth * 12.0 + time * 4.0 - vUv.x * 50.0);
                
                float totalWave = (wave + wave2) * 0.5;
                
                // Base water color is a dark version of the horizon
                vec3 baseWater = horRGB * 0.3 + vec3(0.0, 0.05, 0.1);
                
                // Add highlights based on waves
                vec3 waterColor = baseWater + vec3(0.05, 0.1, 0.15) * totalWave;
                
                // Darken near the bottom of the screen
                float darken = clamp(1.0 - (oceanY / (resolution.y - hy)), 0.0, 1.0);
                waterColor *= mix(0.2, 1.0, darken);
                
                gl_FragColor = vec4(waterColor, 1.0);
            }
        }
    \`;

    window.skyMaterial = new THREE.ShaderMaterial({
        vertexShader: skyVertexShader,
        fragmentShader: skyFragmentShader,
        uniforms: {
            topRGB: { value: new THREE.Vector3() },
            horRGB: { value: new THREE.Vector3() },
            hy: { value: 0 },
            resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            time: { value: 0 }
        },
        depthWrite: false
    });

    const skyGeo = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight);
    window.skyMesh = new THREE.Mesh(skyGeo, window.skyMaterial);
    window.skyMesh.position.z = -900; // Far behind stars
    scene.add(window.skyMesh);
`;

// Insert the sky code at the end of initWebGL
code = code.replace(/setupStars\(\);\n\}/, `setupStars();\n${setupSkyCode}\n}`);

// Modify renderWebGL signature and update logic
code = code.replace(
  /function renderWebGL\(ts, lst_deg, starVisibility\) \{/,
  `function renderWebGL(ts, lst_deg, starVisibility, topRGB, horRGB, hy, screenH) {`,
);

code = code.replace(
  /starsMaterial\.uniforms\.starVisibility\.value = typeof starVisibility \!== "undefined" \? starVisibility : 1\.0;/,
  `starsMaterial.uniforms.starVisibility.value = typeof starVisibility !== "undefined" ? starVisibility : 1.0;
    
    if (window.skyMaterial && topRGB && horRGB) {
        window.skyMaterial.uniforms.topRGB.value.set(topRGB[0]/255, topRGB[1]/255, topRGB[2]/255);
        window.skyMaterial.uniforms.horRGB.value.set(horRGB[0]/255, horRGB[1]/255, horRGB[2]/255);
        window.skyMaterial.uniforms.hy.value = hy;
        window.skyMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        window.skyMaterial.uniforms.time.value = ts / 1000.0;
        
        // Ensure skyMesh scales to window
        window.skyMesh.geometry.dispose();
        window.skyMesh.geometry = new THREE.PlaneGeometry(window.innerWidth, window.innerHeight);
    }`,
);

fs.writeFileSync('webgl_engine.js', code);
console.log('webgl_engine.js patched with Sky and Ocean shader');
