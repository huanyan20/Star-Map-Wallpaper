let scene, camera, renderer;
let starsMaterial;
let fieldStarsGeo, namedStarsGeo;
let fieldStarsMesh, namedStarsMesh;
let starCatalogPromise = null;
let labelFontPromise = null;
let labelLayer = null;
let skyW = 0, skyH = 0;

async function loadStarCatalog() {
    if (starCatalogPromise) return starCatalogPromise;
    starCatalogPromise = fetch('assets/stars.bin')
        .then(resp => {
            if (!resp.ok) throw new Error(`Failed to load assets/stars.bin: ${resp.status}`);
            return resp.arrayBuffer();
        })
        .then(buffer => {
            const header = new DataView(buffer, 0, 32);
            const magic =
                String.fromCharCode(header.getUint8(0)) +
                String.fromCharCode(header.getUint8(1)) +
                String.fromCharCode(header.getUint8(2)) +
                String.fromCharCode(header.getUint8(3));
            if (magic !== 'STRB') throw new Error('Invalid stars.bin magic');
            const version = header.getUint32(4, true);
            if (version !== 1) throw new Error(`Unsupported stars.bin version ${version}`);
            const count = header.getUint32(8, true);
            const positionsOffset = header.getUint32(12, true);
            const magOffset = header.getUint32(16, true);
            const colorOffset = header.getUint32(20, true);
            return {
                count,
                positions: new Float32Array(buffer, positionsOffset, count * 3),
                magnitudes: new Float32Array(buffer, magOffset, count),
                colors: new Uint8Array(buffer, colorOffset, count * 3)
            };
        });
    return starCatalogPromise;
}

async function loadLabelFont() {
    if (labelFontPromise) return labelFontPromise;
    labelFontPromise = Promise.all([
        fetch('assets/labels.json').then(resp => {
            if (!resp.ok) throw new Error(`Failed to load assets/labels.json: ${resp.status}`);
            return resp.json();
        }),
        new Promise((resolve, reject) => {
            new THREE.TextureLoader().load('assets/labels.png', resolve, undefined, reject);
        })
    ]).then(([font, texture]) => {
        texture.flipY = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        return { font, texture };
    });
    return labelFontPromise;
}

function updateSkyGeometry() {
    if (!window.skyMesh || (skyW === window.innerWidth && skyH === window.innerHeight)) return;
    skyW = window.innerWidth;
    skyH = window.innerHeight;
    window.skyMesh.geometry.dispose();
    window.skyMesh.geometry = new THREE.PlaneGeometry(skyW, skyH);
}

async function initWebGL() {
    const [starCatalog, labelFont] = await Promise.all([loadStarCatalog(), loadLabelFont()]);
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
        updateSkyGeometry();
    });

    scene = new THREE.Scene();

    camera = new THREE.OrthographicCamera( -window.innerWidth/2, window.innerWidth/2, window.innerHeight/2, -window.innerHeight/2, 0.1, 1000 );
    camera.position.z = 100;

    setupShaders();
    setupStars(starCatalog);
    setupGrids();
    setupLabelLayer(labelFont);

    const skyVertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const skyFragmentShader = `
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
    `;

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

    skyW = window.innerWidth;
    skyH = window.innerHeight;
    const skyGeo = new THREE.PlaneGeometry(skyW, skyH);
    window.skyMesh = new THREE.Mesh(skyGeo, window.skyMaterial);
    window.skyMesh.position.z = -500; // Far behind stars
    scene.add(window.skyMesh);

}

