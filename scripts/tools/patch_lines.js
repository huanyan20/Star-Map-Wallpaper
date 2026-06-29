const fs = require('fs');
let code = fs.readFileSync('webgl_engine.js', 'utf8');

const setupLinesCode = 
    if (typeof CONSTELLATION_SEGMENTS !== 'undefined') {
        const numLines = CONSTELLATION_SEGMENTS.length;
        const linePositions = new Float32Array(numLines * 2 * 3); // 2 vertices per segment
        
        for (let i = 0; i < numLines; i++) {
            const seg = CONSTELLATION_SEGMENTS[i];
            const ra1 = seg[0] * Math.PI / 180;
            const dec1 = seg[1] * Math.PI / 180;
            const ra2 = seg[2] * Math.PI / 180;
            const dec2 = seg[3] * Math.PI / 180;
            
            linePositions[i*6 + 0] = Math.cos(dec1) * Math.cos(ra1);
            linePositions[i*6 + 1] = Math.cos(dec1) * Math.sin(ra1);
            linePositions[i*6 + 2] = Math.sin(dec1);
            
            linePositions[i*6 + 3] = Math.cos(dec2) * Math.cos(ra2);
            linePositions[i*6 + 4] = Math.cos(dec2) * Math.sin(ra2);
            linePositions[i*6 + 5] = Math.sin(dec2);
        }
        
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
        
        const lineVertexShader = \\\
            uniform mat3 eqToHoriz;
            uniform float lookAz;
            uniform float lookEl;
            uniform float focalLen;
            varying float vDepth;
            
            void main() {
                vec3 horiz = eqToHoriz * position;
                float sx = horiz.x;
                float sy = horiz.y;
                float sz = horiz.z;
                
                if (sz < -0.1) {
                    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                    vDepth = -1.0;
                    return;
                }
                
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
                
                float pr = sx*rx + sy*ry + sz*rz;
                float pu = sx*ux + sy*uy + sz*uz;
                
                float k = 2.0 / (1.0 + depth);
                float px = pr * k * focalLen;
                float py = -pu * k * focalLen;
                
                gl_Position = projectionMatrix * modelViewMatrix * vec4(px, py, 0.0, 1.0);
            }
        \\\;
        
        const lineFragmentShader = \\\
            varying float vDepth;
            uniform float starVisibility;
            void main() {
                if (vDepth < -0.4) discard;
                gl_FragColor = vec4(0.4, 0.6, 1.0, 0.35 * starVisibility);
            }
        \\\;
        
        window.constellationLinesMaterial = new THREE.ShaderMaterial({
            vertexShader: lineVertexShader,
            fragmentShader: lineFragmentShader,
            uniforms: starsMaterial.uniforms, // Share uniforms with stars!
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        const lineMesh = new THREE.LineSegments(lineGeo, window.constellationLinesMaterial);
        scene.add(lineMesh);
    }
;

// Inject into setupStars() right at the end
code = code.replace(
    /if \(typeof STARS \!== 'undefined'\) \{[\s\S]*?scene\.add\(namedStarsMesh\);\n\s*\}/,
    match => match + "\n" + setupLinesCode
);

fs.writeFileSync('webgl_engine.js', code);
console.log('Added constellation lines to webgl_engine.js');
