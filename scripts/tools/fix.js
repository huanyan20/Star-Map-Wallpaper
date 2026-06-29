const fs = require('fs');
let code = fs.readFileSync('webgl_engine.js', 'utf8');
code = code.replace(/function initWebGL\(\) \{[\s\S]*?setupStars\(\);\n\}/, ''); // Remove the first one
fs.writeFileSync('webgl_engine.js', code);