function setupShaders() {
    const vertexShader = `
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
        varying float vMag;

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
            float twinkleAmp = min(0.8, 0.1 + 0.05 * airMass); 
            float twinkle = 1.0 + twinkleAmp * sin(time * (5.0 + phase * 10.0) + phase * 6.28);
            
            // Perceived magnitude after atmospheric extinction
            float perceivedMag = starMag + 0.15 * airMass; 
            
            // Map magnitude to visual intensity (monitor display compensation)
            // To simulate a "zero light pollution" sky on a monitor, we raise the brightness floor.
            // Mag -1.5 -> ~1.0, Mag 6.5 -> ~0.4
            float baseIntensity = clamp(1.0 - (perceivedMag + 1.5) / 13.0, 0.35, 1.0); 
            float visualIntensity = baseIntensity * twinkle;
            
            vColor = starColor;
            vMag = starMag;
            
            // Alpha mapped to visual intensity
            vAlpha = visualIntensity * clamp(starVisibility * 1.5, 0.0, 1.0);
            
            // Base size + strong halo for bright stars
            // Faint stars are given a minimum size of 1.2px to remain distinctly visible
            float ptSize = max(1.2, visualIntensity * 3.5);
            if (starMag < 3.0) {
                ptSize += pow(max(0.0, 3.0 - starMag), 1.6) * 4.0; 
            }
            ptSize *= clamp(starVisibility * 1.5, 0.1, 1.0);
            
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
            float py = pu * k * focalLen;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(px, py, 0.0, 1.0);
            
            float depthAtten = smoothstep(-0.4, 0.0, depth);
            gl_PointSize = ptSize * depthAtten * (${(window.devicePixelRatio > 1.0 ? 1.5 : 1.0).toFixed(1)});
        }
    `;

    const fragmentShader = `
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDepth;
        varying float vMag;
        void main() {
            if (vDepth < -0.4) discard;
            
            vec2 pt = gl_PointCoord - vec2(0.5);
            float r = length(pt);
            if (r > 0.5) discard;
            
            // Star core
            float core = smoothstep(0.25, 0.05, r);
            
            // Halo for bright stars
            float halo = 0.0;
            if (vMag < 3.0) {
                halo = smoothstep(0.5, 0.1, r) * 0.4;
            }
            
            float alpha = max(core, halo) * vAlpha;
            gl_FragColor = vec4(vColor * alpha, alpha);
        }
    `;

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
        premultipliedAlpha: true,
        blending: THREE.AdditiveBlending
    });

    const gridVertexShader = `
        uniform mat3 eqToHoriz;
        uniform float lookAz;
        uniform float lookEl;
        uniform float focalLen;
        uniform float isHoriz;
        varying float vDepth;
        varying float vSz;
        void main() {
            vec3 eqPos = eqToHoriz * position;
            vec3 horiz = mix(eqPos, position, isHoriz);
            float sx = horiz.x;
            float sy = horiz.y;
            float sz = horiz.z;
            vSz = sz;
            
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
            
            float safeDepth = max(depth, -0.999);
            float k = 2.0 / (1.0 + safeDepth);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pr * k * focalLen, pu * k * focalLen, 0.0, 1.0);
        }
    `;

    const gridFragmentShader = `
        varying float vDepth;
        varying float vSz;
        uniform vec3 lineColor;
        uniform float starVisibility;
        uniform float centerFade;
        uniform float baseAlpha;
        void main() {
            if (vDepth < -0.4) discard;
            if (vSz < -0.05) discard;
            
            float alpha = baseAlpha * starVisibility;
            
            if (centerFade > 0.0) {
                // Fade out lines that are not near the screen center
                // vDepth is cos(angle). 0.95 is ~18 deg, 0.75 is ~41 deg
                // Made more aggressive to display only near the center
                float fade = smoothstep(0.85, 0.98, vDepth);
                alpha *= mix(1.0, fade, centerFade);
                
                // Boost brightness slightly in the very center
                alpha *= mix(1.0, 1.5, smoothstep(0.95, 1.0, vDepth));
            }
            alpha = clamp(alpha, 0.0, 1.0);
            gl_FragColor = vec4(lineColor * alpha, alpha);
        }
    `;
    
    window.createGridMaterial = function(colorHex, isHorizVal, centerFadeVal = 0.0, baseAlphaVal = 0.35) {
        const color = new THREE.Color(colorHex);
        return new THREE.ShaderMaterial({
            vertexShader: gridVertexShader,
            fragmentShader: gridFragmentShader,
            uniforms: {
                eqToHoriz: starsMaterial.uniforms.eqToHoriz,
                lookAz: starsMaterial.uniforms.lookAz,
                lookEl: starsMaterial.uniforms.lookEl,
                focalLen: starsMaterial.uniforms.focalLen,
                starVisibility: starsMaterial.uniforms.starVisibility,
                lineColor: { value: color },
                isHoriz: { value: isHorizVal },
                centerFade: { value: centerFadeVal },
                baseAlpha: { value: baseAlphaVal }
            },
            transparent: true,
            depthWrite: false,
            premultipliedAlpha: true,
            blending: THREE.AdditiveBlending
        });
    };
}

