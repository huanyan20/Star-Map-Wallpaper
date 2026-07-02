uniform vec3 topRGB;
        uniform vec3 midRGB;
        uniform vec3 horRGB;
        uniform vec3 lightDir;
        uniform float lightIntensity;
        uniform vec3 sunPosition;
        uniform float turbidity;
        uniform float hy;
        uniform vec2 resolution;
        uniform float time;
        uniform float lookAz;
        uniform float lookEl;
        uniform float focalLen;
        uniform float atmosphereBlend;

        // ------------------
        // Procedural Skyline
        // ------------------
        float distU(float u, float center) {
            float d = abs(u - center);
            return d > 0.5 ? 1.0 - d : d;
        }
        
        vec4 getProceduralSkyline(float rawU, float sz) {
            vec4 result = vec4(0.0);
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
            
            float aa = fwidth(sz) * 1.5;
            float aaAlpha = 1.0 - smoothstep(finalAlt - aa, finalAlt + aa, sz);
            aaAlpha *= smoothstep(-aa, aa, sz);
            
            if (aaAlpha > 0.0) {
                vec3 color = vec3(0.002, 0.005, 0.01);
                vec2 grid = vec2(floor(rawU * 3000.0), floor(sz * 500.0));
                
                float lightProb = fract(sin(dot(grid, vec2(12.9898, 78.233))) * 43758.5453);
                float density = smoothstep(0.03, 0.0, sz);
                if (buildings > 0.005 || uDist85 < 0.01) density *= 2.0;
                
                if (lightProb > (1.0 - 0.015 * density)) {
                    float cHash = fract(sin(dot(grid, vec2(39.346, 11.135))) * 43758.5453);
                    vec3 lightColor = mix(vec3(1.0, 0.8, 0.3), vec3(0.7, 0.9, 1.0), cHash);
                    color = lightColor * 1.5;
                }
                
                if (sz > 0.058 && sz < 0.062 && uDist85 < 0.001) {
                    float blink = step(0.5, sin(time * 2.0));
                    color = vec3(1.0, 0.2, 0.2) * 1.8 * blink;
                }
                if (mountAlt == shoushan && sz > mountAlt - 0.005) {
                    float blink = step(0.5, sin(time * 3.0));
                    color += vec3(1.0, 0.2, 0.2) * 1.5 * blink;
                }
                
                result = vec4(color, aaAlpha);
            }
            return result;
        }

        // Interleaved Gradient Noise for raymarching and screen dither (better spectrum than static hash)
        float interleavedGradientNoise(vec2 p) {
            vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
            return fract(magic.z * fract(dot(p, magic.xy)));
        }

        // Simple noise with mod() to protect against precision loss on high resolution screens
        float hash(vec2 p) {
            p = mod(p, 512.0);
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }
        
        // ------------------
        // Physical Atmosphere
        // ------------------
        vec3 getAtmosphere(vec3 r, vec3 sunDir, float turb, float ditherVal) {
            float earthRadius = 6360e3;
            float atmRadius = 6420e3;
            vec3 p0 = vec3(0.0, 0.0, earthRadius + 10.0);
            
            float a = dot(r, r);
            float b = 2.0 * dot(p0, r);
            // Precalculate dot(p0, p0) - atmRadius^2 to avoid catastrophic cancellation: (6360010^2 - 6420000^2)
            float c = -766672800000.0;
            float d = b * b - 4.0 * a * c;
            if(d < 0.0) return vec3(0.0);
            float t = (-b + sqrt(d)) / (2.0 * a);
            
            // Check Earth intersection for shadow (Belt of Venus)
            // Precalculate dot(p0, p0) - earthRadius^2 = (6360010^2 - 6360000^2) = 127200100.0
            float dEarth = b * b - 4.0 * a * 127200100.0;
            if (dEarth > 0.0) {
                float tEarth = (-b - sqrt(dEarth)) / (2.0 * a);
                if (tEarth > 0.0) t = min(t, tEarth);
            }
            
            float stepSize = t / 32.0;
            // Dither the ray march start position to break up integration blocks into noise
            float timeProg = stepSize * ditherVal;
            
            vec3 rayleigh = vec3(0.0);
            vec3 mie = vec3(0.0);
            
            float optDepthR = 0.0;
            float optDepthM = 0.0;
            
            vec3 betaR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
            vec3 betaM = vec3(21e-6) * turb;
            
            float Hr = 8000.0;
            float Hm = 1200.0;
            
            for(int i = 0; i < 32; i++) {
                vec3 p = p0 + r * (timeProg + stepSize * 0.5);
                float height = length(p) - earthRadius;
                if (height < 0.0) break;
                
                float hr = exp(-height / Hr) * stepSize;
                float hm = exp(-height / Hm) * stepSize;
                optDepthR += hr;
                optDepthM += hm;
                
                // Optical depth to sun
                float pLen = length(p);
                vec3 up = p / pLen;
                float cosZenith = dot(up, sunDir);
                
                // Check if sun is blocked by Earth (Soft shadow / Penumbra to prevent geometric banding)
                float sunZenithRad = acos(clamp(cosZenith, -1.0, 1.0));
                float horizonAngle = 1.5707963 + acos(clamp(earthRadius / pLen, 0.0, 1.0));
                // Soft shadow over ~1.5 degrees (0.026 rad) penumbra
                float earthShadow = smoothstep(horizonAngle + 0.026, horizonAngle - 0.026, sunZenithRad);
                
                float sunZenithAngle = sunZenithRad * 57.29578;
                float chR = 1.0 / (max(0.0, cosZenith) + 0.15 * pow(max(0.001, 93.885 - sunZenithAngle), -1.253));
                float sunOptDepthR = exp(-height / Hr) * Hr * chR;
                float sunOptDepthM = exp(-height / Hm) * Hm * chR;
                
                vec3 tau = betaR * (optDepthR + sunOptDepthR) + betaM * 1.1 * (optDepthM + sunOptDepthM);
                
                // Ozone absorption (Chappuis band)
                vec3 ozone = vec3(3.426, 8.298, 0.356) * 6e-7 * (optDepthR + sunOptDepthR);
                vec3 attenuation = exp(-tau - ozone) * earthShadow;
                
                rayleigh += hr * attenuation;
                mie += hm * attenuation;
                timeProg += stepSize;
            }
            
            float cosTheta = dot(r, sunDir);
            float phaseR = 3.0 / (16.0 * 3.14159) * (1.0 + cosTheta * cosTheta);
            
            // 降低 g 值 (從 0.82 降至 0.76)，讓光暈邊緣有更平緩柔和的過渡，徹底消除太陽周圍的色階與硬圓圈
            float g = 0.76; 
            float phaseM = 3.0 / (8.0 * 3.14159) * ((1.0 - g * g) * (1.0 + cosTheta * cosTheta)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * cosTheta, 1.5));
            
            // 移除硬性截斷 (min)，改用平滑的縮放，讓光暈自然衰減，不會形成邊界明顯的圓塊
            // 因為 g 值降低，峰值亮度會下降，所以稍微調高乘數補償 (0.08 -> 0.12)
            phaseM = phaseM * 0.12; 
            
            // 稍微調降整體的亮度乘數，使整片天空暗下來
            vec3 scatter = 8.0 * (rayleigh * betaR * phaseR + mie * betaM * phaseM);
            
            // Nighttime ambient from stars/moon
            float nightAmbient = max(0.0, -sunDir.z * 0.5) * 0.005;
            
            return scatter + vec3(0.01, 0.015, 0.02) * nightAmbient;
        }

        void main() {
            // Inverse Stereographic Projection to find Altitude (sz)
            // Use gl_FragCoord directly to completely avoid full-screen quad triangle interpolation artifacts!
            float px = gl_FragCoord.x - resolution.x * 0.5;
            float py = gl_FragCoord.y - resolution.y * 0.5;
            float R2 = px*px + py*py;
            float rho2 = R2 / (4.0 * max(focalLen * focalLen, 0.001));
            float depth = (1.0 - rho2) / (1.0 + rho2);
            float k = 1.0 + rho2;
            float pu = py / (k * focalLen);
            float pr = px / (k * focalLen);
            
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
            float sz = depth * lz + pr * 0.0 + pu * uz;
            
            vec3 viewDir = normalize(vec3(vx, vy, sz));
            
            vec3 finalColor;
            
            if (sz >= -0.015) { 
                // Physical atmosphere scattering
                vec3 sunVec = normalize(sunPosition);
                
                float ditherVal = interleavedGradientNoise(gl_FragCoord.xy);
                vec3 physColor = getAtmosphere(viewDir, sunVec, turbidity, ditherVal);
                
                // Expose and tone map
                physColor = 1.0 - exp(-physColor * 1.5);
                
                // Add moonlight scattering if moon is the dominant light source (simple approximation)
                if (lightIntensity > 0.0 && dot(lightDir, sunPosition) < 0.9) {
                    float moonGlow = max(0.0, dot(viewDir, lightDir));
                    vec3 moonColor = vec3(0.5, 0.6, 0.8) * lightIntensity * 0.05 * pow(moonGlow, 4.0);
                    physColor += moonColor;
                }
                
                // Simple gradient fallback for night/no-atmosphere
                vec3 nightGrad = mix(midRGB, topRGB, smoothstep(0.0, 0.5, sz));
                nightGrad = mix(horRGB, nightGrad, smoothstep(-0.015, 0.1, sz));
                
                vec3 color = mix(nightGrad, physColor, atmosphereBlend);
                
                // ------------------
                // Local Light Pollution (Kaohsiung Skyglow - Bortle 8/9)
                // ------------------
                // Based on Falchi et al. World Atlas of Artificial Night Sky Brightness
                float nightFactor = smoothstep(-0.05, -0.2, sunPosition.z);
                if (nightFactor > 0.0) {
                    // Kaohsiung Geography: City expands East/North, Sea is West/SouthWest.
                    // Azimuth ~ 60 deg (ENE) for city core. vx = East, vy = North.
                    vec2 cityDir = normalize(vec2(0.866, 0.5)); 
                    vec2 viewAz = normalize(vec2(vx, vy));
                    
                    // Directional factor: 1.0 towards city, 0.0 towards sea
                    float cityFactor = dot(viewAz, cityDir) * 0.5 + 0.5;
                    cityFactor = smoothstep(0.1, 0.9, cityFactor); // Boost contrast between city/sea
                    
                    // Altitude decay (Garstang Model): peaking slightly above horizon
                    float alt = max(sz, 0.0);
                    float horizonGlow = exp(-alt * 6.0) * (1.0 - exp(-alt * 20.0));
                    float zenithGlow = exp(-alt * 1.5) * 0.15;
                    float glowDecay = horizonGlow * 1.5 + zenithGlow;
                    
                    // Sea side retains ~20% of the glow due to backscattering
                    float glowIntensity = mix(0.2, 1.0, cityFactor) * glowDecay;
                    
                    // High-pressure Sodium (HPS) and LED mixture (typical modern Kaohsiung)
                    // Color shifts slightly redder near the horizon and more neutral at zenith
                    vec3 baseGlowColor = vec3(1.0, 0.55, 0.25);
                    vec3 zenithGlowColor = vec3(0.8, 0.7, 0.6);
                    vec3 glowColor = mix(zenithGlowColor, baseGlowColor, exp(-alt * 3.0)) * 0.06;
                    
                    color += glowColor * glowIntensity * nightFactor;
                }
                
                // Skyline overlay
                float rawU = atan(vy, vx) / (2.0 * 3.1415926535) + 0.5;
                vec4 cityTex = getProceduralSkyline(rawU, sz);
                if (cityTex.a > 0.0) {
                    color = mix(color, cityTex.rgb, cityTex.a); 
                }
                
                finalColor = color;
            } else {
                // Ocean Base Background
                // Keep the same ocean logic to blend nicely with the physical sky
                vec3 sunVec = normalize(sunPosition);
                float ditherVal = interleavedGradientNoise(gl_FragCoord.xy);
                vec3 physOcean = getAtmosphere(normalize(vec3(vx, vy, 0.0)), sunVec, turbidity, ditherVal);
                physOcean = 1.0 - exp(-physOcean * 1.5);
                
                vec3 nightOcean = horRGB * 0.2; // Darker version of horizon color for sea base
                vec3 blendedOcean = mix(nightOcean, physOcean, atmosphereBlend);
                
                finalColor = blendedOcean * 0.15 + vec3(0.001, 0.002, 0.005);
            }
            
            // Screen-space RGB Dither to eliminate color banding (concentric circles)
            // Independent noise for RGB channels breaks quantization steps much better than monochromatic noise
            vec3 dither = vec3(
                interleavedGradientNoise(gl_FragCoord.xy),
                interleavedGradientNoise(gl_FragCoord.xy + vec2(12.3, 45.6)),
                interleavedGradientNoise(gl_FragCoord.xy + vec2(78.9, 12.3))
            ) - 0.5;
            finalColor += dither * 0.015; 
            
            gl_FragColor = vec4(finalColor, 1.0);
        }