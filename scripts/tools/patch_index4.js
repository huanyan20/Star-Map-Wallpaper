const fs = require('fs');
let code = fs.readFileSync('webgl_engine.js', 'utf8');

code = code.replace(
  /const lineMesh = new THREE\.LineSegments\(lineGeo, window\.constellationLinesMaterial\);\s*scene\.add\(lineMesh\);/,
  `window.constellationLineMesh = new THREE.LineSegments(lineGeo, window.constellationLinesMaterial);
        scene.add(window.constellationLineMesh);`,
);

code = code.replace(
  /renderer\.render\(scene, camera\);/,
  `if (window.constellationLineMesh && typeof toggles !== 'undefined') {
        window.constellationLineMesh.visible = toggles.constellations;
    }
    renderer.render(scene, camera);`,
);

fs.writeFileSync('webgl_engine.js', code);
