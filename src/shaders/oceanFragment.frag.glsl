uniform vec3 topRGB;
        uniform vec3 midRGB;
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
            
            float aaAlpha = smoothstep(finalAlt + 0.0015, finalAlt - 0.0015, sz);
            if (sz < 0.0) aaAlpha = 0.0;
            
            if (aaAlpha > 0.0) {
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
                
                return vec4(color, aaAlpha);
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
            // 加入真實的碎形雜訊 (fbm) 大幅扭曲空間，徹底打破弦波的規律性，產生真實的流體混沌感
            p += vec2(fbm(p * 0.4 + t * 0.2), fbm(p * 0.4 - t * 0.2)) * 1.5;
            
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
            // 根據視線夾角與距離進行細碎波浪衰減 (防止中遠處出現過於密集的高頻噪點)
            // [關鍵修復] 絕對不能讓細碎波紋完全衰減到 0！
            // 如果遠處的細波紋 (Normal Map) 衰減到 0，水面就會暴露出底層 3D 網格 (Grid) 的低解析度三角形，
            // 導致遠處的光線折射與透鏡效應看起來變成一格一格的「不平滑有角」多邊形。
            // 因此，我們在最遠處強制保留最低 15% 的細碎波紋，用來「打散」邊緣，隱藏多邊形稜角。
            float angleAtten = mix(0.15, 1.0, smoothstep(0.0, -0.28, exactRay.z)); 
            // 同樣地，距離衰減也保留最低 10% 的基本起伏
            float distAtten = mix(0.1, 1.0, exp(-dist * 0.0015));
            
            // 額外的高度衰減：如果在波谷，整體波紋量也直接減少
            float heightAtten = mix(0.15, 1.0, smoothstep(-3.0, -2.1, vWorldPos.z));
            
            vec3 finalBump = vec3(0.0);
            float bumpDistAttenuation = angleAtten * distAtten * heightAtten;
            if (bumpDistAttenuation > 0.0) {
                // 移除 Flow Mapping 相位循環，改為簡單的整體推移，讓波浪表面細碎有移動感
                vec2 uv = vWorldPos.xy * 0.8;
                // 讓細碎波紋的移動方向跟隨光源方位 (lightDir)，產生光與風同向吹拂的連貫感
                vec2 windDir = normalize(lightDir.xy + vec2(0.001, 0.001)); 
                uv -= windDir * time * 0.6;
                
                // 傳入 exactRay.z 與 vWorldPos.z 以同步降低複雜度與強度
                vec3 finalBump = getWaterNormal(uv, time, dist, -exactRay.z, vWorldPos.z);
                
                // 放大法線的 X, Y 分量來增強波紋起伏，讓斜率更陡峭以產生真實的高度反射感
                finalBump.xy *= 6.0 * bumpDistAttenuation;
                
                // 將細碎波紋法線與原本的大波浪法線 (N) 結合
                N = normalize(vec3(N.xy + finalBump.xy, N.z));
            }
            
            float cosTheta = clamp(dot(V, N), 0.0, 1.0);
            
            // Fresnel (Schlick's approximation)
            // [優化] 響應「整體反射增強」需求：將基礎反射率 (R0) 從 0.02 大幅提升至 0.08
            // 這樣即使在非掠射角 (向下看) 也能保持足夠的反射強度，防止背光面的海浪隱形
            float R0 = 0.08; 
            float R = R0 + (1.0 - R0) * pow(1.0 - cosTheta, 5.0);
            
            // [完全整合] 海水底色動態跟隨天空漸層 (horRGB, midRGB, topRGB)
            // 取代原本寫死的固定色，隨著時間日夜變化，海水顏色會完美融合，再也不會有突兀的「舊顏色」
            vec3 deepWater = horRGB * 0.05 + topRGB * 0.1 + vec3(0.001, 0.002, 0.005);
            vec3 shallowWater = horRGB * 0.1 + midRGB * 0.15 + vec3(0.002, 0.005, 0.01);
            float waveHeight = max(0.0, vWorldPos.z + 2.2);
            vec3 waterBody = mix(deepWater, shallowWater, waveHeight * 1.5);
            
            // ==========================================
            // 透光變色 (Subsurface Scattering & Diffuse)
            // ==========================================
            if (lightIntensity > 0.0) {
                // 1. 漫反射 (Diffuse)：使用 Half-Lambert (Wrap Lighting) 柔和邊緣，消除切邊過於強烈的問題
                // 這可以讓背光面 (暗部) 也有滑順的亮度過渡，顏色更真實且不生硬
                // [優化] 增強漫反射亮度 (從 0.025 提升至 0.12)，讓背向月光的波浪斜面也能被月光照亮，勾勒出清晰的立體海浪形狀
                float NdL = dot(N, lightDir) * 0.5 + 0.5; 
                NdL = smoothstep(0.1, 0.9, NdL);
                vec3 diffuseColor = lightColor * 0.12 * NdL * lightIntensity;
                
                // 2. 次表面散射 (SSS / 透光變色)：
                // 調整為更真實的午夜海水透光色 (深邃的墨綠/青色)，降低螢光感
                vec3 H_scatter = normalize(lightDir + N * 0.4); 
                float scatter = pow(max(0.0, dot(V, -H_scatter)), 2.5);
                
                // 利用 smoothstep 讓透光漸層更柔和，避免在波浪邊緣產生色塊切線
                float sssMask = smoothstep(0.0, 1.0, waveHeight * 1.5);
                // 調整透光色：同步跟隨地平線天光 (horRGB) 變化，降低螢光感
                vec3 sssColor = (horRGB * 0.3 + vec3(0.002, 0.005, 0.01)) * scatter * sssMask * lightIntensity * 2.0;
                
                waterBody += diffuseColor + sssColor;
            }
            
            // 計算真實的環境反射向量
            vec3 refDir = reflect(-V, N);
            
            // [完全整合] 天頂反射光不再寫死，自動跟隨頂部天空色彩
            // 將天頂壓暗以製造出極端的高反差，這樣當波浪起伏時，反射的天頂與地平線色彩切換才會明顯，凸顯波浪立體感
            vec3 zenithColor = topRGB * 0.1 + vec3(0.001, 0.002, 0.004);
            
            // 計算月光在天際線造成的強烈光暈
            float glowFactor = dot(normalize(refDir.xy + vec2(0.001)), normalize(lightDir.xy + vec2(0.001))) * 0.5 + 0.5;
            
            // [關鍵修復] 完全移除人工的白色 moonGlow 疊加！
            // 取而代之，我們使用方位角衰減 (skyDimming)
            // [優化] 響應「另以角度要漸弱但不能無光」：
            // 將背對月亮的最暗值從 0.1 (10%) 大幅拉高到 0.45 (45%)，保證背光面依然有充足的微光！
            // 同時將衰減曲線從 3 次方調降為 1.5 次方，讓「漸弱」的過程更加平滑柔和
            float skyDimming = mix(1.0, mix(0.45, 1.0, pow(glowFactor, 1.5)), min(lightIntensity, 1.0));
            vec3 horizonColor = (horRGB * 0.6 + midRGB * 0.3 + vec3(0.005, 0.01, 0.02)) * skyDimming;
            
            // 取出反射向量的 Z 軸來混合天頂與地平線
            // [優化] 響應需求：將地平線微光的範圍嚴格限制在仰角 7.5 度 (sin(7.5) ≈ 0.13) 內
            // 超過 7.5 度就會迅速且平滑地過渡為極暗的 zenithColor，避免地平線光暈延伸到近處水面
            float skyBlend = clamp(refDir.z, 0.0, 1.0);
            float skyMixFactor = smoothstep(0.0, 0.13, skyBlend); 
            vec3 skyReflection = mix(horizonColor, zenithColor, skyMixFactor); 
            
            // 修正向下反射 (refDir.z < 0.0)：
            // 當海浪斜面過於陡峭而朝下反射時，應該反射暗色的深海水面
            // 同理，將向下反射的漸層範圍也嚴格限制在俯角 7.5 度 (0.13) 內，避免微光向下延伸
            float groundBlend = smoothstep(0.0, 0.13, -refDir.z);
            skyReflection = mix(skyReflection, deepWater * 0.5, groundBlend);
            
            // 讓真實的環境反射向量 (包含海浪擾動) 取代死板的鏡像，使城市倒影跟著海浪扭曲
            float rawU = atan(refDir.y, refDir.x) / (2.0 * 3.1415926535) + 0.5;
            float refSz = refDir.z;
            vec4 cityReflection = vec4(0.0);
            
            // 海面反射地平線景物只限於遠景範圍，避免近處水浪因法線扭曲產生噪點粒子
            float skylineFade = smoothstep(200.0, 800.0, dist);
            
            // 只有當反射射線打中建築物高度時，才採樣城市光源
            if (refSz > 0.0 && refSz < 0.1 && skylineFade > 0.0) {
                cityReflection = getProceduralSkyline(rawU, refSz);
                if (cityReflection.a > 0.0) {
                    skyReflection = mix(skyReflection, cityReflection.rgb, cityReflection.a * skylineFade);
                }
            }

            // 根據 Fresnel 反射率混合水體與真實環境反射
            vec3 waterColor = mix(waterBody, skyReflection, R);
            
            // ==========================================
            // 萃取出特別亮的光源 (窗戶、信號燈)，讓光點隨著海浪起伏在近處產生閃爍的長條光暈
            // ==========================================
            if (cityReflection.a > 0.0) {
                float brightness = dot(cityReflection.rgb, vec3(0.299, 0.587, 0.114));
                if (brightness > 0.05) { // 只保留高光部分作為光點粒子
                    waterColor += cityReflection.rgb * R * 4.0 * skylineFade;
                }
            }
            
            // 2. Specular Glint (鏡面閃爍高光 & 月光海倒影)
            float specular = 0.0;
            if (lightIntensity > 0.0) {
                vec3 halfVector = normalize(lightDir + V);
                float NdotH = max(0.0, dot(N, halfVector));
                
                // 組合多個不同粗糙度的高光，形成在水面上拖長的月光倒影 (Moon glade)
                // [優化] 回應「月光以及光暈太亮」：極度收斂高光的強度，讓月光回歸柔和細緻的點綴
                float specCore = pow(NdotH, 1200.0) * 0.6; // 極度銳利的核心倒影，亮度大幅下降
                float specMid  = pow(NdotH, 450.0) * 0.3;  // 散開的中段
                float specTail = pow(NdotH, 120.0) * 0.1;  // 寬闊的尾部
                
                specular = (specCore + specMid + specTail) * lightIntensity;
                
                // 波光粼粼的閃爍雜訊 (在波浪尖端產生微小晶瑩亮點)
                float glintNoise = hash(floor(vWorldPos.xy * 100.0) + time * 3.0); 
                specular *= (0.5 + glintNoise * 2.0); // 稍微提升閃爍晶瑩感
                
                // 計算視線與光源方位的夾角遮罩，強制切除因為海浪法線過度扭曲而往左右兩側亂噴的光斑
                // 稍微放寬至 40 次方，以免光芒過窄顯得不自然
                float alignFactor = dot(normalize(exactRay.xy), normalize(lightDir.xy));
                float narrowMask = pow(max(0.0, alignFactor * 0.5 + 0.5), 40.0);
                
                // 使用 bumpDistAttenuation 使遠處不要出現過度密集的高光雜訊
                specular *= mix(0.2, 1.0, bumpDistAttenuation); 
                specular *= narrowMask; // 強制限制光暈寬度
                
                // 疊加光源顏色，並結合 Fresnel 效應 (掠射角反射更強)
                // 將總體亮度乘數從 2.5 大幅降至 1.0，徹底解決月光刺眼的問題
                waterColor += specular * lightColor * (R * 4.0 + 1.2) * 1.0;
            }
            
            // 移除早期強制將近處(相反方向)壓暗的程式碼，
            // 讓前面設定的深邃海水色與物理光影 (Diffuse) 得以完整呈現，不再被強行蓋過變成死黑。
            // 套用 ACES 色調映射，讓高光更自然，提升對比
            waterColor = ACESFilm(waterColor);
            
            // 利用 Fresnel (R) 決定物理透明度 (透底效應)
            // 如果透明度降得太低 (例如之前的 0.1)，會導致海面上所有的光影、反射都被稀釋到看不見 (導致海浪隱形)
            // 將最低透明度拉回 0.45，這樣既能透視底下的星星，又能完美保留波浪的光影立體感
            float oceanAlpha = mix(0.45, 0.98, R);
            
            // 直接輸出帶有物理透明度的水色，與背後的星空完美混合 (透底)
            gl_FragColor = vec4(waterColor, oceanAlpha * vAlpha);
        }