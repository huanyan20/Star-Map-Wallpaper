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

const STAR_CHUNKS = [
    { url: 'assets/stars_chunk_1.bin', maxFov: 60 * Math.PI / 180, loaded: false, promise: null, pointsMesh: null },
    { url: 'assets/stars_chunk_2.bin', maxFov: 30 * Math.PI / 180, loaded: false, promise: null, pointsMesh: null }
];

async function loadStarChunk(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to load ${url}: ${resp.status}`);
    const buffer = await resp.arrayBuffer();
    const header = new DataView(buffer, 0, 32);
    const magic =
        String.fromCharCode(header.getUint8(0)) +
        String.fromCharCode(header.getUint8(1)) +
        String.fromCharCode(header.getUint8(2)) +
        String.fromCharCode(header.getUint8(3));
    if (magic !== 'STRB') throw new Error(`Invalid magic in ${url}`);
    const count = header.getUint32(8, true);
    const positionsOffset = header.getUint32(12, true);
    const magOffset = header.getUint32(16, true);
    const colorOffset = header.getUint32(20, true);
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buffer, positionsOffset, count * 3), 3));
    geo.setAttribute('starMag', new THREE.BufferAttribute(new Float32Array(buffer, magOffset, count), 1));
    geo.setAttribute('starColor', new THREE.BufferAttribute(new Uint8Array(buffer, colorOffset, count * 3), 3, true));
    return geo;
}

window.updateStarLOD = function(hFOV) {
    if (!scene || !starsMaterial) return;
    for (const chunk of STAR_CHUNKS) {
        if (hFOV <= chunk.maxFov) {
            if (!chunk.loaded && !chunk.promise) {
                // Not loaded, fetch it
                chunk.promise = loadStarChunk(chunk.url).then(geo => {
                    chunk.pointsMesh = new THREE.Points(geo, starsMaterial);
                    chunk.pointsMesh.renderOrder = fieldStarsMesh ? fieldStarsMesh.renderOrder : 0;
                    scene.add(chunk.pointsMesh);
                    chunk.loaded = true;
                }).catch(e => {
                    console.error("Failed to load LOD chunk:", chunk.url, e);
                    chunk.promise = null; // retry possible
                });
            } else if (chunk.loaded && chunk.pointsMesh) {
                chunk.pointsMesh.visible = true;
            }
        } else {
            if (chunk.loaded && chunk.pointsMesh) {
                chunk.pointsMesh.visible = false;
            }
        }
    }
};

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



function setupOcean() {
    const size = 2.0; // LOD exponential mapping in shader
    const segments = 512; // High resolution for central area
    const oceanGeo = new THREE.PlaneGeometry(size, size, segments, segments);
    
    const oceanVertexShader = `
        uniform float lookAz;
        uniform float lookEl;
        uniform float focalLen;
        uniform float time;
        
        varying float vAlpha;
        varying vec3 vWorldPos;
        varying float vDepth;
        varying vec3 vNormal;
        varying vec2 vScreenUv;
        
        // Pre-computed constants for 8 Gerstner waves (7 active + 1 dummy)
        const vec4 wave_dx[2] = vec4[2](vec4(0.80000, -0.70207, 0.40240, -0.84800), vec4(0.95067, -0.19996, 0.60000, 1.00000));
        const vec4 wave_dy[2] = vec4[2](vec4(0.60000, 0.71210, -0.91546, -0.53000), vec4(0.31022, 0.97980, -0.80000, 0.00000));
        const vec4 wave_k[2]  = vec4[2](vec4(0.04103, 0.06450, 0.10162, 0.16375), vec4(0.26500, 0.42947, 0.69274, 6.28319));
        const vec4 wave_c[2]  = vec4[2](vec4(15.45444, 12.32608, 9.82025, 7.73605), vec4(6.08119, 4.77689, 3.76120, 1.24889));
        const vec4 wave_a[2]  = vec4[2](vec4(0.29246, 0.24805, 0.19681, 0.14656), vec4(0.10566, 0.07451, 0.05197, 0.00000));
        const vec4 wave_wa[2] = vec4[2](vec4(0.01200, 0.01600, 0.02000, 0.02400), vec4(0.02800, 0.03200, 0.03600, 0.00000));

        void evaluateWaves(vec2 p, float t, out vec3 dP, inout vec3 tangent, inout vec3 binormal) {
            dP = vec3(0.0);
            for (int i = 0; i < 2; i++) {
                vec4 f = wave_k[i] * (wave_dx[i] * p.x + wave_dy[i] * p.y - wave_c[i] * t);
                vec4 sinf = sin(f);
                vec4 cosf = cos(f);
                
                vec4 a_cosf = wave_a[i] * cosf;
                vec4 a_sinf = wave_a[i] * sinf;
                vec4 wa_sinf = wave_wa[i] * sinf;
                vec4 wa_cosf = wave_wa[i] * cosf;

                dP.x += dot(wave_dx[i], a_cosf);
                dP.y += dot(wave_dy[i], a_cosf);
                dP.z += dot(vec4(1.0), a_sinf);

                tangent.x -= dot(wave_dx[i] * wave_dx[i], wa_sinf);
                tangent.y -= dot(wave_dx[i] * wave_dy[i], wa_sinf);
                tangent.z += dot(wave_dx[i], wa_cosf);

                binormal.x -= dot(wave_dx[i] * wave_dy[i], wa_sinf);
                binormal.y -= dot(wave_dy[i] * wave_dy[i], wa_sinf);
                binormal.z += dot(wave_dy[i], wa_cosf);
            }
        }

        void main() {
            // LOD 指數映射：中心點網格極度密集，邊緣向外延伸至 20000 單位，完全消除切邊
            vec2 gridPos = sign(position.xy) * pow(abs(position.xy), vec2(4.0)) * 20000.0;
            vec3 P = vec3(gridPos, -2.2);
            vec3 dP = vec3(0.0);
            
            vec3 tangent = vec3(1.0, 0.0, 0.0);
            vec3 binormal = vec3(0.0, 1.0, 0.0);
            float scale = 0.08; // 縮小波浪高度，使其視覺上不超過地平線
            
            // 8 Gerstner waves with irrational wavelengths and diverse directions to break repetition
            float waveTime = time * 0.4; // 讓大波紋慢一點
            
            // 空間扭曲：利用低頻正弦波稍微扭曲世界座標，讓大波浪不那麼筆直，打破網格規律
            vec2 warpedPos = gridPos;
            warpedPos.x += sin(gridPos.y * 0.02 + waveTime * 0.5) * 15.0;
            warpedPos.y += cos(gridPos.x * 0.02 + waveTime * 0.5) * 15.0;
            
            // SIMD Vectorized evaluation of 8 waves (7 active, 1 dummy)
            evaluateWaves(warpedPos, waveTime, dP, tangent, binormal);
            
            // 幾何衰減：讓遠處的波浪完全平息，避免巨大的三角形邊緣翹起導致地平線出現鋸齒凸出
            float distFromCenter = length(gridPos);
            float waveGeomAttenuation = 1.0 - smoothstep(500.0, 3000.0, distFromCenter);
            
            P += dP * waveGeomAttenuation;
            vWorldPos = P;
            
            // 法線同樣隨著距離平滑過渡到完全水平，避免遠方光影閃爍
            vec3 computedNormal = normalize(cross(tangent, binormal));
            vNormal = normalize(mix(vec3(0.0, 0.0, 1.0), computedNormal, waveGeomAttenuation));
            
            vec3 horiz = normalize(P);
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
            
            if (depth < -0.99) {
                gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                vAlpha = 0.0;
                return;
            }
            
            float pr = sx*rx + sy*ry + sz*rz;
            float pu = sx*ux + sy*uy + sz*uz;
            
            float k = 2.0 / (1.0 + depth);
            float px = pr * k * focalLen;
            float py = pu * k * focalLen;
            
            float distSq = dot(gridPos, gridPos);
            vAlpha = 1.0; // 取消邊緣淡出，讓海面的真實反射無限延伸至地平線
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(px, py, 0.0, 1.0);
            vScreenUv = (gl_Position.xy / gl_Position.w) * 0.5 + 0.5;
        }
    `;

    const oceanFragmentShader = `
        uniform vec3 horRGB;
        uniform float time;
        uniform float lookEl;
        uniform vec2 resolution;
        uniform float lookAz;
        uniform float focalLen;
        uniform vec3 lightDir;
        uniform float lightIntensity;
        uniform vec3 lightColor;
        varying float vAlpha;
        varying vec3 vWorldPos;
        varying float vDepth;
        varying vec3 vNormal;
        varying vec2 vScreenUv;
        
        // Hash function for noise
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        // Value noise
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix( mix( hash( i + vec2(0.0,0.0) ), 
                             hash( i + vec2(1.0,0.0) ), u.x),
                        mix( hash( i + vec2(0.0,1.0) ), 
                             hash( i + vec2(1.0,1.0) ), u.x), u.y);
        }

        // Fractional Brownian Motion (3 octaves)
        float fbm(vec2 p) {
            float f = 0.0;
            float w = 0.5;
            for (int i = 0; i < 3; i++) {
                f += w * noise(p);
                p *= 2.0;
                w *= 0.5;
            }
            return f;
        }
        
        void main() {
            if (vDepth < -0.99 || vAlpha < 0.01) discard;
            
            vec3 N = normalize(vNormal);
            float dist = length(vWorldPos);
            vec3 V = normalize(-vWorldPos);
            
            // 距離衰減 (Distance Attenuation) 提早平息細節波紋，防止極遠處（最大視角時）產生高頻摩爾紋與鋸齒閃爍
            float bumpDistAttenuation = 1.0 - smoothstep(200.0, 1500.0, dist);
            
            if (bumpDistAttenuation > 0.0) {
                // 1. Procedural Flow Mapping
                // 用 FBM 產生緩慢變化的流體向量場
                vec2 flowDir = vec2(fbm(vWorldPos.xy * 0.02), fbm(vWorldPos.xy * 0.02 + vec2(10.0))) * 2.0 - 1.0;
                flowDir = normalize(flowDir) * 0.8; // 流動強度
                
                // 相位循環 (Phase-based Looping)
                float flowCycleTime = 16.0; // 循環變慢，讓大流動變慢
                float phase0 = fract(time / flowCycleTime);
                float phase1 = fract(time / flowCycleTime + 0.5);
                float flowLerp = abs((0.5 - phase0) * 2.0); // 三角波 0 -> 1 -> 0
                
                // 定義受流動影響的兩組 UV (針對兩個 Phase)
                // 為了讓波紋有層次，我們在每個 phase 疊加兩層 (Dual Normal) 
                float timeScale = 1.0; // 降低細碎波紋的滑動速度
                float flowDistortion = 15.0; // 放大 Flow Map 造成的流動推擠範圍
                
                // Phase 0
                vec2 flowUv0_A = vWorldPos.xy * 1.5 + flowDir * phase0 * flowDistortion + vec2(time * 0.4, time * 0.3) * timeScale;
                vec2 flowUv0_B = vWorldPos.xy * 2.5 + flowDir * phase0 * flowDistortion - vec2(time * 0.3, time * 0.5) * timeScale;
                vec3 bump0 = vec3(fbm(flowUv0_A) - 0.5, fbm(flowUv0_B) - 0.5, 0.0) * 0.6;
                bump0 += vec3(fbm(flowUv0_B + vec2(0.2)) - 0.5, fbm(flowUv0_A - vec2(0.2)) - 0.5, 0.0) * 0.4;
                
                // Phase 1
                vec2 flowUv1_A = vWorldPos.xy * 1.5 + flowDir * phase1 * flowDistortion + vec2(time * 0.4, time * 0.3) * timeScale;
                vec2 flowUv1_B = vWorldPos.xy * 2.5 + flowDir * phase1 * flowDistortion - vec2(time * 0.3, time * 0.5) * timeScale;
                vec3 bump1 = vec3(fbm(flowUv1_A) - 0.5, fbm(flowUv1_B) - 0.5, 0.0) * 0.6;
                bump1 += vec3(fbm(flowUv1_B + vec2(0.2)) - 0.5, fbm(flowUv1_A - vec2(0.2)) - 0.5, 0.0) * 0.4;
                
                // 混和兩個 Phase 的波紋
                vec3 finalBump = mix(bump0, bump1, flowLerp) * 1.2 * bumpDistAttenuation; // 放大小波紋的法線起伏 (0.35 -> 1.2)
                N = normalize(N + finalBump);
            }
            
            float cosTheta = clamp(dot(V, N), 0.0, 1.0);
            
            // Fresnel (Schlick's approximation)
            float R0 = 0.02; // Water reflection coefficient
            float R = R0 + (1.0 - R0) * pow(1.0 - cosTheta, 5.0);
            
            // 水體本身顏色 (次表面散射近似 Subsurface Scattering)
            // 為了配合新的法線，加強水體的深邃感
            vec3 deepWater = vec3(0.005, 0.015, 0.05);
            vec3 shallowWater = vec3(0.0, 0.08, 0.15); 
            
            float waveHeight = max(0.0, vWorldPos.z + 2.2);
            vec3 waterBody = mix(deepWater, shallowWater, waveHeight * 1.8);
            
            // 視線平坦：反射星空 (使用地平線顏色)
            vec3 skyReflection = horRGB * 1.1 + vec3(0.02, 0.03, 0.06); 
            
            // 根據 Fresnel 反射率混合水體與天空反射
            vec3 waterColor = mix(waterBody, skyReflection, R);
            
            // 2. Specular Glint (鏡面閃爍高光)
            float specular = 0.0;
            if (lightIntensity > 0.0) {
                vec3 halfVector = normalize(lightDir + V);
                float NdotH = max(0.0, dot(N, halfVector));
                
                // 高光緊縮程度
                float shininess = 300.0; 
                specular = pow(NdotH, shininess) * lightIntensity;
                
                // 星點閃爍雜訊 (在波浪尖端產生微小晶瑩亮點)
                float glintNoise = hash(floor(vWorldPos.xy * 80.0) + time * 2.0); // 隨時間閃動的高頻雜訊
                specular *= (0.2 + glintNoise * 0.8);
                
                // 使用 bumpDistAttenuation 使遠處不要出現過度雜訊的高光
                specular *= bumpDistAttenuation * 0.8; 
                
                // 疊加光源顏色
                waterColor += specular * lightColor;
            }
            
            // 邊緣變暗處理
            float px = (vScreenUv.x - 0.5) * resolution.x;
            float py = (vScreenUv.y - 0.5) * resolution.y;
            float R2 = px*px + py*py;
            float rho2 = R2 / (4.0 * max(focalLen * focalLen, 0.001));
            float scrDepth = (1.0 - rho2) / (1.0 + rho2);
            float k = 1.0 + rho2;
            float pr = px / (k * focalLen);
            float pu = py / (k * focalLen);
            
            float lx = sin(lookAz) * cos(lookEl);
            float ly = cos(lookAz) * cos(lookEl);
            float lz = sin(lookEl);
            float rx = cos(lookAz);
            float ry = -sin(lookAz);
            float rz = 0.0;
            float ux = ry * lz - rz * ly;
            float uy = rz * lx - rx * lz;
            float uz = rx * ly - ry * lx;
            
            float exactSz = scrDepth * lz + pr * rz + pu * uz;
            
            float darken = clamp(1.0 + exactSz, 0.0, 1.0);
            waterColor *= mix(0.1, 1.0, darken);
            
            // 漸進成全黑透明，以顯示地平線下的星星
            // 視角往上時 (lookEl >= 0) 不顯示黑洞，保持波紋
            // 視角往下時 (lookEl < 0) 世界正下方(sz接近-1)最黑，往上漸變
            float baseHole = smoothstep(-0.95, -0.5, exactSz);
            float holeIntensity = clamp(-lookEl * 2.0, 0.0, 1.0);
            float lookDownAlpha = mix(1.0, baseHole, holeIntensity);
            
            // 讓黑洞區域變為純黑而不是透明，避免透出網頁背景色，星空會藉由 Additive Blending 正常顯示
            gl_FragColor = vec4(waterColor * lookDownAlpha * vAlpha, vAlpha);
        }
    `;

    window.oceanMaterial = new THREE.ShaderMaterial({
        vertexShader: oceanVertexShader,
        fragmentShader: oceanFragmentShader,
        uniforms: {
            horRGB: { value: new THREE.Vector3() },
            time: { value: 0 },
            lookAz: { value: 0 },
            lookEl: { value: 0 },
            focalLen: { value: 500 },
            resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            lightDir: { value: new THREE.Vector3(0, 0, 1) },
            lightIntensity: { value: 0.0 },
            lightColor: { value: new THREE.Vector3(0.8, 0.9, 1.0) }
        },
        transparent: true,
        depthWrite: false
    });

    window.oceanMesh = new THREE.Mesh(oceanGeo, window.oceanMaterial);
    window.oceanMesh.renderOrder = -10;
    scene.add(window.oceanMesh);
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

    // 開啟色調映射 (Tone Mapping) 讓恆星的高光與背景對比更柔和真實
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.left = -window.innerWidth / 2;
        camera.right = window.innerWidth / 2;
        camera.top = window.innerHeight / 2;
        camera.bottom = -window.innerHeight / 2;
        camera.updateProjectionMatrix();
        updateSkyGeometry();
        if (window.skyMaterial && window.skyMaterial.uniforms.resolution) {
            window.skyMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        }
        if (window.oceanMaterial && window.oceanMaterial.uniforms.resolution) {
            window.oceanMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        }
    });

    scene = new THREE.Scene();

    camera = new THREE.OrthographicCamera(-window.innerWidth / 2, window.innerWidth / 2, window.innerHeight / 2, -window.innerHeight / 2, 0.1, 1000);
    camera.position.z = 100;

    setupShaders();
    setupStars(starCatalog);
    setupGrids();
    setupLabelLayer(labelFont);
    setupOcean();
    if (window.setupMoon) window.setupMoon();

    const skyVertexShader = `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;

    const skyFragmentShader = `
        uniform vec3 topRGB;
        uniform vec3 midRGB;
        uniform vec3 horRGB;
        uniform float hy;
        uniform vec2 resolution;
        uniform float time;
        uniform float lookAz;
        uniform float lookEl;
        uniform float focalLen;
        varying vec2 vUv;

        // Simple noise
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            // Inverse Stereographic Projection to find Altitude (sz)
            float px = (vUv.x - 0.5) * resolution.x;
            float py = (vUv.y - 0.5) * resolution.y;
            float R2 = px*px + py*py;
            float rho2 = R2 / (4.0 * max(focalLen * focalLen, 0.001));
            float depth = (1.0 - rho2) / (1.0 + rho2);
            float k = 1.0 + rho2;
            float pu = py / (k * focalLen);
            
            // Reconstruct view vectors (optimized: Azimuth cancels out for Z component)
            // sz is the Z component in horizontal coordinates (sin(Altitude))
            float sz = depth * sin(lookEl) + pu * cos(lookEl);
            
            if (sz >= -0.015) { // Add a tiny margin below horizon for blending
                // Map altitude (sz from 0 to 1) to colors
                float alt = clamp(sz, 0.0, 1.0);
                vec3 color;
                if (alt < 0.25) {
                    float t = alt / 0.25;
                    t = pow(t, 0.65); // Ease-out curve for wider horizon glow
                    color = mix(horRGB, midRGB, t);
                } else {
                    float t = (alt - 0.25) / 0.75;
                    color = mix(midRGB, topRGB, t);
                }
                
                // Subtle dither to reduce banding
                color += (hash(vUv * time) - 0.5) * 0.015;
                
                gl_FragColor = vec4(color, 1.0);
            } else {
                // Ocean Base Background (will be covered by 3D ocean mesh)
                vec3 baseWater = horRGB * 0.3 + vec3(0.0, 0.05, 0.1);
                float darken = clamp(1.0 + sz, 0.0, 1.0);
                baseWater *= mix(0.1, 1.0, darken);
                
                // 漸進成全黑透明，以顯示地平線下的星星
                // 視角往上時 (lookEl >= 0) 不顯示黑洞，保持背景
                // 視角往下時 (lookEl < 0) 世界正下方(sz接近-1)最黑，往上漸變
                float baseHole = smoothstep(-0.95, -0.5, sz);
                float holeIntensity = clamp(-lookEl * 2.0, 0.0, 1.0);
                float lookDownAlpha = mix(1.0, baseHole, holeIntensity);
                
                // 天空背景的 Alpha 永遠為 1.0，防止網頁底色外漏。星空會藉由 Additive Blending 疊加在純黑之上
                gl_FragColor = vec4(baseWater * lookDownAlpha, 1.0);
            }
        }
    `;

    window.skyMaterial = new THREE.ShaderMaterial({
        vertexShader: skyVertexShader,
        fragmentShader: skyFragmentShader,
        uniforms: {
            topRGB: { value: new THREE.Vector3() },
            midRGB: { value: new THREE.Vector3() },
            horRGB: { value: new THREE.Vector3() },
            hy: { value: 0 },
            resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            time: { value: 0 },
            lookAz: { value: 0 },
            lookEl: { value: 0 },
            focalLen: { value: 500 }
        },
        depthWrite: false,
        transparent: true
    });

    skyW = window.innerWidth;
    skyH = window.innerHeight;
    const skyGeo = new THREE.PlaneGeometry(skyW, skyH);
    window.skyMesh = new THREE.Mesh(skyGeo, window.skyMaterial);
    window.skyMesh.position.z = -500; // Far behind stars
    window.skyMesh.renderOrder = -20; // 確保在海面 (-10) 之前繪製
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
        uniform float dpr;
        
        attribute float starMag;
        attribute vec3 starColor;
        
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDepth;
        varying float vMag;
        varying float vAirMass;
        varying vec2 vPosHash;
        varying float vPtRatio;

        void main() {
            // 1. Equatorial to Horizontal
            vec3 horiz = eqToHoriz * position;
            float sx = horiz.x; // E
            float sy = horiz.y; // N
            float sz = horiz.z; // Up (sin(Altitude))
            
            // Advanced Air mass (Rozenberg approximation for horizon)
            // Use abs(sz) so stars below horizon also get airmass correctly
            float alt = max(0.001, abs(sz));
            // Rozenberg airmass: 1 / (sin(alt) + 0.025 * exp(-11.0 * sin(alt)))
            float airMass = 1.0 / (alt + 0.025 * exp(-11.0 * alt));
            vAirMass = airMass;
            vPosHash = position.xy;
            
            // Perceived magnitude after atmospheric extinction
            // Extinction coefficient roughly 0.15 for visual magnitudes at zenith
            float perceivedMag = starMag + 0.15 * airMass;
            
            // Map magnitude to visual intensity (monitor display compensation)
            // 縮小星等間的亮度差距，提高暗星最低亮度 (0.35 -> 0.55)
            float baseIntensity = clamp(1.0 - (perceivedMag + 1.5) / 13.0, 0.55, 1.0); 
            
            vColor = starColor;
            vMag = starMag;
            
            // Alpha mapped to visual intensity (twinkle is applied in fragment shader)
            vAlpha = baseIntensity * clamp(starVisibility * 1.8, 0.0, 1.0); // 提升整體透明度基準
            
            // Base size + strong halo for bright stars
            float zoomScale = focalLen / 500.0;
            // 稍微放大基礎星星尺寸，讓暗星在 1080p 有足夠像素能亮起 (2.5 -> 3.5)
            float ptSize = max(5.5, baseIntensity * 5.0) * pow(zoomScale, 0.3);
            if (starMag < 3.0) {
                // 減少亮星尺寸擴張，縮小與暗星的體積差距
                ptSize += pow(max(0.0, 3.0 - starMag), 1.5) * 1.5 * pow(zoomScale, 0.9); 
            }
            ptSize *= clamp(starVisibility * 2.5, 0.3, 1.2);
            
            // 2. Camera View Vectors
            float lx = sin(lookAz) * cos(lookEl);
            float ly = cos(lookAz) * cos(lookEl);
            float lz = sin(lookEl);
            
            float rx = cos(lookAz);
            float ry = -sin(lookAz);
            
            float ux = ry * lz;
            float uy = -rx * lz;
            float uz = cos(lookEl);
            
            // 3. Stereographic Projection
            float depth = sx*lx + sy*ly + sz*lz;
            vDepth = depth;
            
            float pr = sx*rx + sy*ry;
            float pu = sx*ux + sy*uy + sz*uz;
            
            float k = 2.0 / (1.0 + depth);
            float px = pr * k * focalLen;
            float py = pu * k * focalLen;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(px, py, 0.0, 1.0);
            
            float depthAtten = smoothstep(-0.4, 0.0, depth);
            float exactPtSize = ptSize * depthAtten * dpr;
            
            // Pad point size to prevent hardware clipping and integer-snapping flickering
            float paddedSize = ceil(exactPtSize) + 4.0;
            
            // Pass the ratio to fragment shader so we can un-scale the UVs
            vPtRatio = paddedSize / max(exactPtSize, 0.0001);
            
            gl_PointSize = paddedSize;
        }
    `;

    const fragmentShader = `
        uniform float time;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDepth;
        varying float vMag;
        varying float vAirMass;
        varying vec2 vPosHash;
        varying float vPtRatio;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        float noise(vec2 p, float t) {
            float phase = hash(p);
            // fBm-like oscillation
            float n1 = sin(t * (5.0 + phase * 10.0) + phase * 6.28);
            float n2 = sin(t * (11.0 + phase * 15.0) - phase * 3.14) * 0.5;
            return (n1 + n2) / 1.5;
        }

        void main() {
            if (vDepth < -0.4) discard;
            
            vec2 pt = gl_PointCoord - vec2(0.5);
            // Un-scale the padded point size back to the exact math radius
            float r = length(pt) * vPtRatio;
            
            if (r > 0.5) discard;
            
            // Chromatic Scintillation (Twinkling)
            // Higher airmass = more scintillation. Bright stars show more color shifts.
            float twinkleAmp = min(0.8, 0.1 + 0.08 * vAirMass); 
            float tNoise1 = noise(vPosHash, time);
            float tNoise2 = noise(vPosHash + vec2(1.0), time * 1.1); // Slightly offset for color
            float twinkle = 1.0 + twinkleAmp * tNoise1;
            
            // Subtle color shift for bright stars twinkling at low altitude
            vec3 twinkleColorShift = vec3(1.0);
            if (vMag < 2.0 && vAirMass > 2.0) {
                twinkleColorShift += vec3(tNoise2, -tNoise2 * 0.5, -tNoise2) * 0.3 * twinkleAmp;
            }
            
            // Advanced Atmospheric Reddening (Extinction)
            // RGB wavelengths scatter differently (Rayleigh). Blue scatters most (larger coeff).
            vec3 extinctionColor = exp(-vec3(0.10, 0.15, 0.25) * vAirMass);
            
            // Boost saturation to make star colors more distinguishable
            vec3 lumaBase = vec3(dot(vColor, vec3(0.299, 0.587, 0.114)));
            vec3 saturatedColor = mix(lumaBase, vColor, 1.8); // Enhance color saturation
            
            vec3 finalColor = saturatedColor * extinctionColor * twinkleColorShift;
            
            // Purkinje Effect (Desaturation for dim stars)
            // Human eye rod cells don't see color for dim objects
            // Adjusted threshold so colors are visible for more stars
            float desatFactor = smoothstep(2.0, 6.0, vMag); // Stars dimmer than mag 2 start losing color
            vec3 luma = vec3(dot(finalColor, vec3(0.299, 0.587, 0.114)));
            // Shift towards a slight bluish-grey (scotopic vision peak sensitivity)
            vec3 nightColor = luma * vec3(0.8, 0.9, 1.0);
            finalColor = mix(finalColor, nightColor, desatFactor * 0.6); // Cap maximum desaturation at 60%
            
            // Stellarium-style Point Spread Function (PSF)
            // 高光核心 (Highlight Core)
            // 核心衰減放緩 (40.0 -> 30.0)，讓暗星光芒能覆蓋周邊像素，避免在 1080p 螢幕因為子像素而消失
            float core = exp(-r * 25.0) * 1.5;
            
            // 巨大柔和邊緣 (Large Soft Halo) + 十字星芒 (Cross Lens Flare)
            float halo = 0.0;
            float flare = 0.0;
            if (vMag < 3.0) {
                float intensity = clamp(3.0 - vMag, 0.0, 3.0);
                // 再次縮小光暈範圍與強度
                halo = exp(-r * 12.0) * 0.05 * intensity;
                halo += exp(-r * 8.0) * 0.03 * intensity; 
                
                // 十字星芒 (Lens Flare)
                // 尖銳的十字形狀：更短 (6.0 -> 10.0)、更細 (60.0 -> 80.0)，並進一步降低亮度 (0.1 -> 0.06)
                float crossX = exp(-abs(pt.x) * 70.0) * exp(-abs(pt.y) * 9.0);
                float crossY = exp(-abs(pt.y) * 70.0) * exp(-abs(pt.x) * 9.0);
                flare = (crossX + crossY) * 0.09 * intensity;
            }
            
            // Combine with distance to center mask
            float mask = 1.0 - smoothstep(0.45, 0.5, r);
            float alpha = (core + halo + flare) * vAlpha * twinkle * 1.5 * mask;
            
            gl_FragColor = vec4(finalColor * alpha, alpha);
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
            starVisibility: { value: 1.0 },
            dpr: { value: window.devicePixelRatio || 1.0 }
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
        
        attribute vec2 uv2;
        attribute vec3 midPos;
        
        varying float vDepth;
        varying float vMidDepth;
        varying float vSz;
        varying vec2 vUv;
        
        void main() {
            vUv = uv2;
            
            vec3 eqPos = eqToHoriz * position;
            vec3 horiz = mix(eqPos, position, isHoriz);
            
            vec3 eqMid = eqToHoriz * midPos;
            vec3 horizMid = mix(eqMid, midPos, isHoriz);
            
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
            
            float midDepth = horizMid.x*lx + horizMid.y*ly + horizMid.z*lz;
            vMidDepth = midDepth;
            
            float pr = sx*rx + sy*ry + sz*rz;
            float pu = sx*ux + sy*uy + sz*uz;
            
            float safeDepth = max(depth, -0.999);
            float k = 2.0 / (1.0 + safeDepth);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pr * k * focalLen, pu * k * focalLen, 0.0, 1.0);
        }
    `;

    const gridFragmentShader = `
        varying float vDepth;
        varying float vMidDepth;
        varying float vSz;
        varying vec2 vUv;
        
        uniform vec3 lineColor;
        uniform float starVisibility;
        uniform float centerFade;
        uniform float baseAlpha;
        
        void main() {
            if (vDepth < -0.4) discard;
            if (vSz < -0.05) discard;
            
            float u = vUv.x;
            float v = vUv.y;
            
            // Dashing logic (2 dashes per segment)
            if (fract(u * 2.0) > 0.5) discard;
            
            // Anti-aliased outer edge (constant width)
            float dist = abs(v);
            float pixels_per_v = 1.0 / max(fwidth(v), 0.0001);
            float pixel_dist = dist * pixels_per_v;
            
            float lineWidthPixels = 0.8;
            float alphaMask = 1.0 - smoothstep(max(0.0, lineWidthPixels - 0.75), lineWidthPixels + 0.75, pixel_dist);
            
            float alpha = baseAlpha * starVisibility * alphaMask;
            
            if (centerFade > 0.0) {
                float fade = smoothstep(0.85, 0.98, vDepth);
                alpha *= mix(1.0, fade, centerFade);
                alpha *= mix(1.0, 1.5, smoothstep(0.95, 1.0, vDepth));
            }
            
            alpha = clamp(alpha, 0.0, 1.0);
            if (alpha <= 0.01) discard;
            
            gl_FragColor = vec4(lineColor * alpha, alpha);
        }
    `;

    const spindleVertexShader = `
        uniform mat3 eqToHoriz;
        uniform float lookAz;
        uniform float lookEl;
        uniform float focalLen;
        
        attribute vec2 uv2;
        attribute vec3 midPos;
        varying float vDepth;
        varying float vMidDepth;
        varying vec2 vUv;
        
        void main() {
            vUv = uv2;
            vec3 eqPos = eqToHoriz * position;
            vec3 eqMid = eqToHoriz * midPos;
            
            float sx = eqPos.x;
            float sy = eqPos.y;
            float sz = eqPos.z;
            
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
            
            float midDepth = eqMid.x*lx + eqMid.y*ly + eqMid.z*lz;
            vMidDepth = midDepth;
            
            float pr = sx*rx + sy*ry + sz*rz;
            float pu = sx*ux + sy*uy + sz*uz;
            
            float safeDepth = max(depth, -0.999);
            float k = 2.0 / (1.0 + safeDepth);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pr * k * focalLen, pu * k * focalLen, 0.0, 1.0);
        }
    `;

    const spindleFragmentShader = `
        varying float vDepth;
        varying float vMidDepth;
        varying vec2 vUv;
        
        uniform vec3 lineColor;
        uniform float starVisibility;
        uniform float baseAlpha;
        uniform float centerFade;
        
        void main() {
            if (vDepth < -0.4) discard;
            
            float u = vUv.x; 
            float v = vUv.y; 
            
            // Dynamic extension based on distance to screen center
            float lineProgress = smoothstep(0.85, 0.98, vMidDepth);
            lineProgress = lineProgress * 1.05; // allow full draw
            
            float reveal = 1.0 - smoothstep(lineProgress - 0.05, lineProgress, u);
            if (reveal <= 0.0) discard;
            
            // Spindle shape: max width at u=0.5, zero at u=0 and u=1
            float shapeWidth = sin(u * 3.14159265);
            
            float dist = abs(v);
            float pixels_per_v = 1.0 / max(fwidth(v), 0.0001);
            float pixel_dist = dist * pixels_per_v;
            
            float lineWidthPixels = 1.2 * shapeWidth;
            
            // Anti-aliased outer edge
            float alphaMask = 1.0 - smoothstep(max(0.0, lineWidthPixels - 0.75), lineWidthPixels + 0.75, pixel_dist);
            
            // Taper and hide at endpoints so stars are not obscured
            // Fades out more gradually and leaves a larger gap around the stars
            float endTaper = smoothstep(0.08, 0.20, u) * (1.0 - smoothstep(0.80, 0.92, u));
            
            float alpha = baseAlpha * starVisibility * alphaMask * endTaper * reveal;
            
            // RESTORED: Fade out lines that are not near the screen center
            if (centerFade > 0.0) {
                float fade = smoothstep(0.85, 0.98, vDepth);
                alpha *= mix(1.0, fade, centerFade);
                
                // Boost brightness slightly in the very center
                alpha *= mix(1.0, 1.5, smoothstep(0.95, 1.0, vDepth));
            }
            
            alpha = clamp(alpha, 0.0, 1.0);
            if (alpha <= 0.01) discard;
            
            gl_FragColor = vec4(lineColor * alpha, alpha);
        }
    `;

    window.createSpindleMaterial = function (colorHex, centerFadeVal = 1.0, baseAlphaVal = 0.45) {
        const color = new THREE.Color(colorHex);
        return new THREE.ShaderMaterial({
            vertexShader: spindleVertexShader,
            fragmentShader: spindleFragmentShader,
            uniforms: {
                eqToHoriz: starsMaterial.uniforms.eqToHoriz,
                lookAz: starsMaterial.uniforms.lookAz,
                lookEl: starsMaterial.uniforms.lookEl,
                focalLen: starsMaterial.uniforms.focalLen,
                starVisibility: starsMaterial.uniforms.starVisibility,
                lineColor: { value: color },
                centerFade: { value: centerFadeVal },
                baseAlpha: { value: baseAlphaVal }
            },
            transparent: true,
            depthWrite: false,
            premultipliedAlpha: true,
            blending: THREE.AdditiveBlending,
            extensions: { derivatives: true }
        });
    };

    window.createGridMaterial = function (colorHex, isHorizVal, centerFadeVal = 0.0, baseAlphaVal = 0.35) {
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
            blending: THREE.AdditiveBlending,
            extensions: { derivatives: true }
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
    } else if (typeof REAL_STARS !== 'undefined') {
        // Fallback to JS array REAL_STARS
        const tempPositions = [];
        const tempColors = [];
        const tempMags = [];
        const colors = [[192/255, 216/255, 1.0], [1.0, 184/255, 112/255], [1.0, 232/255, 144/255], [216/255, 232/255, 1.0]];

        for (let i = 0; i < REAL_STARS.length; i++) {
            const star = REAL_STARS[i];
            const mag = star[2];
            
            // Only move dim stars to GPU to avoid duplicating bright stars which are handled in namedStarsMesh
            if (mag <= 3.0) continue; 
            
            const ra_rad = star[0] * Math.PI / 180;
            const dec_rad = star[1] * Math.PI / 180;
            const bv = star[3];
            
            tempPositions.push(
                Math.cos(dec_rad) * Math.cos(ra_rad),
                Math.cos(dec_rad) * Math.sin(ra_rad),
                Math.sin(dec_rad)
            );
            
            tempMags.push(mag);
            
            let cIdx = 3; // default white-blue
            if (bv < 0.0) cIdx = 0; // Blue
            else if (bv > 1.4) cIdx = 1; // Orange/Red
            else if (bv > 0.6) cIdx = 2; // Yellow
            
            const c = colors[cIdx];
            tempColors.push(c[0], c[1], c[2]);
        }

        fieldStarsGeo = new THREE.BufferGeometry();
        fieldStarsGeo.setAttribute('position', new THREE.Float32BufferAttribute(tempPositions, 3));
        fieldStarsGeo.setAttribute('starColor', new THREE.Float32BufferAttribute(tempColors, 3));
        fieldStarsGeo.setAttribute('starMag', new THREE.Float32BufferAttribute(tempMags, 1));

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

            positions[i * 3 + 0] = Math.cos(dec_rad) * Math.cos(ra_rad);
            positions[i * 3 + 1] = Math.cos(dec_rad) * Math.sin(ra_rad);
            positions[i * 3 + 2] = Math.sin(dec_rad);

            // True magnitude, no artificial boost
            mags[i] = mag;

            let r = 1.0, g = 0.95, b = 0.7; // Default to G type
            const sp = star.sp ? star.sp.charAt(0) : 'G';
            if (sp === 'O' || sp === 'B') { r = 0.5; g = 0.7; b = 1.0; }
            else if (sp === 'A') { r = 0.8; g = 0.85; b = 1.0; }
            else if (sp === 'F') { r = 1.0; g = 1.0; b = 0.8; }
            else if (sp === 'G') { r = 1.0; g = 0.95; b = 0.7; }
            else if (sp === 'K') { r = 1.0; g = 0.75; b = 0.4; }
            else if (sp === 'M') { r = 1.0; g = 0.5; b = 0.3; }

            colors[i * 3 + 0] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
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
        const linePositions = new Float32Array(numLines * 6 * 3); // 6 vertices per quad (2 triangles)
        const lineMidPositions = new Float32Array(numLines * 6 * 3);
        const lineUVs = new Float32Array(numLines * 6 * 2);

        for (let i = 0; i < numLines; i++) {
            const seg = CONSTELLATION_SEGMENTS[i];
            const ra1 = seg[0] * Math.PI / 180;
            const dec1 = seg[1] * Math.PI / 180;
            const ra2 = seg[2] * Math.PI / 180;
            const dec2 = seg[3] * Math.PI / 180;

            const A = new THREE.Vector3(
                Math.cos(dec1) * Math.cos(ra1),
                Math.cos(dec1) * Math.sin(ra1),
                Math.sin(dec1)
            );
            const B = new THREE.Vector3(
                Math.cos(dec2) * Math.cos(ra2),
                Math.cos(dec2) * Math.sin(ra2),
                Math.sin(dec2)
            );

            const mid = new THREE.Vector3().addVectors(A, B).normalize();
            const dir = new THREE.Vector3().subVectors(B, A).normalize();
            const widthDir = new THREE.Vector3().crossVectors(dir, mid).normalize();

            // Increase geometry width significantly to prevent geometry clipping when zooming out
            const w = 0.02;

            const v0 = new THREE.Vector3().copy(A).addScaledVector(widthDir, w);
            const v1 = new THREE.Vector3().copy(A).addScaledVector(widthDir, -w);
            const v2 = new THREE.Vector3().copy(B).addScaledVector(widthDir, w);
            const v3 = new THREE.Vector3().copy(B).addScaledVector(widthDir, -w);

            // Triangle 1: v0, v1, v2
            linePositions[i * 18 + 0] = v0.x; linePositions[i * 18 + 1] = v0.y; linePositions[i * 18 + 2] = v0.z;
            linePositions[i * 18 + 3] = v1.x; linePositions[i * 18 + 4] = v1.y; linePositions[i * 18 + 5] = v1.z;
            linePositions[i * 18 + 6] = v2.x; linePositions[i * 18 + 7] = v2.y; linePositions[i * 18 + 8] = v2.z;

            lineUVs[i * 12 + 0] = 0; lineUVs[i * 12 + 1] = 1;
            lineUVs[i * 12 + 2] = 0; lineUVs[i * 12 + 3] = -1;
            lineUVs[i * 12 + 4] = 1; lineUVs[i * 12 + 5] = 1;

            // Triangle 2: v2, v1, v3
            linePositions[i * 18 + 9] = v2.x; linePositions[i * 18 + 10] = v2.y; linePositions[i * 18 + 11] = v2.z;
            linePositions[i * 18 + 12] = v1.x; linePositions[i * 18 + 13] = v1.y; linePositions[i * 18 + 14] = v1.z;
            linePositions[i * 18 + 15] = v3.x; linePositions[i * 18 + 16] = v3.y; linePositions[i * 18 + 17] = v3.z;

            lineUVs[i * 12 + 6] = 1; lineUVs[i * 12 + 7] = 1;
            lineUVs[i * 12 + 8] = 0; lineUVs[i * 12 + 9] = -1;
            lineUVs[i * 12 + 10] = 1; lineUVs[i * 12 + 11] = -1;

            for (let vIdx = 0; vIdx < 6; vIdx++) {
                lineMidPositions[(i * 6 + vIdx) * 3 + 0] = mid.x;
                lineMidPositions[(i * 6 + vIdx) * 3 + 1] = mid.y;
                lineMidPositions[(i * 6 + vIdx) * 3 + 2] = mid.z;
            }
        }

        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
        lineGeo.setAttribute('midPos', new THREE.BufferAttribute(lineMidPositions, 3));
        lineGeo.setAttribute('uv2', new THREE.BufferAttribute(lineUVs, 2));
        window.constellationLinesMaterial = window.createSpindleMaterial('#a0c8ff', 1.0);
        window.constellationLineMesh = new THREE.Mesh(lineGeo, window.constellationLinesMaterial);
        scene.add(window.constellationLineMesh);
    }
}

function buildThickLineGeo(flatPosArray, w) {
    const numLines = flatPosArray.length / 6;
    const linePositions = new Float32Array(numLines * 18);
    const lineMidPositions = new Float32Array(numLines * 18);
    const lineUVs = new Float32Array(numLines * 12);

    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const widthDir = new THREE.Vector3();
    const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3();

    for (let i = 0; i < numLines; i++) {
        A.set(flatPosArray[i * 6 + 0], flatPosArray[i * 6 + 1], flatPosArray[i * 6 + 2]);
        B.set(flatPosArray[i * 6 + 3], flatPosArray[i * 6 + 4], flatPosArray[i * 6 + 5]);

        mid.addVectors(A, B).normalize();
        dir.subVectors(B, A).normalize();
        widthDir.crossVectors(dir, mid).normalize();

        v0.copy(A).addScaledVector(widthDir, w);
        v1.copy(A).addScaledVector(widthDir, -w);
        v2.copy(B).addScaledVector(widthDir, w);
        v3.copy(B).addScaledVector(widthDir, -w);

        linePositions[i * 18 + 0] = v0.x; linePositions[i * 18 + 1] = v0.y; linePositions[i * 18 + 2] = v0.z;
        linePositions[i * 18 + 3] = v1.x; linePositions[i * 18 + 4] = v1.y; linePositions[i * 18 + 5] = v1.z;
        linePositions[i * 18 + 6] = v2.x; linePositions[i * 18 + 7] = v2.y; linePositions[i * 18 + 8] = v2.z;

        lineUVs[i * 12 + 0] = 0; lineUVs[i * 12 + 1] = 1;
        lineUVs[i * 12 + 2] = 0; lineUVs[i * 12 + 3] = -1;
        lineUVs[i * 12 + 4] = 1; lineUVs[i * 12 + 5] = 1;

        linePositions[i * 18 + 9] = v2.x; linePositions[i * 18 + 10] = v2.y; linePositions[i * 18 + 11] = v2.z;
        linePositions[i * 18 + 12] = v1.x; linePositions[i * 18 + 13] = v1.y; linePositions[i * 18 + 14] = v1.z;
        linePositions[i * 18 + 15] = v3.x; linePositions[i * 18 + 16] = v3.y; linePositions[i * 18 + 17] = v3.z;

        lineUVs[i * 12 + 6] = 1; lineUVs[i * 12 + 7] = 1;
        lineUVs[i * 12 + 8] = 0; lineUVs[i * 12 + 9] = -1;
        lineUVs[i * 12 + 10] = 1; lineUVs[i * 12 + 11] = -1;

        for (let vIdx = 0; vIdx < 6; vIdx++) {
            lineMidPositions[(i * 6 + vIdx) * 3 + 0] = mid.x;
            lineMidPositions[(i * 6 + vIdx) * 3 + 1] = mid.y;
            lineMidPositions[(i * 6 + vIdx) * 3 + 2] = mid.z;
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    geo.setAttribute('midPos', new THREE.BufferAttribute(lineMidPositions, 3));
    geo.setAttribute('uv2', new THREE.BufferAttribute(lineUVs, 2));
    return geo;
}

function setupGrids() {
    // 1. Equatorial Grid
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
    const eqGeo = buildThickLineGeo(eqPos, 0.02);
    window.eqGridMesh = new THREE.Mesh(eqGeo, window.createGridMaterial('#ff80a0', 0.0, 0.0, 0.15));
    window.eqGridMesh.visible = false;
    scene.add(window.eqGridMesh);

    // 2. Ecliptic
    const ecPos = [];
    const eps = 23.439 * Math.PI / 180;
    for (let lambda_deg = 0; lambda_deg <= 360; lambda_deg += 2) {
        const lambda = lambda_deg * Math.PI / 180;
        let ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
        const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
        ecPos.push(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
        if (lambda_deg > 0 && lambda_deg < 360) ecPos.push(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
    }
    const ecGeo = buildThickLineGeo(ecPos, 0.02);
    window.eclipticMesh = new THREE.Mesh(ecGeo, window.createGridMaterial('#ffb040', 0.0, 0.0, 0.15));
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
    const azGeo = buildThickLineGeo(azPos, 0.02);
    window.altAzGridMesh = new THREE.Mesh(azGeo, window.createGridMaterial('#4880ff', 1.0, 0.0, 0.15));
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
                    float sigDistFwidth = fwidth(signedDistance);
                    float screenPxDistance = signedDistance / max(sigDistFwidth, 0.0001);
                    float alpha = clamp(screenPxDistance + 0.5, 0.0, 1.0) * vAlpha * opacity;
                    if (alpha <= 0.01) discard;
                    gl_FragColor = vec4(vColor * alpha, alpha);
                }
            `,
            transparent: true,
            depthTest: true,
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
        if (!labels) return;
        
        let maxChars = 0;
        for (let i = 0; i < labels.length; i++) {
            if (labels[i].text) maxChars += String(labels[i].text).length;
        }
        
        const requiredVertices = maxChars * 6;
        
        if (!this.positions || this.positions.length < requiredVertices * 3) {
            const alloc = Math.ceil(Math.max(requiredVertices, 2000) * 1.5); // buffer extra
            this.positions = new Float32Array(alloc * 3);
            this.uvs = new Float32Array(alloc * 2);
            this.colors = new Float32Array(alloc * 3);
            this.alphas = new Float32Array(alloc * 1);
            
            this.posAttr = new THREE.BufferAttribute(this.positions, 3);
            this.uvAttr = new THREE.BufferAttribute(this.uvs, 2);
            this.colAttr = new THREE.BufferAttribute(this.colors, 3);
            this.alphaAttr = new THREE.BufferAttribute(this.alphas, 1);
            
            this.posAttr.setUsage(THREE.DynamicDrawUsage);
            this.uvAttr.setUsage(THREE.DynamicDrawUsage);
            this.colAttr.setUsage(THREE.DynamicDrawUsage);
            this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
            
            this.geometry.setAttribute('position', this.posAttr);
            this.geometry.setAttribute('uv2', this.uvAttr);
            this.geometry.setAttribute('labelColor', this.colAttr);
            this.geometry.setAttribute('labelAlpha', this.alphaAttr);
        }

        const screenW = window.innerWidth;
        const screenH = window.innerHeight;

        let pIdx = 0, uIdx = 0, cIdx = 0, aIdx = 0;

        for (let idx = 0; idx < labels.length; idx++) {
            const label = labels[idx];
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

                this.positions[pIdx++] = wx0; this.positions[pIdx++] = wy0; this.positions[pIdx++] = 30;
                this.positions[pIdx++] = wx1; this.positions[pIdx++] = wy0; this.positions[pIdx++] = 30;
                this.positions[pIdx++] = wx1; this.positions[pIdx++] = wy1; this.positions[pIdx++] = 30;
                
                this.positions[pIdx++] = wx0; this.positions[pIdx++] = wy0; this.positions[pIdx++] = 30;
                this.positions[pIdx++] = wx1; this.positions[pIdx++] = wy1; this.positions[pIdx++] = 30;
                this.positions[pIdx++] = wx0; this.positions[pIdx++] = wy1; this.positions[pIdx++] = 30;

                this.uvs[uIdx++] = u0; this.uvs[uIdx++] = v0;
                this.uvs[uIdx++] = u1; this.uvs[uIdx++] = v0;
                this.uvs[uIdx++] = u1; this.uvs[uIdx++] = v1;
                
                this.uvs[uIdx++] = u0; this.uvs[uIdx++] = v0;
                this.uvs[uIdx++] = u1; this.uvs[uIdx++] = v1;
                this.uvs[uIdx++] = u0; this.uvs[uIdx++] = v1;

                for (let v = 0; v < 6; v++) {
                    this.colors[cIdx++] = rgb[0];
                    this.colors[cIdx++] = rgb[1];
                    this.colors[cIdx++] = rgb[2];
                    this.alphas[aIdx++] = alpha;
                }
            }
        }

        this.geometry.setDrawRange(0, pIdx / 3);
        
        if (this.posAttr) {
            this.posAttr.updateRange = { offset: 0, count: pIdx };
            this.uvAttr.updateRange = { offset: 0, count: uIdx };
            this.colAttr.updateRange = { offset: 0, count: cIdx };
            this.alphaAttr.updateRange = { offset: 0, count: aIdx };
            
            this.posAttr.needsUpdate = true;
            this.uvAttr.needsUpdate = true;
            this.colAttr.needsUpdate = true;
            this.alphaAttr.needsUpdate = true;
        }
    }
}

