const fs = require('fs');
let code = fs.readFileSync('webgl_engine.js', 'utf8');

code = code.replace(/window\.skyMesh\.position\.z = -900;/g, 'window.skyMesh.position.z = -500;');

fs.writeFileSync('webgl_engine.js', code);
