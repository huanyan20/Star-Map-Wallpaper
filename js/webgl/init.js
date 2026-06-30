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
    renderer.toneMappingExposure = 1.0;

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
    if (window.setupSun) window.setupSun();
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

        // ------------------
        // Procedural Skyline
        // ------------------
        float distU(float u, float center) {
            float d = abs(u - center);
            return d > 0.5 ? 1.0 - d : d;
        }
        
        vec4 getProceduralSkyline(float rawU, float sz) {
            float mountAlt = 0.0;
            mountAlt += (sin(rawU * 3.14159265 * 24.0) * 0.5 + 0.5) * 0.015;
            mountAlt += (sin(rawU * 3.14159265 * 70.0) * 0.5 + 0.5) * 0.008;
            
            float shoushan = exp(-pow(distU(rawU, 0.45) * 40.0, 2.0)) * 0.04;
            mountAlt += shoushan;

            float uDist85 = distU(rawU, 0.52);
            float tower85 = exp(-pow(uDist85 * 1000.0, 2.0)) * 0.06;
            float towerBase = exp(-pow(uDist85 * 300.0, 2.0)) * 0.03;
            
            float b1 = sin(rawU * 3.14159265 * 300.0);
            float b2 = sin(rawU * 3.14159265 * 100.0);
            float buildings = (b1 * 0.5 + 0.5) * 0.015;
            buildings *= (b2 * 0.5 + 0.5);
            
            float finalAlt = max(mountAlt, max(buildings, max(tower85, towerBase)));
            
            if (sz < finalAlt && sz > 0.0) {
                vec3 color = vec3(0.002, 0.005, 0.01);
                
                // 將座標離散化成網格，防止連續座標輸入隨機函數產生電視雜訊般的白噪點粒子
                vec2 grid = vec2(floor(rawU * 3000.0), floor(sz * 500.0));
                
                float lightProb = fract(sin(dot(grid, vec2(12.9898, 78.233))) * 43758.5453);
                float density = smoothstep(0.03, 0.0, sz);
                if (buildings > 0.005 || uDist85 < 0.01) density *= 2.0;
                
                if (lightProb > (1.0 - 0.015 * density)) {
                    float cHash = fract(sin(dot(grid, vec2(39.346, 11.135))) * 43758.5453);
                    color = mix(vec3(1.0, 0.8, 0.5), vec3(0.7, 0.9, 1.0), cHash) * 1.2;
                }
                
                if (sz > 0.058 && sz < 0.062 && uDist85 < 0.001) {
                    color = vec3(1.0, 0.2, 0.2) * 1.2;
                }
                
                return vec4(color, 1.0);
            }
            return vec4(0.0);
        }

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
            float pr = px / (k * focalLen); // 固定：加入先前遺漏的水平變數
            
            // Reconstruct view vectors
            float lx = sin(lookAz) * cos(lookEl);
            float ly = cos(lookAz) * cos(lookEl);
            float lz = sin(lookEl);
            float rx = cos(lookAz);
            float ry = -sin(lookAz);
            float ux = ry * lz; 
            float uy = -rx * lz; 
            float uz = rx * ly - ry * lx;
            
            float vx = depth * lx + pr * rx + pu * ux;
            float vy = depth * ly + pr * ry + pu * uy;
            float sz = depth * lz + pr * 0.0 + pu * uz; // sz is the Z component (Altitude)
            
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
                
                // 天際線疊加 (改為自繪程式化山峰與城市)
                float rawU = atan(vy, vx) / (2.0 * 3.1415926535) + 0.5;
                vec4 cityTex = getProceduralSkyline(rawU, sz);
                if (cityTex.a > 0.0) {
                    // 實體剪影直接遮蔽星空背景
                    color = mix(color, cityTex.rgb, cityTex.a); 
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

window.initWebGL = initWebGL;
window.renderWebGL = renderWebGL;
window.setupStars = setupStars;

