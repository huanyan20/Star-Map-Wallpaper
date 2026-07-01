const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

code = code.replace(
  /<script src="webgl_engine\.js"><\/script>/,
  `<script src="constellations_data.js"></script>
  <script src="webgl_engine.js"></script>`,
);

code = code.replace(
  /if \(toggles\.constellations\) drawConstellationLines\(lst_deg\);/,
  `// if (toggles.constellations) drawConstellationLines(lst_deg); // Handled by WebGL`,
);

fs.writeFileSync('index.html', code);