function setupStars(starCatalog) {
    if (starCatalog && starCatalog.count > 0) {
        fieldStarsGeo = new THREE.BufferGeometry();
        fieldStarsGeo.setAttribute('position', new THREE.BufferAttribute(starCatalog.positions, 3));
        fieldStarsGeo.setAttribute('starColor', new THREE.BufferAttribute(starCatalog.colors, 3, true));
        fieldStarsGeo.setAttribute('starMag', new THREE.BufferAttribute(starCatalog.magnitudes, 1));

        fieldStarsMesh = new THREE.Points(fieldStarsGeo, starsMaterial);
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

            // True magnitude, no artificial boost
            mags[i] = mag; 

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

        namedStarsMesh = new THREE.Points(namedStarsGeo, starsMaterial);
        scene.add(namedStarsMesh);
    }

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
        
        window.constellationLinesMaterial = window.createGridMaterial('#a0c8ff', 0.0, 1.0, 0.25);
        
        window.constellationLineMesh = new THREE.LineSegments(lineGeo, window.constellationLinesMaterial);
        scene.add(window.constellationLineMesh);
    }
}

function setupGrids() {
    // 1. Equatorial Grid
    const eqGeo = new THREE.BufferGeometry();
    const eqPos = [];
    for (let dec = -60; dec <= 80; dec += 20) {
        for (let ra = 0; ra <= 24; ra += 0.5) {
            const dec_rad = dec * Math.PI / 180;
            const ra_rad = (ra * 15) * Math.PI / 180;
            eqPos.push(Math.cos(dec_rad) * Math.cos(ra_rad), Math.cos(dec_rad) * Math.sin(ra_rad), Math.sin(dec_rad));
            if (ra > 0 && ra < 24) eqPos.push(Math.cos(dec_rad) * Math.cos(ra_rad), Math.cos(dec_rad) * Math.sin(ra_rad), Math.sin(dec_rad));
        }
    }
    for (let ra = 0; ra < 24; ra += 2) {
        for (let dec = -85; dec <= 85; dec += 5) {
            const dec_rad = dec * Math.PI / 180;
            const ra_rad = (ra * 15) * Math.PI / 180;
            eqPos.push(Math.cos(dec_rad) * Math.cos(ra_rad), Math.cos(dec_rad) * Math.sin(ra_rad), Math.sin(dec_rad));
            if (dec > -85 && dec < 85) eqPos.push(Math.cos(dec_rad) * Math.cos(ra_rad), Math.cos(dec_rad) * Math.sin(ra_rad), Math.sin(dec_rad));
        }
    }
    eqGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(eqPos), 3));
    
    window.eqGridMesh = new THREE.LineSegments(eqGeo, window.createGridMaterial('#ff80a0', 0.0, 0.0, 0.15));
    window.eqGridMesh.visible = false;
    scene.add(window.eqGridMesh);

    // 2. Ecliptic
    const ecGeo = new THREE.BufferGeometry();
    const ecPos = [];
    const eps = 23.439 * Math.PI / 180;
    for (let lambda_deg = 0; lambda_deg <= 360; lambda_deg += 2) {
        const lambda = lambda_deg * Math.PI / 180;
        let ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
        const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
        ecPos.push(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
        if (lambda_deg > 0 && lambda_deg < 360) ecPos.push(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
    }
    ecGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ecPos), 3));
    
    window.eclipticMesh = new THREE.LineSegments(ecGeo, window.createGridMaterial('#ffb040', 0.0, 0.0, 0.15));
    window.eclipticMesh.visible = false;
    scene.add(window.eclipticMesh);

    // 3. Alt-Az Grid (Horizontal coords)
    const azPos = [];
    for (let alt = 0; alt <= 90; alt += 15) {
        for (let az = 0; az <= 360; az += 2) {
            const alt_r = alt * Math.PI / 180, az_r = az * Math.PI / 180;
            const sx = Math.cos(alt_r) * Math.sin(az_r); // East
            const sy = Math.cos(alt_r) * Math.cos(az_r); // North
            const sz = Math.sin(alt_r); // Up
            azPos.push(sx, sy, sz);
            if (az > 0 && az < 360) azPos.push(sx, sy, sz);
        }
    }
    for (let az = 0; az < 360; az += 30) {
        for (let alt = 0; alt <= 90; alt += 2) {
            const alt_r = alt * Math.PI / 180, az_r = az * Math.PI / 180;
            const sx = Math.cos(alt_r) * Math.sin(az_r);
            const sy = Math.cos(alt_r) * Math.cos(az_r);
            const sz = Math.sin(alt_r);
            azPos.push(sx, sy, sz);
            if (alt > 0 && alt < 90) azPos.push(sx, sy, sz);
        }
    }
    const azGeo = new THREE.BufferGeometry();
    azGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(azPos), 3));
    
    window.altAzGridMesh = new THREE.LineSegments(azGeo, window.createGridMaterial('#4880ff', 1.0, 0.0, 0.15));
    window.altAzGridMesh.visible = false;
    scene.add(window.altAzGridMesh);
}

