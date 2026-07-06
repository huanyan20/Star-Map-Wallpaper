import * as THREE from 'three';

export function setupNamedStars() {
  if (typeof STARS !== 'undefined') {
    const numNamed = STARS.length;
    const positions = new Float32Array(numNamed * 3);
    const colors = new Float32Array(numNamed * 3);
    const mags = new Float32Array(numNamed);

    for (let i = 0; i < numNamed; i++) {
      const star = STARS[i];
      const ra_rad = (star.ra * 15 * Math.PI) / 180;
      const dec_rad = (star.dec * Math.PI) / 180;
      const mag = star.mag;

      positions[i * 3 + 0] = Math.cos(dec_rad) * Math.cos(ra_rad);
      positions[i * 3 + 1] = Math.cos(dec_rad) * Math.sin(ra_rad);
      positions[i * 3 + 2] = Math.sin(dec_rad);

      mags[i] = mag;

      let r = 1.0,
        g = 0.95,
        b = 0.7; 
      const sp = star.sp ? star.sp.charAt(0) : 'G';
      if (sp === 'O' || sp === 'B') {
        r = 0.5;
        g = 0.7;
        b = 1.0;
      } else if (sp === 'A') {
        r = 0.8;
        g = 0.85;
        b = 1.0;
      } else if (sp === 'F') {
        r = 1.0;
        g = 1.0;
        b = 0.8;
      } else if (sp === 'G') {
        r = 1.0;
        g = 0.95;
        b = 0.7;
      } else if (sp === 'K') {
        r = 1.0;
        g = 0.75;
        b = 0.4;
      } else if (sp === 'M') {
        r = 1.0;
        g = 0.5;
        b = 0.3;
      }

      colors[i * 3 + 0] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    window.namedStarsGeo = new THREE.BufferGeometry();
    window.namedStarsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    window.namedStarsGeo.setAttribute('starColor', new THREE.BufferAttribute(colors, 3));
    window.namedStarsGeo.setAttribute('starMag', new THREE.BufferAttribute(mags, 1));

    window.namedStarsMesh = new THREE.Points(window.namedStarsGeo, window.starsMaterial);
    window.scene.add(window.namedStarsMesh);
  }
}
