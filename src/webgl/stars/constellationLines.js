import * as THREE from 'three';

export function setupConstellationLines() {
  if (typeof CONSTELLATION_SEGMENTS !== 'undefined') {
    const numLines = CONSTELLATION_SEGMENTS.length;
    const linePositions = new Float32Array(numLines * 6 * 3); 
    const lineMidPositions = new Float32Array(numLines * 6 * 3);
    const lineUVs = new Float32Array(numLines * 6 * 2);

    for (let i = 0; i < numLines; i++) {
      const seg = CONSTELLATION_SEGMENTS[i];
      const ra1 = (seg[0] * Math.PI) / 180;
      const dec1 = (seg[1] * Math.PI) / 180;
      const ra2 = (seg[2] * Math.PI) / 180;
      const dec2 = (seg[3] * Math.PI) / 180;

      const A = new THREE.Vector3(
        Math.cos(dec1) * Math.cos(ra1),
        Math.cos(dec1) * Math.sin(ra1),
        Math.sin(dec1),
      );
      const B = new THREE.Vector3(
        Math.cos(dec2) * Math.cos(ra2),
        Math.cos(dec2) * Math.sin(ra2),
        Math.sin(dec2),
      );

      const mid = new THREE.Vector3().addVectors(A, B).normalize();
      const dir = new THREE.Vector3().subVectors(B, A).normalize();
      const widthDir = new THREE.Vector3().crossVectors(dir, mid).normalize();

      const w = 0.02;

      const v0 = new THREE.Vector3().copy(A).addScaledVector(widthDir, w);
      const v1 = new THREE.Vector3().copy(A).addScaledVector(widthDir, -w);
      const v2 = new THREE.Vector3().copy(B).addScaledVector(widthDir, w);
      const v3 = new THREE.Vector3().copy(B).addScaledVector(widthDir, -w);

      linePositions[i * 18 + 0] = v0.x;
      linePositions[i * 18 + 1] = v0.y;
      linePositions[i * 18 + 2] = v0.z;
      linePositions[i * 18 + 3] = v1.x;
      linePositions[i * 18 + 4] = v1.y;
      linePositions[i * 18 + 5] = v1.z;
      linePositions[i * 18 + 6] = v2.x;
      linePositions[i * 18 + 7] = v2.y;
      linePositions[i * 18 + 8] = v2.z;

      lineUVs[i * 12 + 0] = 0;
      lineUVs[i * 12 + 1] = 1;
      lineUVs[i * 12 + 2] = 0;
      lineUVs[i * 12 + 3] = -1;
      lineUVs[i * 12 + 4] = 1;
      lineUVs[i * 12 + 5] = 1;

      linePositions[i * 18 + 9] = v2.x;
      linePositions[i * 18 + 10] = v2.y;
      linePositions[i * 18 + 11] = v2.z;
      linePositions[i * 18 + 12] = v1.x;
      linePositions[i * 18 + 13] = v1.y;
      linePositions[i * 18 + 14] = v1.z;
      linePositions[i * 18 + 15] = v3.x;
      linePositions[i * 18 + 16] = v3.y;
      linePositions[i * 18 + 17] = v3.z;

      lineUVs[i * 12 + 6] = 1;
      lineUVs[i * 12 + 7] = 1;
      lineUVs[i * 12 + 8] = 0;
      lineUVs[i * 12 + 9] = -1;
      lineUVs[i * 12 + 10] = 1;
      lineUVs[i * 12 + 11] = -1;

      for (let vIdx = 0; vIdx < 6; vIdx++) {
        lineMidPositions[(i * 6 + vIdx) * 3 + 0] = mid.x;
        lineMidPositions[(i * 6 + vIdx) * 3 + 1] = mid.y;
        lineMidPositions[(i * 6 + vIdx) * 3 + 2] = mid.z;
      }
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('midPos', new THREE.BufferAttribute(lineMidPositions, 3));
    lineGeo.setAttribute('uv2', new THREE.BufferAttribute(lineUVs, 2));
    window.constellationLinesMaterial = window.createSpindleMaterial('#a0c8ff', 1.0);
    window.constellationLineMesh = new THREE.Mesh(lineGeo, window.constellationLinesMaterial);
    window.scene.add(window.constellationLineMesh);
  }
}
