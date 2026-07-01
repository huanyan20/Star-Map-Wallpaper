const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// Inject scripts
code = code.replace(
  /<script src="real_stars\.js"><\/script>/,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="webgl_engine.js"></script>
  <script src="real_stars.js"></script>`,
);

// Call initWebGL
code = code.replace(
  /const canvas = document\.getElementById\('canvas'\);\s*const ctx = canvas\.getContext\('2d'\);/,
  `const canvas = document.getElementById('canvas');
      const ctx = canvas.getContext('2d');
      // Wait for globals to be ready, then init
      setTimeout(() => { if(window.initWebGL) window.initWebGL(); }, 0);`,
);

// Modify render loop
code = code.replace(
  /ctx\.fillRect\(0, 0, W, H\);/,
  `// ctx.fillRect(0, 0, W, H); // Disabled to show WebGL behind
        ctx.clearRect(0, 0, W, H);
        if (window.renderWebGL) window.renderWebGL(ts, lst_deg);`,
);

// Disable 2D rendering of things WebGL will handle now
code = code.replace(/drawBackground\(sunAlt_deg, ts\);/, `// drawBackground(sunAlt_deg, ts);`);

code = code.replace(/drawFieldStars\(lst_deg, ts\);/, `// drawFieldStars(lst_deg, ts);`);

// The milkyway might also obscure it if it draws its own background
// Wait, Milky Way is drawn with composite operations. Let's keep it for now.

fs.writeFileSync('index.html', code);
console.log('index.html updated for Phase 1 Migration');
