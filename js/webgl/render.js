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

    const mats = [starsMaterial];
    for(const c of STAR_CHUNKS) {
        if(c.loaded && c.pointsMesh && c.pointsMesh.material) mats.push(c.pointsMesh.material);
    }
    for(const mat of mats) {
        mat.uniforms.eqToHoriz.value.copy(m);
        mat.uniforms.lookAz.value = lookAz;
        mat.uniforms.lookEl.value = lookEl;
        mat.uniforms.focalLen.value = focalLen();
        mat.uniforms.time.value = ts / 1000.0;
        mat.uniforms.starVisibility.value = typeof starVisibility !== "undefined" ? starVisibility : 1.0;
        mat.uniforms.dpr.value = window.devicePixelRatio || 1.0;
    }

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


    if (window.sunMesh && sunCoords) {
        const sDec = sunCoords.dec * Math.PI / 180;
        const sRa = sunCoords.ra * 15 * Math.PI / 180;
        window.sunMaterial.uniforms.celestialPos.value.set(
            Math.cos(sDec) * Math.cos(sRa),
            Math.cos(sDec) * Math.sin(sRa),
            Math.sin(sDec)
        );
        window.sunMaterial.uniforms.eqToHoriz.value.copy(m);
        window.sunMaterial.uniforms.lookAz.value = lookAz;
        window.sunMaterial.uniforms.lookEl.value = lookEl;
        window.sunMaterial.uniforms.focalLen.value = focalLen();
        window.sunMaterial.uniforms.time.value = ts / 1000.0;
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

