import * as THREE from 'three';
import { registerAdditiveSkyMaterial } from './additiveSkyMaterial.js';

function updateSkyGeometry() {
  if (!window.skyMesh || (window.skyW === window.innerWidth && window.skyH === window.innerHeight)) return;
  window.skyW = window.innerWidth;
  window.skyH = window.innerHeight;
  window.skyMesh.geometry.dispose();
  window.skyMesh.geometry = new THREE.PlaneGeometry(window.skyW, window.skyH);
}

function setupShaders() {
  const vertexShader = /* glsl */ `
        uniform mat3 eqToHoriz;
        uniform float lookAz;
        uniform float lookEl;
        uniform float focalLen;
        uniform float time;
        uniform float starVisibility;
        uniform float dpr;
        uniform float currentFov;
        uniform float chunkMaxFov;
        
        attribute float starMag;
        attribute vec3 starColor;
        
        varying vec3 vColor;
        varying float vAlpha;
        varying float vDepth;
        varying float vMag;
        varying float vAirMass;
        varying vec2 vPosHash;
        varying float vPtRatio;

        // 加入簡單的 hash 函數用於隨機打亂星等，解決星表資料量子化 (Quantization) 導致的同時閃現問題
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

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
            
            float currentDeg = currentFov * 57.2958;
            float magFade = 1.0;
            
            if (chunkMaxFov > 10.0) { 
                // 1. 基礎亮星 (Base Stars): 只在極度廣角時淡出，縮放時維持 100% 顯示
                if (currentDeg > 90.0) {
                    float t = clamp((currentDeg - 90.0) / 95.0, 0.0, 1.0);
                    float limitMag = mix(8.5, 3.5, t);
                    magFade = clamp((limitMag - starMag) * 0.5, 0.0, 1.0);
                }
            } else { 
                // 2. 動態暗星塊 (LOD Chunks): 完全基於「單顆星等 (starMag)」計算獨立的淡入視角區間
                // 這是真正的「依照星等細緻淡入」，每顆星都有自己專屬的起點與終點，絕對不會同時彈出！
                
                // 【終極解決星表量子化問題 (Dithering)】
                // 由於星表資料只有 300 個獨立的星等數值，代表同一個 Float 值下擠了幾千顆星星。
                // 如果不打亂，這幾千顆星會在同一個 Frame 瞬間滿足公式，導致視覺上的「同時出現」。
                // 我們利用這顆星的座標 hash 產生一個微小的隨機偏移 (-0.15 到 +0.15 星等)，打散這些相同的數值！
                float magOffset = (hash(position.xy) * 0.3) - 0.15;
                float ditheredMag = starMag + magOffset;
                
                // 根據物理經驗法則，設定基準：6.0 等星在 FOV=60 完全顯示，每暗 3.0 等，需要的 FOV 縮小一半
                // 計算這顆星「應該要 100% 顯示」的目標視角 (endFov)
                float endFov = 60.0 * exp2((6.0 - ditheredMag) / 3.0);
                
                // 設定淡入起點 (startFov)：提早一個八度（視野大一倍時）開始淡入
                // 例如 9.0 等星會在 FOV=60 時透明度為 0，縮小到 FOV=30 時透明度達到 1
                float startFov = endFov * 2.0;
                
                // 計算單顆星星獨立的淡入進度
                float linearFade = clamp((startFov - currentDeg) / max(startFov - endFov, 0.1), 0.0, 1.0);
                
                // 【終極平滑化 (Ease-in)】
                // 因為 Fragment Shader 為了繪製星芒與光暈，具有高達 7 倍的亮度增幅
                // 加上三次方曲線，徹底壓平剛出現時的亮度暴增，強迫星星緩緩浮現。
                magFade = linearFade * linearFade * linearFade;
            }

            
            // Alpha mapped to visual intensity (twinkle is applied in fragment shader)
            vAlpha = baseIntensity * clamp(starVisibility * 1.8, 0.0, 1.0) * magFade; // 提升整體透明度基準
            
            // Base size + strong halo for bright stars
            float zoomScale = focalLen / 500.0;
            // 放大基礎星星尺寸，並減緩縮放比例，讓中等星星(不大不小)在廣角時維持一定像素，避免閃爍
            float ptSize = max(7.5, baseIntensity * 6.0) * pow(zoomScale, 0.2);
            if (starMag < 3.0) {
                // 增加亮星的整體基礎大小 (1.0 -> 1.4)
                float brightBase = pow(max(0.0, 3.0 - starMag), 1.2) * 1.4;
                float currentZoom = pow(zoomScale, 0.9);
                
                // 最亮星 (starMag < 0.0) 維持原設定完全跟隨縮放。
                // 其餘亮星 (0.0 <= starMag < 3.0) 在視野最大時(zoomScale極小)維持下限，避免變太小。
                if (starMag >= 0.0) {
                    currentZoom = max(currentZoom, 0.45);
                }
                
                ptSize += brightBase * currentZoom; 
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
            
            float safeDepth = max(depth, -0.999);
            float k = 2.0 / (1.0 + safeDepth);
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

  const fragmentShader = /* glsl */ `
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
            // fBm-like oscillation (降低頻率)
            float n1 = sin(t * (2.5 + phase * 5.0) + phase * 6.28);
            float n2 = sin(t * (5.0 + phase * 7.5) - phase * 3.14) * 0.5;
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
            float twinkleAmp = min(0.45, 0.05 + 0.04 * vAirMass); 
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
            // 將衰減係數降低 (35.0 -> 22.0) 讓所有星星本體變「胖」，避免只佔不到一個像素而造成閃爍
            float core = exp(-r * 22.0) * 1.2;
            if (vMag < 2.0) {
                // 縮小最亮星的額外核心光暈範圍 (18.0 -> 28.0)
                core += exp(-r * 28.0) * clamp(2.0 - vMag, 0.0, 2.0) * 1.2; 
            }
            
            // 柔和邊緣 (Soft Halo) + 十字星芒 (Cross Lens Flare)
            float halo = 0.0;
            float flare = 0.0;
            if (vMag < 3.0) {
                // 再進一步縮小所有亮星的光暈範圍 (80.0 -> 100.0, 60.0 -> 80.0)
                float intensity = pow(clamp(3.0 - vMag, 0.0, 3.0), 1.2);
                halo = exp(-r * 100.0) * 0.01 * intensity;
                halo += exp(-r * 80.0) * 0.005 * intensity;
                
                // 十字星芒 (Lens Flare)
                // 將星芒再稍微變粗 (75.0 -> 50.0)
                float crossX = exp(-abs(pt.x) * 50.0) * exp(-abs(pt.y) * 8.0);
                float crossY = exp(-abs(pt.y) * 50.0) * exp(-abs(pt.x) * 8.0);
                flare = (crossX + crossY) * 0.25 * intensity;
            }
            
            // Combine with distance to center mask
            float mask = 1.0 - smoothstep(0.45, 0.5, r);
            float alpha = (core + halo + flare) * vAlpha * twinkle * 1.8 * mask;
            
            gl_FragColor = vec4(finalColor * alpha, alpha);
        }
    `;

  window.starsMaterial = new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    uniforms: {
      eqToHoriz: { value: new THREE.Matrix3() },
      lookAz: { value: Math.PI },
      lookEl: { value: 0 },
      focalLen: { value: 500 },
      time: { value: 0 },
      starVisibility: { value: 1.0 },
      dpr: { value: window.devicePixelRatio || 1.0 },
      currentFov: { value: 3.14159 },
      chunkMaxFov: { value: 100.0 },
    },
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    blending: THREE.AdditiveBlending,
  });
  registerAdditiveSkyMaterial(window.starsMaterial);

  const gridVertexShader = /* glsl */ `
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

  const gridFragmentShader = /* glsl */ `
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

  const spindleVertexShader = /* glsl */ `
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

  const spindleFragmentShader = /* glsl */ `
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
        eqToHoriz: window.starsMaterial.uniforms.eqToHoriz,
        lookAz: window.starsMaterial.uniforms.lookAz,
        lookEl: window.starsMaterial.uniforms.lookEl,
        focalLen: window.starsMaterial.uniforms.focalLen,
        starVisibility: window.starsMaterial.uniforms.starVisibility,
        lineColor: { value: color },
        centerFade: { value: centerFadeVal },
        baseAlpha: { value: baseAlphaVal },
      },
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.AdditiveBlending,
      extensions: { derivatives: true },
    });
  };

  window.createGridMaterial = function (
    colorHex,
    isHorizVal,
    centerFadeVal = 0.0,
    baseAlphaVal = 0.35,
  ) {
    const color = new THREE.Color(colorHex);
    return new THREE.ShaderMaterial({
      vertexShader: gridVertexShader,
      fragmentShader: gridFragmentShader,
      uniforms: {
        eqToHoriz: window.starsMaterial.uniforms.eqToHoriz,
        lookAz: window.starsMaterial.uniforms.lookAz,
        lookEl: window.starsMaterial.uniforms.lookEl,
        focalLen: window.starsMaterial.uniforms.focalLen,
        starVisibility: window.starsMaterial.uniforms.starVisibility,
        lineColor: { value: color },
        isHoriz: { value: isHorizVal },
        centerFade: { value: centerFadeVal },
        baseAlpha: { value: baseAlphaVal },
      },
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.AdditiveBlending,
      extensions: { derivatives: true },
    });
  };
}

window.setupMoon = function () {
  const moonTex = new THREE.TextureLoader().load('assets/moon.png');
  // moonTex.colorSpace = THREE.SRGBColorSpace; // if available
  const moonGeo = new THREE.PlaneGeometry(1, 1);

  const moonVertexShader = /* glsl */ `
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
            vec3 rawRight = cross(horiz, up);
            vec3 right;
            if (length(rawRight) < 0.001) {
                right = vec3(1.0, 0.0, 0.0);
            } else {
                right = normalize(rawRight);
            }
            vec3 top = normalize(cross(right, horiz));
            
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
            if (dot(normalize(horiz), viewFwd) < 0.0) {
                gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                return;
            }
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

  const moonFragmentShader = /* glsl */ `
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
            
            // 修正 Lambert 漫反射在球體邊緣產生的「暗邊」(Dark rim) 現象
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
      sunPos: { value: new THREE.Vector3() },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  window.moonMesh = new THREE.Mesh(moonGeo, window.moonMaterial);
  window.moonMesh.renderOrder = 5; // In front of stars (0)
  window.moonMesh.frustumCulled = false;
  window.scene.add(window.moonMesh);
};

window.setupSun = function () {
  const sunGeo = new THREE.PlaneGeometry(1, 1);
  const sunVertexShader = /* glsl */ `
        uniform mat3 eqToHoriz; 
        uniform float lookAz; 
        uniform float lookEl; 
        uniform float focalLen; 
        uniform vec3 celestialPos; 
 
        varying vec2 vUv; 
 
        void main() { 
            vUv = uv; 
            vec2 c = uv * 2.0 - 1.0; 
             
            vec3 horiz = eqToHoriz * celestialPos; 
             
            float lx = sin(lookAz) * cos(lookEl); 
            float ly = cos(lookAz) * cos(lookEl); 
            float lz = sin(lookEl); 
             
            float rx = cos(lookAz); 
            float ry = -sin(lookAz); 
             
            float ux = ry * lz; 
            float uy = -rx * lz; 
            float uz = cos(lookEl); 
             
            vec3 viewFwd = vec3(lx, ly, lz); 
            if (dot(normalize(horiz), viewFwd) < 0.0) { 
                gl_Position = vec4(2.0, 2.0, 2.0, 1.0); 
                return; 
            } 
            vec3 viewRight = vec3(rx, ry, 0.0); 
            vec3 viewUp = vec3(ux, uy, uz); 
             
            // Project the exact center of the sun to avoid stereographic distortion of large quads
            float p_fwd = dot(horiz, viewFwd); 
            float p_right = dot(horiz, viewRight); 
            float p_up = dot(horiz, viewUp); 
             
            float rho2 = (1.0 - p_fwd) / max(0.0001, 1.0 + p_fwd); 
            float k = 1.0 + rho2; 
             
            float cx = p_right * k * focalLen; 
            float cy = p_up * k * focalLen; 
            
            float angularSize = 2.5;  
            float offsetSize = (angularSize / 2.0) * k * focalLen;
            float px = cx + c.x * offsetSize; 
            float py = cy + c.y * offsetSize; 
             
            gl_Position = projectionMatrix * modelViewMatrix * vec4(px, py, 0.0, 1.0); 
        } 
    `;

  const sunFragmentShader = /* glsl */ `
        uniform float time;
        uniform mat3 eqToHoriz; 
        uniform vec3 celestialPos; 
        uniform float atmosphereBlend;
        
        varying vec2 vUv; 
 
        void main() { 
            vec2 c = vUv * 2.0 - 1.0; 
            float r = length(c); 
            if (r > 1.0) discard; 
            
            // Per-pixel altitude calculation to prevent large triangle interpolation artifacts
            vec3 horiz = eqToHoriz * celestialPos; 
            vec3 up = vec3(0.0, 0.0, 1.0); 
            vec3 rawRight = cross(horiz, up); 
            vec3 right = length(rawRight) < 0.001 ? vec3(1.0, 0.0, 0.0) : normalize(rawRight); 
            vec3 top = normalize(cross(right, horiz)); 
            float angularSize = 2.5;  
            vec3 dir = normalize(horiz + (c.x * right + c.y * top) * (angularSize / 2.0)); 
            float vAltitude = dir.z;
            
            float angle = atan(c.y, c.x);
             
            // Core sun disk 
            float coreRadius = 0.007; 
             
            // Color shifts towards orange/red near horizon 
            float altFactor = smoothstep(-0.05, 0.2, vAltitude); 
            vec3 sunColor = mix(vec3(1.0, 0.4, 0.2), vec3(1.0, 0.98, 0.95), altFactor); 
            vec3 haloColor = mix(vec3(1.0, 0.3, 0.1), vec3(1.0, 0.9, 0.8), altFactor); 
             
            float core = 1.0 - smoothstep(coreRadius, coreRadius + 0.001, r); 
            
            // 大氣散射本身畫的人工光暈因為是背景產物，大白天已經非常漂亮的 Mie 散射了，
            // 這邊太陽光圈不能疊死。
            float halo = pow(max(0.0, 1.0 - r), 5.0) * 0.05; // 再次下修，極微弱
             
            float rayStrength = max(0.0, 1.0 - abs(vAltitude) * 5.0); 
            float rayPattern = sin(angle * 8.0 - time * 0.1) * 0.5 + 0.5;
            rayPattern *= sin(angle * 13.0 + 1.2 + time * 0.05) * 0.5 + 0.5;
            rayPattern *= sin(angle * 5.0 - 0.5 - time * 0.15) * 0.5 + 0.5;
            
            float rayFade = pow(max(0.0, 1.0 - r * 1.2), 2.0);
            
            // 將星芒亮度降到幾乎只有點綴，避免干擾物理大氣
            float rays = rayPattern * rayFade * rayStrength * 0.05; // 從0.25 降到 0.05
             
            // 確保核心維持高亮，且外側有柔和過渡
            vec3 finalColor = mix(haloColor, vec3(1.0, 1.0, 1.0), core); 
            finalColor += haloColor * rays;
            float alpha = min(1.0, core + halo + rays);
            
            // 把太陽材質透明度再壓低一點點，避免遮擋背景真實天空散射背後的星
            alpha *= 0.6;
             
            // Soft horizon fade out 
            float horizonFade = smoothstep(-0.04, 0.02, vAltitude); 
             
            gl_FragColor = vec4(finalColor, alpha * horizonFade * atmosphereBlend); 
        } 
    `;

  window.sunMaterial = new THREE.ShaderMaterial({
    vertexShader: sunVertexShader,
    fragmentShader: sunFragmentShader,
    uniforms: {
      eqToHoriz: { value: new THREE.Matrix3() },
      lookAz: { value: 0.0 },
      lookEl: { value: 0.0 },
      focalLen: { value: 1.0 },
      celestialPos: { value: new THREE.Vector3() },
      time: { value: 0.0 },
      atmosphereBlend: { value: 1.0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });

  window.sunMesh = new THREE.Mesh(sunGeo, window.sunMaterial);
  window.sunMesh.renderOrder = 5;
  window.sunMesh.frustumCulled = false;
  window.scene.add(window.sunMesh);
};

window.updateSkyGeometry = updateSkyGeometry;
window.setupShaders = setupShaders;

