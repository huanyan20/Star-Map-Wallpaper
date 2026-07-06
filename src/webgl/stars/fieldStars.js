import * as THREE from 'three';

export function setupFieldStars(starCatalog) {
  if (starCatalog && starCatalog.count > 0) {
    window.fieldStarsGeo = new THREE.BufferGeometry();
    window.fieldStarsGeo.setAttribute('position', new THREE.BufferAttribute(starCatalog.positions, 3));
    window.fieldStarsGeo.setAttribute('starColor', new THREE.BufferAttribute(starCatalog.colors, 3, true));
    window.fieldStarsGeo.setAttribute('starMag', new THREE.BufferAttribute(starCatalog.magnitudes, 1));

    window.fieldStarsMesh = new THREE.Points(window.fieldStarsGeo, window.starsMaterial);
    window.scene.add(window.fieldStarsMesh);
  } else if (typeof REAL_STARS !== 'undefined') {
    // Fallback to JS array REAL_STARS
    const tempPositions = [];
    const tempColors = [];
    const tempMags = [];
    const colors = [
      [192 / 255, 216 / 255, 1.0],
      [1.0, 184 / 255, 112 / 255],
      [1.0, 232 / 255, 144 / 255],
      [216 / 255, 232 / 255, 1.0],
    ];

    for (let i = 0; i < REAL_STARS.length; i++) {
      const star = REAL_STARS[i];
      const mag = star[2];

      if (mag <= 3.0) continue;

      const ra_rad = (star[0] * Math.PI) / 180;
      const dec_rad = (star[1] * Math.PI) / 180;
      const bv = star[3];

      tempPositions.push(
        Math.cos(dec_rad) * Math.cos(ra_rad),
        Math.cos(dec_rad) * Math.sin(ra_rad),
        Math.sin(dec_rad),
      );

      tempMags.push(mag);

      let cIdx = 3; 
      if (bv < 0.0)
        cIdx = 0; 
      else if (bv > 1.4)
        cIdx = 1; 
      else if (bv > 0.6) cIdx = 2; 

      const c = colors[cIdx];
      tempColors.push(c[0], c[1], c[2]);
    }

    window.fieldStarsGeo = new THREE.BufferGeometry();
    window.fieldStarsGeo.setAttribute('position', new THREE.Float32BufferAttribute(tempPositions, 3));
    window.fieldStarsGeo.setAttribute('starColor', new THREE.Float32BufferAttribute(tempColors, 3));
    window.fieldStarsGeo.setAttribute('starMag', new THREE.Float32BufferAttribute(tempMags, 1));

    window.fieldStarsMesh = new THREE.Points(window.fieldStarsGeo, window.starsMaterial);
    window.scene.add(window.fieldStarsMesh);
  }
}
