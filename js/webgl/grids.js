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