class LabelLayer {
    constructor(font, texture) {
        this.font = font;
        this.texture = texture;
        this.chars = new Map();
        for (const ch of font.chars || []) this.chars.set(ch.id, ch);
        this.scaleBase = font.info && font.info.size ? font.info.size : 48;
        this.lineHeight = font.common && font.common.lineHeight ? font.common.lineHeight : this.scaleBase;
        this.texW = font.common && font.common.scaleW ? font.common.scaleW : texture.image.width;
        this.texH = font.common && font.common.scaleH ? font.common.scaleH : texture.image.height;

        this.geometry = new THREE.BufferGeometry();
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                map: { value: texture },
                opacity: { value: 1.0 }
            },
            vertexShader: `
                attribute vec2 uv2;
                attribute vec3 labelColor;
                attribute float labelAlpha;
                varying vec2 vUv;
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    vUv = uv2;
                    vColor = labelColor;
                    vAlpha = labelAlpha;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D map;
                uniform float opacity;
                varying vec2 vUv;
                varying vec3 vColor;
                varying float vAlpha;
                float median(float r, float g, float b) {
                    return max(min(r, g), min(max(r, g), b));
                }
                void main() {
                    vec3 sampleColor = texture2D(map, vUv).rgb;
                    float signedDistance = median(sampleColor.r, sampleColor.g, sampleColor.b) - 0.5;
                    float sigDistFwidth = length(vec2(dFdx(signedDistance), dFdy(signedDistance)));
                    float screenPxDistance = signedDistance / max(sigDistFwidth, 0.0001);
                    float alpha = clamp(screenPxDistance + 0.5, 0.0, 1.0) * vAlpha * opacity;
                    if (alpha <= 0.01) discard;
                    gl_FragColor = vec4(vColor * alpha, alpha);
                }
            `,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.NormalBlending,
            premultipliedAlpha: true,
            side: THREE.DoubleSide,
            extensions: { derivatives: true }
        });
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 1000;
        scene.add(this.mesh);
    }

    measure(text, scale) {
        let width = 0;
        for (let i = 0; i < text.length;) {
            const code = text.codePointAt(i);
            i += code > 0xffff ? 2 : 1;
            const glyph = this.chars.get(code);
            if (glyph) width += glyph.xadvance * scale;
        }
        return width;
    }

    update(labels) {
        const positions = [];
        const uvs = [];
        const colors = [];
        const alphas = [];
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        for (const label of labels || []) {
            const text = String(label.text || '');
            if (!text) continue;
            const scale = (label.size || 12) / this.scaleBase;
            const width = this.measure(text, scale);
            const lineHeight = this.lineHeight * scale;
            let x = label.x || 0;
            let y = label.y || 0;

            if (label.align === 'center') x -= width * 0.5;
            else if (label.align === 'right') x -= width;

            if (label.baseline === 'middle') y -= lineHeight * 0.5;
            else if (label.baseline === 'bottom') y -= lineHeight;

            const rgb = label.color || [1, 1, 1];
            const alpha = label.alpha == null ? 1 : label.alpha;
            let cursor = x;

            for (let i = 0; i < text.length;) {
                const code = text.codePointAt(i);
                i += code > 0xffff ? 2 : 1;
                const glyph = this.chars.get(code);
                if (!glyph) continue;

                const gx0 = cursor + glyph.xoffset * scale;
                const gy0 = y + glyph.yoffset * scale;
                const gx1 = gx0 + glyph.width * scale;
                const gy1 = gy0 + glyph.height * scale;
                cursor += glyph.xadvance * scale;

                if (gx1 < -100 || gx0 > screenW + 100 || gy1 < -100 || gy0 > screenH + 100) continue;

                const wx0 = gx0 - screenW * 0.5;
                const wy0 = screenH * 0.5 - gy0;
                const wx1 = gx1 - screenW * 0.5;
                const wy1 = screenH * 0.5 - gy1;
                const u0 = glyph.x / this.texW;
                const v0 = glyph.y / this.texH;
                const u1 = (glyph.x + glyph.width) / this.texW;
                const v1 = (glyph.y + glyph.height) / this.texH;

                positions.push(
                    wx0, wy0, 30, wx1, wy0, 30, wx1, wy1, 30,
                    wx0, wy0, 30, wx1, wy1, 30, wx0, wy1, 30
                );
                uvs.push(
                    u0, v0, u1, v0, u1, v1,
                    u0, v0, u1, v1, u0, v1
                );
                for (let v = 0; v < 6; v++) {
                    colors.push(rgb[0], rgb[1], rgb[2]);
                    alphas.push(alpha);
                }
            }
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        this.geometry.setAttribute('uv2', new THREE.BufferAttribute(new Float32Array(uvs), 2));
        this.geometry.setAttribute('labelColor', new THREE.BufferAttribute(new Float32Array(colors), 3));
        this.geometry.setAttribute('labelAlpha', new THREE.BufferAttribute(new Float32Array(alphas), 1));
        this.geometry.computeBoundingSphere();
    }
}

