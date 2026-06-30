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

        void evaluateWaves(vec2 p, float t, float dist, out vec3 dP, inout vec3 tangent, inout vec3 binormal) {
            dP = vec3(0.0);
            
            // 空間隨機調變 (Spatial Random Modulation)
            // 利用低頻的干涉波讓波浪的振幅在空間中隨機強弱，打破 Gerstner waves 的無窮週期格紋感
            float randMod1 = sin(p.x * 0.05 + t * 0.2) * cos(p.y * 0.04 - t * 0.15) * 0.5 + 0.5;
            float randMod2 = sin(p.x * 0.12 - p.y * 0.08 + t * 0.3) * 0.5 + 0.5;
            
            for (int i = 0; i < 2; i++) {
                vec4 f = wave_k[i] * (wave_dx[i] * p.x + wave_dy[i] * p.y - wave_c[i] * t);
                
                // 加入空間扭曲 (Domain Warping)，讓波線不再是死板的平行直線，產生蜿蜒感
                f += vec4(sin(p.y * 0.08 + t), cos(p.x * 0.09 - t), sin(p.x * 0.15 + p.y * 0.11), cos(p.y * 0.13)) * 0.6;
                
                vec4 sinf = sin(f);
                vec4 cosf = cos(f);
                
                float waveScale = 1.0;
                if (i == 0) { 
                    // 大中波浪：套用慢速隨機起伏
                    // 遠處逐漸平息大波浪，避免透視壓縮造成橫向浪與摩爾紋
                    float distFade = 1.0 - smoothstep(300.0, 1500.0, dist);
                    waveScale = mix(1.3, 1.0, smoothstep(10.0, 400.0, dist)) * mix(0.4, 1.2, randMod1) * distFade;
                } else { 
                    // 細碎波浪：套用較快的隨機起伏
                    // 中距離即平息細波浪，保持遠處平滑
                    float distFade = 1.0 - smoothstep(100.0, 500.0, dist);
                    waveScale = mix(3.0, 1.0, smoothstep(10.0, 250.0, dist)) * mix(0.2, 1.5, randMod2) * distFade;
                }
                
                vec4 a_cosf = wave_a[i] * cosf * waveScale;
                vec4 a_sinf = wave_a[i] * sinf * waveScale;
                vec4 wa_sinf = wave_wa[i] * sinf * waveScale;
                vec4 wa_cosf = wave_wa[i] * cosf * waveScale;

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
            
            // 幾何衰減：大幅度增強遠處的波浪漸變衰減，使其提早且更快平息
            float distFromCenter = length(gridPos);
            // 改為 20.0 ~ 300.0，讓水波在不遠處就開始迅速衰減，達到遠方完全平靜的鏡面效果，消除摩爾紋
            float waveGeomAttenuation = 1.0 - smoothstep(20.0, 300.0, distFromCenter);

            // 遠處與近處浪方向不一樣：根據距離扭曲旋轉座標系
            // 遠處的角度逐漸變大，讓波浪方向發生偏轉
            float twistAngle = smoothstep(0.0, 2500.0, distFromCenter) * 190.5;
            float tc = cos(twistAngle);
            float ts = sin(twistAngle);
            
            vec2 rotatedPos = vec2(
                gridPos.x * tc - gridPos.y * ts,
                gridPos.x * ts + gridPos.y * tc
            );

            // SIMD Vectorized evaluation of 8 waves (7 active, 1 dummy)
            // 移除隨時間改變的空間扭曲，讓波浪穩定推進，消除隨機產生與消失的錯覺
            evaluateWaves(rotatedPos, waveTime, distFromCenter, dP, tangent, binormal);

            // 將計算結果 (dP, tangent, binormal) 從旋轉後的座標系轉回世界座標系
            vec2 dP_xy = dP.xy;
            dP.x = dP_xy.x * tc + dP_xy.y * ts;
            dP.y = -dP_xy.x * ts + dP_xy.y * tc;
            
            vec2 t_xy = tangent.xy;
            tangent.x = t_xy.x * tc + t_xy.y * ts;
            tangent.y = -t_xy.x * ts + t_xy.y * tc;
            
            vec2 b_xy = binormal.xy;
            binormal.x = b_xy.x * tc + b_xy.y * ts;
            binormal.y = -b_xy.x * ts + b_xy.y * tc;
            
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
            
            float safeDepth = max(depth, -0.999);
            float k = 2.0 / (1.0 + safeDepth);
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
                
                // 將座標離散化成網格，防止因海浪扭曲導致隨機雜湊值產生滿海的白噪點粒子
                vec2 grid = vec2(floor(rawU * 3000.0), floor(sz * 500.0));
                
                float lightProb = fract(sin(dot(grid, vec2(12.9898, 78.233))) * 43758.5453);
                float density = smoothstep(0.03, 0.0, sz);
                if (buildings > 0.005 || uDist85 < 0.01) density *= 2.0;
                
                if (lightProb > (1.0 - 0.015 * density)) {
                    float cHash = fract(sin(dot(grid, vec2(39.346, 11.135))) * 43758.5453);
                    // 高雄海邊常見的溫暖黃光與些許白光
                    vec3 lightColor = mix(vec3(1.0, 0.8, 0.3), vec3(0.7, 0.9, 1.0), cHash);
                    color = lightColor * 1.5;
                }
                
                // 航空障礙燈與信號燈
                if (sz > 0.058 && sz < 0.062 && uDist85 < 0.001) {
                    float blink = step(0.5, sin(time * 2.0));
                    color = vec3(1.0, 0.2, 0.2) * 1.8 * blink;
                }
                if (mountAlt == shoushan && sz > mountAlt - 0.005) {
                    float blink = step(0.5, sin(time * 3.0));
                    color += vec3(1.0, 0.2, 0.2) * 1.5 * blink;
                }
                
                return vec4(color, 1.0);
            }
            return vec4(0.0);
        }

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

        // 根據距離 dist、視線俯角 angleSine 與 海浪高度 waveHeight 衰減高頻細節
        float water_bump(vec2 p, float t, float dist, float angleSine, float waveHeight) {
            float n = 0.0;
            
            // 碎斑紋空間叢集效應 (Patchy Ripples)
            // 像是一陣陣的微風吹過海面，讓碎波紋成群隨機出現與消失，打破均勻分布的網格感
            float patchMod = sin(p.x * 0.06 + t * 0.5) * cos(p.y * 0.05 - t * 0.4) * 0.5 + 0.5;
            float amp = mix(0.1, 1.4, patchMod);
            
            // 波谷低窪處平息 (Trough Attenuation)
            // 基準高度為 -2.2，越低於基準面，碎波紋越弱，越弱必須漸進衰減，避免在波谷被視覺透視極度壓縮
            float troughAtten = smoothstep(-4.5, -2.2, waveHeight);
            amp *= mix(0.15, 1.0, troughAtten);
            
            // 採用非 90 度角的特殊旋轉矩陣，徹底消除網格格紋 (Grid artifacts)
            mat2 rot = mat2(0.737, 0.675, -0.675, 0.737); 
            
            // 距離衰減
            float distIter = smoothstep(15.0, 80.0, dist);
            // 視角衰減：當地平線下 2 度 (0.035) 到 6 度 (0.105) 之間時，降低複雜度以消除摩爾紋
            float angleIter = 1.0 - smoothstep(0.035, 0.105, angleSine);
            // 波谷衰減：波谷處 (troughAtten = 0) 降低複雜度
            float troughIter = 1.0 - troughAtten;
            
            // 取各類衰減中最嚴重的一個 (值越大代表越需要簡化)
            float iterFactor = max(distIter, max(angleIter, troughIter));
            
            // 近處/大角度/波峰(8層)，遠處/平視/波谷(1層)
            float maxIter = mix(8.0, 1.0, iterFactor);
            
            for (int i = 0; i < 8; i++) { // 固定迴圈次數以符合 WebGL 限制
                float iterWeight = clamp(maxIter - float(i), 0.0, 1.0);
                
                p = rot * p;
                float phase = t * 1.2 + float(i);
                // 使用 1D 弦波加上正交方向的扭曲 (Squiggle waves)，避免 sin(x)*cos(y) 造成的格子感
                float warp = sin(p.y * 1.5 + phase) * 0.5;
                n += (amp * iterWeight) * sin(p.x * 2.0 + warp + phase);
                
                p *= 1.7;
                amp *= 0.5;
            }
            return n;
        }

        // 根據水波高度函數計算出精準的法線向量 (Normal Map)
        vec3 getWaterNormal(vec2 p, float t, float dist, float angleSine, float waveHeight) {
            float eps = 0.02;
            float h = water_bump(p, t, dist, angleSine, waveHeight);
            float hx = water_bump(p + vec2(eps, 0.0), t, dist, angleSine, waveHeight);
            float hy = water_bump(p + vec2(0.0, eps), t, dist, angleSine, waveHeight);
            // 動態法線平滑 (Dynamic Normal Flattening): 距離越遠，Z軸分量越大，讓法線越趨近平坦
            float zComp = mix(0.15, 0.8, smoothstep(20.0, 100.0, dist));
            return normalize(vec3(hx - h, hy - h, zComp)); 
        }
        
        // ACES Tone Mapping
        vec3 ACESFilm(vec3 x) {
            float a = 2.51;
            float b = 0.03;
            float c = 2.43;
            float d = 0.59;
            float e = 0.14;
            return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
        }
        
        void main() {
            if (vDepth < -0.99 || vAlpha < 0.01) discard;
            
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
            
            float exactVx = scrDepth * lx + pr * rx + pu * ux;
            float exactVy = scrDepth * ly + pr * ry + pu * uy;
            float exactSz = scrDepth * lz + pr * rz + pu * uz;
            
            vec3 exactRay = normalize(vec3(exactVx, exactVy, exactSz));
            
            vec3 N = normalize(vNormal);
            float dist = length(vWorldPos);
            vec3 V = -exactRay;

            // 距離衰減 (Distance) 與 視角衰減 (Angle)
            // 視線俯角 2~6 度之間，量逐漸減小，但最低保留 0.3 的起伏，不再強制抹平
            float angleAtten = mix(0.3, 1.0, smoothstep(0.035, 0.105, -exactRay.z));
            float distAtten = 1.0 - smoothstep(20.0, 120.0, dist);
            
            // 額外的高度衰減：如果在波谷，整體波紋量也直接減少
            float heightAtten = mix(0.15, 1.0, smoothstep(-3.0, -2.1, vWorldPos.z));
            
            float bumpDistAttenuation = angleAtten * distAtten * heightAtten;
            if (bumpDistAttenuation > 0.0) {
                // 移除 Flow Mapping 相位循環，改為簡單的整體推移，讓波浪表面細碎有移動感
                vec2 uv = vWorldPos.xy * 0.8;
                uv += vec2(time * 0.4, time * 0.2); // 碎浪的整體移動速度
                
                // 傳入 exactRay.z 與 vWorldPos.z 以同步降低複雜度與強度
                vec3 finalBump = getWaterNormal(uv, time, dist, -exactRay.z, vWorldPos.z);
                
                // 放大法線的 X, Y 分量來增強波紋起伏，讓斜率更陡峭以產生真實的高度反射感
                finalBump.xy *= 6.0 * bumpDistAttenuation;
                
                // 將細碎波紋法線與原本的大波浪法線 (N) 結合
                N = normalize(vec3(N.xy + finalBump.xy, N.z));
            }
            
            float cosTheta = clamp(dot(V, N), 0.0, 1.0);
            
            // Fresnel (Schlick's approximation)
            float R0 = 0.02; // Water reflection coefficient
            float R = R0 + (1.0 - R0) * pow(1.0 - cosTheta, 5.0);
            
            // 水體本身顏色 (次表面散射近似 Subsurface Scattering)
            vec3 deepWater = vec3(0.002, 0.01, 0.03);
            vec3 shallowWater = vec3(0.0, 0.04, 0.08); 
            
            float waveHeight = max(0.0, vWorldPos.z + 2.2);
            vec3 waterBody = mix(deepWater, shallowWater, waveHeight * 1.8);
            
            // 計算真實的環境反射向量
            vec3 refDir = reflect(-V, N);
            
            // 根據反射向量的仰角 (refDir.z) 來建立天空漸層
            // 讓波紋的高度與斜率真實反映在映射的環境影像上，而不是單純依靠 Fresnel 造成的顏色明暗對比
            vec3 zenithColor = vec3(0.005, 0.015, 0.03); // 天頂較暗的深色
            // 修正水平線亮度接縫，與天空保持完全一致
            vec3 horizonColor = horRGB + vec3(0.02, 0.04, 0.08); 
            
            // 取出反射向量的 Z 軸來混合天頂與地平線，並使用指數曲線讓地平線光暈更集中
            float skyBlend = clamp(refDir.z, 0.0, 1.0);
            vec3 skyReflection = mix(horizonColor, zenithColor, pow(skyBlend, 0.5)); 
            
            // 直接鏡像天際線 (完美倒影，不受波浪法線扭曲)
            vec3 mirrorDir = reflect(-V, vec3(0.0, 0.0, 1.0));
            float rawU = atan(mirrorDir.y, mirrorDir.x) / (2.0 * 3.1415926535) + 0.5;
            // 修正接縫問題：投影的 Z 值即為高度的 Sine，不需要除以長度
            float mirrorSz = mirrorDir.z;
            vec4 cityReflection = getProceduralSkyline(rawU, mirrorSz);
            if (cityReflection.a > 0.0) {
                skyReflection = mix(skyReflection, cityReflection.rgb, cityReflection.a);
            }

            // 根據 Fresnel 反射率混合水體與真實環境反射
            vec3 waterColor = mix(waterBody, skyReflection, R);
            
            // ==========================================
            // 新增：利用海浪法線取得城市光點反射 (光點粒子)
            // ==========================================
            vec3 waveRefDir = reflect(-V, N);
            float waveU = atan(waveRefDir.y, waveRefDir.x) / (2.0 * 3.1415926535) + 0.5;
            float waveSz = waveRefDir.z;
            
            // 只有當反射射線打中建築物高度時，才採樣城市光源
            if (waveSz > 0.0 && waveSz < 0.1) {
                vec4 waveCity = getProceduralSkyline(waveU, waveSz);
                if (waveCity.a > 0.0) {
                    // 萃取出特別亮的光源 (窗戶、信號燈)，避免暗色建築物遮蔽水面
                    float brightness = dot(waveCity.rgb, vec3(0.299, 0.587, 0.114));
                    if (brightness > 0.05) { // 只保留高光部分作為光點粒子
                        // 讓光點隨著海浪起伏在近處閃爍
                        waterColor += waveCity.rgb * R * 4.0;
                    }
                }
            }
            
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
            
            
            float darken = clamp(1.0 + exactSz, 0.0, 1.0);
            waterColor *= mix(0.1, 1.0, darken);
            
            // 套用 ACES 色調映射，讓高光更自然，提升對比
            waterColor = ACESFilm(waterColor);
            
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
            lightColor: { value: new THREE.Vector3(0.8, 0.9, 1.0) },
            skylineTex: { value: null }
        },
        transparent: true,
        depthWrite: false
    });

    window.oceanMesh = new THREE.Mesh(oceanGeo, window.oceanMaterial);
    window.oceanMesh.renderOrder = -10;
    scene.add(window.oceanMesh);
}

