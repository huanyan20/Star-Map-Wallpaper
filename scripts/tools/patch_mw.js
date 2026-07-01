const fs = require('fs');
let code = fs.readFileSync('webgl_engine.js', 'utf8');

const setupMilkyWayCode = `
    // --- Milky Way ---
    const mwGeo = new THREE.SphereGeometry(2, 64, 64);
    
    const mwVertexShader = \`
        uniform mat3 eqToHoriz;
        uniform float lookAz;
        uniform float lookEl;
        uniform float focalLen;
        
        varying vec3 vEqPos;
        varying float vDepth;
        
        void main() {
            // Assume sphere is mapped such that position is standard Cartesian
            // with Z = North Pole, X = RA 0.
            // But Three.js SphereGeometry has Y as UP!
            // We need to swap Y and Z so that Z is UP (North Pole).
            vec3 eqPos = vec3(position.x, position.z, position.y);
            vEqPos = normalize(eqPos);
            
            vec3 horiz = eqToHoriz * eqPos;
            
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
            
            if (sz < -0.05 || depth < -0.1) {
                gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                vDepth = -1.0;
                return;
            }
            
            float pr = sx*rx + sy*ry + sz*rz;
            float pu = sx*ux + sy*uy + sz*uz;
            
            float k = 2.0 / (1.0 + depth);
            float px = pr * k * focalLen;
            float py = -pu * k * focalLen;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(px, py, 0.0, 1.0);
        }
    \`;
    
    const mwFragmentShader = \`
        uniform sampler2D mwMap;
        uniform float starVisibility;
        uniform mat3 eqToGal;
        
        varying vec3 vEqPos;
        varying float vDepth;
        
        #define PI 3.14159265359
        
        void main() {
            if (vDepth < -0.4) discard;
            
            // Convert Equatorial to Galactic
            vec3 galPos = eqToGal * vEqPos;
            
            // Calculate galactic longitude (l) and latitude (b)
            // galPos.x = GC (l=0)
            float l = atan(galPos.y, galPos.x); // -PI to PI
            float b = asin(galPos.z); // -PI/2 to PI/2
            
            // The image is from b = -55 to +55 deg
            float maxB = 55.0 * PI / 180.0;
            if (b < -maxB || b > maxB) discard;
            
            // Map l and b to uv
            // Image: GC is centered. Left is -180, right is +180.
            // l is currently -PI to PI, which perfectly maps to 0 to 1 if we do l / (2PI) + 0.5
            float u = l / (2.0 * PI) + 0.5;
            
            // b goes from -maxB to +maxB
            float v = (b + maxB) / (2.0 * maxB);
            
            vec4 texColor = texture2D(mwMap, vec2(u, v));
            
            // Apply star visibility to fade Milky Way during daytime
            gl_FragColor = vec4(texColor.rgb, texColor.r * 1.5 * starVisibility);
        }
    \`;
    
    // Matrix to convert Equatorial to Galactic Cartesian
    // J2000: NGP RA=192.85948, Dec=27.12825. Asc node = 32.93192
    const eqToGalEuler = new THREE.Euler(
        0, 
        0, 
        0, 
        'ZXY'
    );
    // Easier way: precomputed matrix
    // Rz(32.93) * Rx(62.87) * Rz(192.85) => NO, exact matrix below:
    const eqToGalMat = new THREE.Matrix3();
    eqToGalMat.set(
        -0.054876, -0.873437, -0.483835,
        0.494109, -0.444830,  0.746982,
       -0.867666, -0.198076,  0.455984
    );

    const textureLoader = new THREE.TextureLoader();
    const mwTexture = textureLoader.load('milkyway.png');
    mwTexture.minFilter = THREE.LinearFilter;
    
    window.mwMaterial = new THREE.ShaderMaterial({
        vertexShader: mwVertexShader,
        fragmentShader: mwFragmentShader,
        uniforms: {
            eqToHoriz: starsMaterial.uniforms.eqToHoriz,
            lookAz: starsMaterial.uniforms.lookAz,
            lookEl: starsMaterial.uniforms.lookEl,
            focalLen: starsMaterial.uniforms.focalLen,
            starVisibility: starsMaterial.uniforms.starVisibility,
            eqToGal: { value: eqToGalMat },
            mwMap: { value: mwTexture }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
    
    window.mwMesh = new THREE.Mesh(mwGeo, window.mwMaterial);
    scene.add(window.mwMesh);
`;

code = code.replace(
  /scene\.add\(window\.moonMesh\);/,
  `scene.add(window.moonMesh);
    ${setupMilkyWayCode}`,
);

// Toggle visibility of Milky Way
code = code.replace(
  /if \(window\.eclipticMesh\) window\.eclipticMesh\.visible = toggles\.equator;/,
  `if (window.eclipticMesh) window.eclipticMesh.visible = toggles.ecliptic;
        if (window.mwMesh) window.mwMesh.visible = toggles.milkyway;`,
);

fs.writeFileSync('webgl_engine.js', code);
console.log('webgl_engine.js patched with Milky Way');