function setupLabelLayer(labelFont) {
    labelLayer = new LabelLayer(labelFont.font, labelFont.texture);
}

function renderWebGL(ts, lst_deg, starVisibility, topRGB, horRGB, hy, screenH, sunCoords, moonCoords, moonPhase, labels) {
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
    
    if (window.skyMaterial && topRGB && horRGB) {
        window.skyMaterial.uniforms.topRGB.value.set(topRGB[0]/255, topRGB[1]/255, topRGB[2]/255);
        window.skyMaterial.uniforms.horRGB.value.set(horRGB[0]/255, horRGB[1]/255, horRGB[2]/255);
        window.skyMaterial.uniforms.hy.value = hy;
        window.skyMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        window.skyMaterial.uniforms.time.value = ts / 1000.0;
        updateSkyGeometry();
    }
    
    if (typeof toggles !== 'undefined') {
        if (window.constellationLineMesh) window.constellationLineMesh.visible = toggles.constellations;
        if (window.eclipticMesh) window.eclipticMesh.visible = toggles.ecliptic;
        if (window.mwMesh) window.mwMesh.visible = toggles.milkyway;
        if (window.eqGridMesh) window.eqGridMesh.visible = toggles.equatorial;
        if (window.altAzGridMesh) window.altAzGridMesh.visible = toggles.grid;
    }
    
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

    if (labelLayer) labelLayer.update(labels || []);
    
    renderer.render(scene, camera);
}

window.initWebGL = initWebGL;
window.renderWebGL = renderWebGL;
window.setupStars = setupStars;