function setupLabelLayer(labelFont) {
    labelLayer = new LabelLayer(labelFont.font, labelFont.texture);
}

window.setupMoon = function() {
    const moonTex = new THREE.TextureLoader().load('moon.png');
    // moonTex.colorSpace = THREE.SRGBColorSpace; // if available
    const moonGeo = new THREE.PlaneGeometry(1, 1);
    
    const moonVertexShader = `
        uniform mat3 eqToHoriz;
        uniform float lookAz;
        uniform float lookEl;
        uniform float focalLen;
        uniform vec3 celestialPos;
        uniform vec3 sunPos;
        
        varying vec2 vUv;
        varying vec3 vLightDir;
        varying float vAltitude;

        void main() {
            vUv = uv;
            
            vec2 c = uv * 2.0 - 1.0;
            
            vec3 horiz = eqToHoriz * celestialPos;
            vec3 sunHoriz = eqToHoriz * sunPos;
            
            // 傳遞給 Fragment Shader 計算地平線折射
            vAltitude = horiz.z;
            
            vec3 up = vec3(0.0, 0.0, 1.0);
            vec3 rawRight = cross(up, horiz);
            vec3 right;
            if (length(rawRight) < 0.001) {
                right = vec3(1.0, 0.0, 0.0);
            } else {
                right = normalize(rawRight);
            }
            vec3 top = normalize(cross(horiz, right));
            
            // 放大平面尺寸以容納月暈光圈 (0.06 -> 0.18)
            float angularSize = 0.18; 
            vec3 dir = horiz + (c.x * right + c.y * top) * (angularSize / 2.0);
            dir = normalize(dir);
            
            // Calculate light direction in tangent space
            // Z-axis points towards Earth (-horiz)
            vLightDir = normalize(vec3(dot(sunHoriz, right), dot(sunHoriz, top), -dot(sunHoriz, horiz)));
            
            float lx = sin(lookAz) * cos(lookEl);
            float ly = cos(lookAz) * cos(lookEl);
            float lz = sin(lookEl);
            
            float rx = cos(lookAz);
            float ry = -sin(lookAz);
            
            float ux = ry * lz;
            float uy = -rx * lz;
            float uz = cos(lookEl);
            
            vec3 viewFwd = vec3(lx, ly, lz);
            vec3 viewRight = vec3(rx, ry, 0.0);
            vec3 viewUp = vec3(ux, uy, uz);
            
            float p_fwd = dot(dir, viewFwd);
            float p_right = dot(dir, viewRight);
            float p_up = dot(dir, viewUp);
            
            float rho2 = (1.0 - p_fwd) / max(0.0001, 1.0 + p_fwd);
            float k = 1.0 + rho2;
            
            float px = p_right * k * focalLen;
            float py = p_up * k * focalLen;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(px, py, 0.0, 1.0);
        }
    `;
    
    const moonFragmentShader = `
        uniform sampler2D map;
        
        varying vec2 vUv;
        varying vec3 vLightDir;
        varying float vAltitude;
        
        void main() {
            vec2 c = vUv * 2.0 - 1.0; 
            // 月球本體半徑為 0.3333 (因平面放大了3倍 0.06 -> 0.18)
            float moonRadius = 0.3333;
            float r = length(c);
            
            // 3. 大氣折射顏色偏移 (Atmospheric Refraction Tint)
            float altFactor = clamp(vAltitude * 8.0, 0.0, 1.0);
            // 接近地平線時偏橙紅，高仰角時偏白
            vec3 atmTint = mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 1.0, 1.0), altFactor);
            // 低仰角時稍微變暗
            float atmAlpha = mix(0.75, 1.0, altFactor);
            
            // 2. 月暈光圈 (Lunar Halo)
            float haloDist = clamp((r - moonRadius) / (1.0 - moonRadius), 0.0, 1.0);
            vec3 haloColor = mix(vec3(1.0, 0.6, 0.3), vec3(0.85, 0.95, 1.0), altFactor);
            // 冰晶徑向漸層：內圈強，外圈柔和淡出
            float haloAlpha = pow(1.0 - haloDist, 2.0) * 0.5 * atmAlpha; 
            
            if (r > moonRadius) {
                gl_FragColor = vec4(haloColor * atmTint, haloAlpha);
                return;
            }
            
            // 1. 月面環形山紋理與 UV 扭曲
            vec2 moon_c = c / moonRadius;
            float r2 = dot(moon_c, moon_c);
            
            // 建立 3D 球面法線
            vec3 baseNormal = normalize(vec3(moon_c.x, moon_c.y, sqrt(max(0.0, 1.0 - r2))));
            
            // 稍微縮小採樣半徑，強制避開圖片自帶的黑色抗鋸齒邊緣 (Bypass black anti-aliased padding)
            vec2 safe_c = moon_c * 0.92;
            
            // 原本的 2D 投影 UV
            vec2 flatUv = safe_c * 0.5 + 0.5;
            // 利用球面法線將平面的 UV 扭曲，產生 3D 球體邊緣的透視感
            vec2 sphereUv = baseNormal.xy * 0.46 + 0.5; 
            // 混合原本的 flat UV 與球體 UV，避免現有照片邊緣過度拉伸
            vec2 finalUv = mix(flatUv, sphereUv, 0.4);
            
            vec4 texColor = texture2D(map, finalUv);
            
            // 提取影像真實 Alpha，確保沒有殘留的黑色邊界
            float texTrueAlpha = texColor.a * smoothstep(0.02, 0.08, max(texColor.r, max(texColor.g, texColor.b)));
            
            // 將紋理的明暗轉為微法線偏移 (Bump mapping)，強化環形山邊緣的立體感
            float bump = (texColor.r - 0.5) * 0.8;
            vec3 vNormal = normalize(baseNormal + vec3(bump, bump, 0.0));
            
            // 修正 Lambert 漫反射在球體邊緣產生的「黑圈」(Dark rim) 假象
            // 將法線稍微拉向鏡頭方向 (0,0,1)，讓滿月或亮面的邊緣也能接收到充足光線
            vec3 finalNormal = normalize(mix(vNormal, vec3(0.0, 0.0, 1.0), 0.6));
            
            // Lambert 漫反射 + 陰影過渡 (Phase Terminator)
            float NdotL = dot(finalNormal, vLightDir);
            float diff = smoothstep(-0.05, 0.2, NdotL);
            float ambient = 0.02; 
            float lighting = diff + ambient;
            
            vec3 bodyColor = texColor.rgb * lighting * atmTint;
            
            // 抗鋸齒柔和邊緣
            float edgeSoftness = smoothstep(1.0, 0.92, r2);
            float bodyAlpha = texTrueAlpha * atmAlpha * edgeSoftness;
            
            // 疊加月球本體與背後的月暈
            vec3 finalRGB = mix(haloColor * atmTint, bodyColor, bodyAlpha);
            float finalAlpha = max(haloAlpha, bodyAlpha);
            
            gl_FragColor = vec4(finalRGB, finalAlpha);
        }
    `;

    window.moonMaterial = new THREE.ShaderMaterial({
        vertexShader: moonVertexShader,
        fragmentShader: moonFragmentShader,
        uniforms: {
            map: { value: moonTex },
            eqToHoriz: { value: new THREE.Matrix3() },
            lookAz: { value: 0 },
            lookEl: { value: 0 },
            focalLen: { value: 500 },
            celestialPos: { value: new THREE.Vector3() },
            sunPos: { value: new THREE.Vector3() }
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
    
    window.moonMesh = new THREE.Mesh(moonGeo, window.moonMaterial);
    window.moonMesh.renderOrder = 5; // In front of stars (0)
    window.moonMesh.frustumCulled = false;
    scene.add(window.moonMesh);
};

function renderWebGL(ts, lst_deg, starVisibility, topRGB, midRGB, horRGB, hy, screenH, sunCoords, moonCoords, moonPhase, labels) {
    const lst_rad = lst_deg * Math.PI / 180;
    const sinL = Math.sin(LAT_RAD);
    const cosL = Math.cos(LAT_RAD);
    const sinLST = Math.sin(lst_rad);
    const cosLST = Math.cos(lst_rad);

    const m = new THREE.Matrix3();
    m.set(
        -sinLST, cosLST, 0,
        -sinL * cosLST, -sinL * sinLST, cosL,
        cosL * cosLST, cosL * sinLST, sinL
    );

    starsMaterial.uniforms.eqToHoriz.value.copy(m);
    starsMaterial.uniforms.lookAz.value = lookAz;
    starsMaterial.uniforms.lookEl.value = lookEl;
    starsMaterial.uniforms.focalLen.value = focalLen();
    starsMaterial.uniforms.time.value = ts / 1000.0;
    starsMaterial.uniforms.starVisibility.value = typeof starVisibility !== "undefined" ? starVisibility : 1.0;
    starsMaterial.uniforms.dpr.value = window.devicePixelRatio || 1.0;

    if (window.skyMaterial && topRGB && midRGB && horRGB) {
        window.skyMaterial.uniforms.topRGB.value.set(topRGB[0] / 255, topRGB[1] / 255, topRGB[2] / 255);
        window.skyMaterial.uniforms.midRGB.value.set(midRGB[0] / 255, midRGB[1] / 255, midRGB[2] / 255);
        window.skyMaterial.uniforms.horRGB.value.set(horRGB[0] / 255, horRGB[1] / 255, horRGB[2] / 255);
        window.skyMaterial.uniforms.hy.value = hy;
        window.skyMaterial.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        window.skyMaterial.uniforms.time.value = ts / 1000.0;
        window.skyMaterial.uniforms.lookAz.value = lookAz;
        window.skyMaterial.uniforms.lookEl.value = lookEl;
        window.skyMaterial.uniforms.focalLen.value = focalLen();
        updateSkyGeometry();
    }

    let currentLightDir = new THREE.Vector3(0, 0, 1);
    let currentLightIntensity = 0.0;
    let lightColor = new THREE.Vector3(0.8, 0.9, 1.0);

    if (sunCoords) {
        const sDec = sunCoords.dec * Math.PI / 180;
        const sRa = sunCoords.ra * 15 * Math.PI / 180;
        const sunPos = new THREE.Vector3(
            Math.cos(sDec) * Math.cos(sRa),
            Math.cos(sDec) * Math.sin(sRa),
            Math.sin(sDec)
        );
        sunPos.applyMatrix3(m);
        if (sunPos.z > -0.05) {
            currentLightDir = sunPos.normalize();
            currentLightIntensity = Math.min(1.0, (sunPos.z + 0.05) * 20.0);
            lightColor.set(1.0, 0.9, 0.8);
        }
    }
    
    if (currentLightIntensity < 0.5 && moonCoords) {
        const mDec = moonCoords.dec * Math.PI / 180;
        const mRa = moonCoords.ra * 15 * Math.PI / 180;
        const moonPos = new THREE.Vector3(
            Math.cos(mDec) * Math.cos(mRa),
            Math.cos(mDec) * Math.sin(mRa),
            Math.sin(mDec)
        );
        moonPos.applyMatrix3(m);
        if (moonPos.z > 0.0) {
            const moonInt = Math.min(1.0, moonPos.z * 10.0) * 0.8;
            if (moonInt > currentLightIntensity) {
                currentLightDir = moonPos.normalize();
                currentLightIntensity = moonInt;
                lightColor.set(0.8, 0.9, 1.0);
            }
        }
    }

    if (window.oceanMaterial && horRGB) {
        window.oceanMaterial.uniforms.horRGB.value.set(horRGB[0] / 255, horRGB[1] / 255, horRGB[2] / 255);
        window.oceanMaterial.uniforms.time.value = ts / 1000.0;
        window.oceanMaterial.uniforms.lookAz.value = lookAz;
        window.oceanMaterial.uniforms.lookEl.value = lookEl;
        window.oceanMaterial.uniforms.focalLen.value = focalLen();
        
        if (!window.oceanMaterial.uniforms.lightDir) {
            window.oceanMaterial.uniforms.lightDir = { value: new THREE.Vector3(0, 0, 1) };
            window.oceanMaterial.uniforms.lightIntensity = { value: 0.0 };
            window.oceanMaterial.uniforms.lightColor = { value: new THREE.Vector3(0.8, 0.9, 1.0) };
        }
        window.oceanMaterial.uniforms.lightDir.value.copy(currentLightDir);
        window.oceanMaterial.uniforms.lightIntensity.value = currentLightIntensity;
        window.oceanMaterial.uniforms.lightColor.value.copy(lightColor);
    }

    if (typeof toggles !== 'undefined') {
        if (window.constellationLineMesh) window.constellationLineMesh.visible = toggles.constellations;
        if (window.eclipticMesh) window.eclipticMesh.visible = toggles.ecliptic;
        if (window.mwMesh) window.mwMesh.visible = toggles.milkyway;
        if (window.eqGridMesh) window.eqGridMesh.visible = toggles.equatorial;
        if (window.altAzGridMesh) window.altAzGridMesh.visible = toggles.grid;
    }

    if (window.sunMesh && sunCoords) {
        const sDec = sunCoords.dec * Math.PI / 180;
        const sRa = sunCoords.ra * 15 * Math.PI / 180;
        window.sunMaterial.uniforms.celestialPos.value.set(
            Math.cos(sDec) * Math.cos(sRa),
            Math.cos(sDec) * Math.sin(sRa),
            Math.sin(sDec)
        );
    }

    if (window.moonMesh && moonCoords) {
        const mDec = moonCoords.dec * Math.PI / 180;
        const mRa = moonCoords.ra * 15 * Math.PI / 180;
        window.moonMaterial.uniforms.celestialPos.value.set(
            Math.cos(mDec) * Math.cos(mRa),
            Math.cos(mDec) * Math.sin(mRa),
            Math.sin(mDec)
        );
        if (sunCoords) {
            const sDec = sunCoords.dec * Math.PI / 180;
            const sRa = sunCoords.ra * 15 * Math.PI / 180;
            window.moonMaterial.uniforms.sunPos.value.set(
                Math.cos(sDec) * Math.cos(sRa),
                Math.cos(sDec) * Math.sin(sRa),
                Math.sin(sDec)
            );
        }
        window.moonMaterial.uniforms.eqToHoriz.value.copy(m);
        window.moonMaterial.uniforms.lookAz.value = lookAz;
        window.moonMaterial.uniforms.lookEl.value = lookEl;
        window.moonMaterial.uniforms.focalLen.value = focalLen();
    }

    if (labelLayer) labelLayer.update(labels || []);

    renderer.render(scene, camera);
}

window.initWebGL = initWebGL;
window.renderWebGL = renderWebGL;
window.setupStars = setupStars;
