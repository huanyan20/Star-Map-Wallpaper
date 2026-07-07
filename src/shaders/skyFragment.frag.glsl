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
        uniform float dpr;

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
            float baseAaAlpha = 1.0 - smoothstep(finalAlt - aa, finalAlt + aa, sz);
            baseAaAlpha *= smoothstep(-aa, aa, sz);
            
            if (baseAaAlpha > 0.0) {
                vec3 color = vec3(0.002, 0.005, 0.01);
                
                if (baseAaAlpha > 0.0) {
                    vec2 gridFloat = vec2(rawU * 3000.0, sz * 500.0);
                    vec2 grid = floor(gridFloat);
                    vec2 gridFract = fract(gridFloat);
                    
                    float lightProb = fract(sin(dot(grid, vec2(12.9898, 78.233))) * 43758.5453);
                    float density = smoothstep(0.03, 0.0, sz);
                    if (buildings > 0.005 || uDist85 < 0.01) density *= 2.0;
                    
                    if (lightProb > (1.0 - 0.015 * density)) {
                        float cHash = fract(sin(dot(grid, vec2(39.346, 11.135))) * 43758.5453);
                        vec3 lightColor = mix(vec3(1.0, 0.8, 0.3), vec3(0.7, 0.9, 1.0), cHash);
                        
                        // 消除硬切邊的方形雜訊，將燈光改為柔和的點光源
                        float dist = length(gridFract - vec2(0.5));
                        float dotAlpha = 1.0 - smoothstep(0.2, 0.4, dist);
                        color += lightColor * 1.5 * dotAlpha;
                    }
                }
                
                // 航空障礙燈與信號燈
                if (sz > 0.058 && sz < 0.062 && uDist85 < 0.001) {
                    float blink = step(0.5, sin(time * 2.0));
                    color += vec3(1.0, 0.2, 0.2) * 1.8 * blink;
                }
                
                result = vec4(color, baseAaAlpha);
            }
            return result;
        }

        // Simple noise with mod() to protect against precision loss on high resolution screens
        float hash(vec2 p) {
            p = mod(p, 512.0);
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        // Interleaved Gradient Noise for dithering
        float getDitherNoise(vec2 fragCoord) {
            vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
            return fract(magic.z * fract(dot(fragCoord, magic.xy)));
        }
        

        void main() {
            // Inverse Stereographic Projection to find Altitude (sz)
            // Divide by focal length early to avoid catastrophic precision loss at high zoom levels!
            float fLen = max(focalLen, 0.001);
            float px = (gl_FragCoord.x / dpr - resolution.x * 0.5) / fLen;
            float py = (gl_FragCoord.y / dpr - resolution.y * 0.5) / fLen;
            float rho2 = (px*px + py*py) / 4.0;
            float depth = (1.0 - rho2) / (1.0 + rho2);
            float k = 1.0 + rho2;
            float pu = py / k;
            float pr = px / k;
            
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
                vec3 sunVec = normalize(sunPosition);
                
                // Keep the sky base color anchored to the original gradient tones.
                vec3 baseGrad = mix(midRGB, topRGB, smoothstep(0.0, 0.5, sz));
                baseGrad = mix(horRGB, baseGrad, smoothstep(-0.015, 0.1, sz));
                
                // Push the overall sky toward a cooler, less green tone
                vec3 skyTint = mix(vec3(1.00, 0.88, 0.84), vec3(0.82, 0.90, 1.04), smoothstep(-0.02, 0.35, sz));
                vec3 color = baseGrad * skyTint;
                
                // Analytical Sun Glow (Stellarium style)
                float sunCosTheta = dot(viewDir, sunVec);
                float sunPhase = pow(max(0.0, sunCosTheta), 12.0) * 0.6 + pow(max(0.0, sunCosTheta), 4.0) * 0.15;
                float sunVisibility = smoothstep(-0.08, 0.0, sunVec.z) * atmosphereBlend;
                vec3 sunGlowColor = mix(vec3(1.0, 0.25, 0.05), vec3(1.0, 0.95, 0.85), smoothstep(-0.05, 0.15, sunVec.z));
                color += sunGlowColor * sunPhase * sunVisibility;
                
                // Add moonlight scattering if moon is the dominant light source
                if (lightIntensity > 0.0 && dot(lightDir, sunPosition) < 0.9) {
                    float moonGlow = max(0.0, dot(viewDir, lightDir));
                    vec3 moonColor = vec3(0.5, 0.65, 0.85) * lightIntensity * 0.1 * pow(moonGlow, 5.0) * atmosphereBlend;
                    color += moonColor;
                }
                
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
                vec3 sunVec = normalize(sunPosition);
                vec3 viewHoriz = normalize(vec3(vx, vy, 0.0));
                
                // Analytical sun reflection on the base ocean layer
                float sunCosTheta = dot(viewHoriz, sunVec);
                float sunPhase = pow(max(0.0, sunCosTheta), 8.0) * 0.3;
                float sunVisibility = smoothstep(-0.08, 0.0, sunVec.z) * atmosphereBlend;
                vec3 sunGlowColor = mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 0.95, 0.85), smoothstep(-0.05, 0.1, sunVec.z));
                vec3 physOcean = sunGlowColor * sunPhase * sunVisibility * 1.5;
                
                vec3 nightOcean = horRGB * 0.2; // Darker version of horizon color for sea base
                vec3 blendedOcean = mix(nightOcean, nightOcean + physOcean, atmosphereBlend);
                
                finalColor = blendedOcean * 0.15 + vec3(0.001, 0.002, 0.005);
            }
            float noiseSample = getDitherNoise(gl_FragCoord.xy);
            float horizonDitherWeight = smoothstep(-0.02, 0.06, sz) * atmosphereBlend;
            float ditherStrength = mix(0.0, 0.0022, horizonDitherWeight);
            finalColor += (noiseSample - 0.5) * ditherStrength;

            gl_FragColor = vec4(finalColor, 1.0);
        }