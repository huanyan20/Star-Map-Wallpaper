import * as THREE from 'three';
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

        // ?�入簡單??hash ?�數?�於?��??��??��?，解決�?表�??��?子�? (Quantization) 導致?��??��??��?�?
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
            // 縮�??��??��?亮度差�?，�?高�??��?低亮�?(0.35 -> 0.55)
            float baseIntensity = clamp(1.0 - (perceivedMag + 1.5) / 13.0, 0.55, 1.0); 
            
            vColor = starColor;
            vMag = starMag;
            
            float currentDeg = currentFov * 57.2958;
            float magFade = 1.0;
            
            if (chunkMaxFov > 10.0) { 
                // 1. ?��?亮�? (Base Stars): ?�在極度�???�淡?��?縮放?�維??100% 顯示
                if (currentDeg > 90.0) {
                    float t = clamp((currentDeg - 90.0) / 95.0, 0.0, 1.0);
                    float limitMag = mix(8.5, 3.5, t);
                    magFade = clamp((limitMag - starMag) * 0.5, 0.0, 1.0);
                }
            } else { 
                // 2. ?��??��?�?(LOD Chunks): 完全?�於?�單顆�?�?(starMag)?��?算獨立�?淡入視�??�??
                // ?�是?�正?�「�??��?等細緻淡?�」�?每�??�都?�自己�?屬�?起�??��?點�?絕�?不�??��?彈出�?
                
                // ?��?極解決�?表�?子�??��? (Dithering)??
                // ?�於?�表資�??��? 300 ?�獨立�??��??�值�?�?��?��???Float ?��??��?幾�?顆�??��?
                // 如�?不�?亂�??�幾?��??��??��?一??Frame ?��?滿足?��?，�??��?覺�??�「�??�出?�」�?
                // ?�們利?�這�??��?座�? hash ?��?一?�微小�??��??�移 (-0.15 ??+0.15 ?��?)，�???���??��??�數?��?
                float magOffset = (hash(position.xy) * 0.3) - 0.15;
                float ditheredMag = starMag + magOffset;
                
                // ?��??��?經�?法�?，設定基準�?6.0 等�???FOV=60 完全顯示，�???3.0 等�??�要�? FOV 縮�?一??
                // 計�??��??�「�?該�? 100% 顯示?��??��?視�? (endFov)
                float endFov = 60.0 * exp2((6.0 - ditheredMag) / 3.0);
                
                // 設�?淡入起�? (startFov)：�??��??�八度�?視�?大�??��?）�?始淡??
                // 例�? 9.0 等�??�在 FOV=60 ?�透�?度為 0，縮小到 FOV=30 ?�透�?度�???1
                float startFov = endFov * 2.0;
                
                // 計�??��??��??��??�淡?�進度
                float linearFade = clamp((startFov - currentDeg) / max(startFov - endFov, 0.1), 0.0, 1.0);
                
                // ?��?極平滑�? (Ease-in)??
                // ?�為 Fragment Shader ?��?繪製?��??��??��??��?高�? 7 ?��?亮度增�?
                // ?��?三次?�曲線�?徹�?壓平?�出?��??�亮度暴增�?強迫?��?緩緩浮現??
                magFade = linearFade * linearFade * linearFade;
            }

            
            // Alpha mapped to visual intensity (twinkle is applied in fragment shader)
            vAlpha = baseIntensity * clamp(starVisibility * 1.8, 0.0, 1.0) * magFade; // ?��??��??��?度基�?
            
            // Base size + strong halo for bright stars
            float zoomScale = focalLen / 500.0;
            // 稍微?�大?��??��?尺寸，�??��???1080p ?�足夠�?素能亮起 (2.5 -> 3.5)
            float ptSize = max(5.5, baseIntensity * 5.0) * pow(zoomScale, 0.3);
            if (starMag < 3.0) {
                // 大�?縮�?亮�??��??��??��?實�?大�?
                ptSize += pow(max(0.0, 3.0 - starMag), 1.2) * 1.0 * pow(zoomScale, 0.9); 
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
            // fBm-like oscillation (?��??��?)
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
            // 高�??��? (Highlight Core)
            float core = exp(-r * 35.0) * 1.2;
            if (vMag < 2.0) {
                core += exp(-r * 20.0) * clamp(2.0 - vMag, 0.0, 2.0) * 1.5; // 增強極亮?��??��?
            }
            
            // ?��??�緣 (Soft Halo) + ?��??��? (Cross Lens Flare)
            float halo = 0.0;
            float flare = 0.0;
            if (vMag < 3.0) {
                // ?�次大�??��?亮�??��?範�??�強�?
                float intensity = pow(clamp(3.0 - vMag, 0.0, 3.0), 1.2);
                halo = exp(-r * 40.0) * 0.02 * intensity;
                halo += exp(-r * 25.0) * 0.01 * intensity; 
                
                // ?��??��? (Lens Flare)
                float crossX = exp(-abs(pt.x) * 120.0) * exp(-abs(pt.y) * 20.0);
                float crossY = exp(-abs(pt.y) * 120.0) * exp(-abs(pt.x) * 20.0);
                flare = (crossX + crossY) * 0.03 * intensity;
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
            
            // ?��?�?Fragment Shader 計�??�平線�?�?
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
            
            // ?�大平面尺寸以容納�??��???(0.06 -> 0.18)
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
            // ?��??��??��???0.3333 (?�平?�放大�?3??0.06 -> 0.18)
            float moonRadius = 0.3333;
            float r = length(c);
            
            // 3. 大氣?��?顏色?�移 (Atmospheric Refraction Tint)
            float altFactor = clamp(vAltitude * 8.0, 0.0, 1.0);
            // ?��??�平線�??��?紅�?高仰角�??�白
            vec3 atmTint = mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 1.0, 1.0), altFactor);
            // 低仰角�?稍微變�?
            float atmAlpha = mix(0.75, 1.0, altFactor);
            
            // 2. ?��??��? (Lunar Halo)
            float haloDist = clamp((r - moonRadius) / (1.0 - moonRadius), 0.0, 1.0);
            vec3 haloColor = mix(vec3(1.0, 0.6, 0.3), vec3(0.85, 0.95, 1.0), altFactor);
            // ?�晶徑�?漸層：內?�強，�??��??�淡??
            float haloAlpha = pow(1.0 - haloDist, 2.0) * 0.5 * atmAlpha; 
            
            if (r > moonRadius) {
                gl_FragColor = vec4(haloColor * atmTint, haloAlpha);
                return;
            }
            
            // 1. ?�面?�形山�??��? UV ?�曲
            vec2 moon_c = c / moonRadius;
            float r2 = dot(moon_c, moon_c);
            
            // 建�? 3D ?�面法�?
            vec3 baseNormal = normalize(vec3(moon_c.x, moon_c.y, sqrt(max(0.0, 1.0 - r2))));
            
            // 稍微縮�??�樣?��?，強?�避?��??�自帶�?黑色?�鋸齒�?�?(Bypass black anti-aliased padding)
            vec2 safe_c = moon_c * 0.92;
            
            // ?�本??2D ?�影 UV
            vec2 flatUv = safe_c * 0.5 + 0.5;
            // ?�用?�面法�?將平?��? UV ?�曲，產??3D ?��??�緣?�透�???
            vec2 sphereUv = baseNormal.xy * 0.46 + 0.5; 
            // 混�??�本??flat UV ?��?�?UV，避?�現?�照?��?�??度�?�?
            vec2 finalUv = mix(flatUv, sphereUv, 0.4);
            
            vec4 texColor = texture2D(map, finalUv);
            
            // ?��?影�??�實 Alpha，確保�??��??��?黑色?��?
            float texTrueAlpha = texColor.a * smoothstep(0.02, 0.08, max(texColor.r, max(texColor.g, texColor.b)));
            
            // 將�??��??��?轉為微�?線�?�?(Bump mapping)，強?�環形山?�緣?��?體�?
            float bump = (texColor.r - 0.5) * 0.8;
            vec3 vNormal = normalize(baseNormal + vec3(bump, bump, 0.0));
            
            // 修正 Lambert 漫�?射在?��??�緣?��??�「�??��?Dark rim) ?�象
            // 將�?線�?微�??�鏡?�方??(0,0,1)，�?滿�??�亮?��??�緣也能?�收?��?足�?�?
            vec3 finalNormal = normalize(mix(vNormal, vec3(0.0, 0.0, 1.0), 0.6));
            
            // Lambert 漫�?�?+ ?�影?�渡 (Phase Terminator)
            float NdotL = dot(finalNormal, vLightDir);
            float diff = smoothstep(-0.05, 0.2, NdotL);
            float ambient = 0.02; 
            float lighting = diff + ambient;
            
            vec3 bodyColor = texColor.rgb * lighting * atmTint;
            
            // ?�鋸齒�??��?�?
            float edgeSoftness = smoothstep(1.0, 0.92, r2);
            float bodyAlpha = texTrueAlpha * atmAlpha * edgeSoftness;
            
            // ?��??��??��??��?後�??��?
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
            
            // 大�??��??�本?�畫?�人工�??��??�為?�景?�物?�大�?��經�??�常漂亮??Mie ????��?�?
            // ?��?太�??��??��??�死??
            float halo = pow(max(0.0, 1.0 - r), 5.0) * 0.05; // ?�次下修?�極微弱
             
            float rayStrength = max(0.0, 1.0 - abs(vAltitude) * 5.0); 
            float rayPattern = sin(angle * 8.0 - time * 0.1) * 0.5 + 0.5;
            rayPattern *= sin(angle * 13.0 + 1.2 + time * 0.05) * 0.5 + 0.5;
            rayPattern *= sin(angle * 5.0 - 0.5 - time * 0.15) * 0.5 + 0.5;
            
            float rayFade = pow(max(0.0, 1.0 - r * 1.2), 2.0);
            
            // 將�??�亮度�??�幾乎只?��?點綴，避?�干?�物?�大�?
            float rays = rayPattern * rayFade * rayStrength * 0.05; // �?0.25 ?�到 0.05
             
            // ?��??��?維�?高亮，�?外�??��??��???
            vec3 finalColor = mix(haloColor, vec3(1.0, 1.0, 1.0), core); 
            finalColor += haloColor * rays;
            float alpha = min(1.0, core + halo + rays);
            
            // ?��??�質?��?度�?壓�?一點�?，避?��??�景?��?天空?��?後�???
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

