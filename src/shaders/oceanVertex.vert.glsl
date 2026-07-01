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