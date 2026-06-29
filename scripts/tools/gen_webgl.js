const fs = require('fs');

const content = `let scene, camera, renderer;
let starsMaterial;
let fieldStarsGeo, namedStarsGeo;

const LAT_RAD = 25 * Math.PI / 180; // Taipei Latitude

function initWebGL() {
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

    renderer = new THREE.WebGLRenderer({ canvas: webglCanvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    
    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.left = -window.innerWidth/2;
        camera.right = window.innerWidth/2;
        camera.top = window.innerHeight/2;
        camera.bottom = -window.innerHeight/2;
        camera.updateProjectionMatrix();
    });

    scene = new THREE.Scene();

    camera = new THREE.OrthographicCamera( -window.innerWidth/2, window.innerWidth/2, window.innerHeight/2, -window.innerHeight/2, 0.1, 1000 );
    camera.position.z = 100;

    setupShaders();
    setupStars();
}

function setupShaders() {
    const vertexShader = \`
        uniform mat3 eqToHoriz;
        uniform float lookAz;
        uniform float lookEl;
        uniform float focalLen;
        uniform float time;
        uniform float starVisibility;
        
        attribute float starMag;
        attribute vec3 starColor;
        
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDepth;

        // Pseudo-random hash
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            // 1. Equatorial to Horizontal
            vec3 horiz = eqToHoriz * position;
            float sx = horiz.x; // E
            float sy = horiz.y; // N
            float sz = horiz.z; // Up (sin(Altitude))
            
            // Cull stars below horizon to save rendering
            if (sz < -0.1) {
                gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                vDepth = -1.0;
                return;
            }
            
            // Atmospheric Extinction (Air mass X approx 1/sin(Alt))
            float alt = max(0.02, sz);
            float airMass = 1.0 / alt;
            float extinction = exp(-0.15 * airMass); // k = 0.15 mag/airmass roughly
            
            // Scintillation (Twinkling)
            float phase = hash(position.xy);
            // Twinkle more at low altitude (high airMass)
            float twinkleAmp = min(0.8, 0.1 + 0.05 * airMass); 
            float twinkle = 1.0 + twinkleAmp * sin(time * (5.0 + phase * 10.0) + phase * 6.28);
            
            // Brightness calculation
            // Base brightness: magnitude scale
            float brightness = pow(2.512, 3.0 - starMag);
            float finalBrightness = brightness * extinction * twinkle * starVisibility;
            
            vColor = starColor;
            
            // Alpha mapped to brightness
            vAlpha = clamp(finalBrightness * 0.5, 0.1, 1.0);
            
            // Base size
            float ptSize = clamp(log2(finalBrightness + 1.0) * 1.8, 0.5, 6.0);
            
            // 2. Camera View Vectors
            float lx = sin(lookAz) * cos(lookEl);
            float ly = cos(lookAz) * cos(lookEl);
            float lz = sin(lookEl);
            
            float rx = cos(lookAz);
            float ry = -sin(lookAz);
            float rz = 0.0;
            
            float ux = ry * lz - rz * ly;
            float uy = rz * lx - rx * lz;
            float uz = rx * ly - ry * lx;
            
            // 3. Stereographic Projection
            float depth = sx*lx + sy*ly + sz*lz;
            vDepth = depth;
            
            float pr = sx*rx + sy*ry + sz*rz;
            float pu = sx*ux + sy*uy + sz*uz;
            
            float k = 2.0 / (1.0 + depth);
            float px = pr * k * focalLen;
            float py = -pu * k * focalLen;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(px, py, 0.0, 1.0);
            
            float depthAtten = smoothstep(-0.4, 0.0, depth);
            gl_PointSize = ptSize * depthAtten * (window.devicePixelRatio > 1.0 ? 1.5 : 1.0);
        }
    \`;

    const fragmentShader = \`
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDepth;
        void main() {
            if (vDepth < -0.4) discard;
            
            vec2 pt = gl_PointCoord - vec2(0.5);
            float r = length(pt);
            if (r > 0.5) discard;
            
            float alpha = smoothstep(0.5, 0.1, r) * vAlpha;
            gl_FragColor = vec4(vColor, alpha);
        }
    \`;

    starsMaterial = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: {
            eqToHoriz: { value: new THREE.Matrix3() },
            lookAz: { value: Math.PI },
            lookEl: { value: 0 },
            focalLen: { value: 500 },
            time: { value: 0 },
            starVisibility: { value: 1.0 }
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
}

function setupStars() {
    if (typeof REAL_STARS !== 'undefined') {
        const numFieldStars = REAL_STARS.length;
        const positions = new Float32Array(numFieldStars * 3);
        const colors = new Float32Array(numFieldStars * 3);
        const mags = new Float32Array(numFieldStars);

        for (let i = 0; i < numFieldStars; i++) {
            const star = REAL_STARS[i];
            const ra_rad = star[0] * Math.PI / 180;
            const dec_rad = star[1] * Math.PI / 180;
            const mag = star[2];
            const bv = star[3];

            positions[i*3 + 0] = Math.cos(dec_rad) * Math.cos(ra_rad);
            positions[i*3 + 1] = Math.cos(dec_rad) * Math.sin(ra_rad);
            positions[i*3 + 2] = Math.sin(dec_rad);

            mags[i] = mag;

            let r=1.0, g=1.0, b=1.0;
            if(bv < 0.0) { r=0.7; g=0.8; b=1.0; }
            else if(bv < 0.5) { r=0.9; g=0.9; b=1.0; }
            else if(bv < 1.0) { r=1.0; g=0.9; b=0.7; }
            else { r=1.0; g=0.7; b=0.5; }

            colors[i*3 + 0] = r;
            colors[i*3 + 1] = g;
            colors[i*3 + 2] = b;
        }

        fieldStarsGeo = new THREE.BufferGeometry();
        fieldStarsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        fieldStarsGeo.setAttribute('starColor', new THREE.BufferAttribute(colors, 3));
        fieldStarsGeo.setAttribute('starMag', new THREE.BufferAttribute(mags, 1));

        const fieldStarsMesh = new THREE.Points(fieldStarsGeo, starsMaterial);
        scene.add(fieldStarsMesh);
    }

    if (typeof STARS !== 'undefined') {
        const numNamed = STARS.length;
        const positions = new Float32Array(numNamed * 3);
        const colors = new Float32Array(numNamed * 3);
        const mags = new Float32Array(numNamed);

        for (let i = 0; i < numNamed; i++) {
            const star = STARS[i];
            const ra_rad = star.ra * Math.PI / 180;
            const dec_rad = star.dec * Math.PI / 180;
            const mag = star.mag;

            positions[i*3 + 0] = Math.cos(dec_rad) * Math.cos(ra_rad);
            positions[i*3 + 1] = Math.cos(dec_rad) * Math.sin(ra_rad);
            positions[i*3 + 2] = Math.sin(dec_rad);

            // Boost named stars slightly so they stand out
            mags[i] = mag - 0.5; 

            let r=1.0, g=1.0, b=1.0;
            const sp = star.sp ? star.sp.charAt(0) : 'G';
            if (sp==='O' || sp==='B') { r=0.7; g=0.8; b=1.0; }
            else if (sp==='A') { r=0.9; g=0.9; b=1.0; }
            else if (sp==='F') { r=1.0; g=1.0; b=0.9; }
            else if (sp==='K') { r=1.0; g=0.8; b=0.5; }
            else if (sp==='M') { r=1.0; g=0.6; b=0.4; }

            colors[i*3 + 0] = r;
            colors[i*3 + 1] = g;
            colors[i*3 + 2] = b;
        }

        namedStarsGeo = new THREE.BufferGeometry();
        namedStarsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        namedStarsGeo.setAttribute('starColor', new THREE.BufferAttribute(colors, 3));
        namedStarsGeo.setAttribute('starMag', new THREE.BufferAttribute(mags, 1));

        const namedStarsMesh = new THREE.Points(namedStarsGeo, starsMaterial);
        scene.add(namedStarsMesh);
    }
}

function renderWebGL(ts, lst_deg, starVisibility) {
    const lst_rad = lst_deg * Math.PI / 180;
    const sinL = Math.sin(LAT_RAD);
    const cosL = Math.cos(LAT_RAD);
    const sinLST = Math.sin(lst_rad);
    const cosLST = Math.cos(lst_rad);
    
    const m = new THREE.Matrix3();
    m.set(
        -sinLST, cosLST, 0,
        -sinL*cosLST, -sinL*sinLST, cosL,
        cosL*cosLST, cosL*sinLST, sinL
    );
    
    starsMaterial.uniforms.eqToHoriz.value.copy(m);
    starsMaterial.uniforms.lookAz.value = lookAz;
    starsMaterial.uniforms.lookEl.value = lookEl;
    starsMaterial.uniforms.focalLen.value = focalLen();
    starsMaterial.uniforms.time.value = ts / 1000.0;
    starsMaterial.uniforms.starVisibility.value = typeof starVisibility !== "undefined" ? starVisibility : 1.0;
    
    renderer.render(scene, camera);
}

window.initWebGL = initWebGL;
window.renderWebGL = renderWebGL;
window.setupStars = setupStars;
`;

fs.writeFileSync('webgl_engine.js', content, 'utf8');
