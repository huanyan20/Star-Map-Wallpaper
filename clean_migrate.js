const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// 1. Inject scripts
code = code.replace(
  /<script src="real_stars\.js"><\/script>/,
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script src="constellations_data.js"></script>
  <script src="webgl_engine.js"></script>
  <script src="real_stars.js"></script>`
);

// 2. Init WebGL
code = code.replace(
  /const canvas = document\.getElementById\('canvas'\);\s*const ctx = canvas\.getContext\('2d'\);/,
  `const canvas = document.getElementById('canvas');
      const ctx = canvas.getContext('2d');
      setTimeout(() => { if(window.initWebGL) window.initWebGL(); }, 0);`
);

// 3. renderWebGL call
code = code.replace(
  /ctx\.clearRect\(0, 0, W, H\);/,
  `// 1. Calculate background colors
        const bgSunAlt = toggles.atmosphere ? sunAlt_deg : -18;
        drawBackground(bgSunAlt, ts); // Updates _bgCache
        
        ctx.clearRect(0, 0, W, H);
        
        // 2. Render WebGL layer
        if (window.renderWebGL) {
            window.renderWebGL(ts, lst_deg, starVisibility, _bgCache.topRGB, _bgCache.horRGB, _bgCache.hy, H);
        }`
);

// 4. Comment out old drawBackground call in render()
code = code.replace(
  /drawBackground\(toggles\.atmosphere \? sunAlt_deg : -18, ts\);/,
  `// drawBackground(toggles.atmosphere ? sunAlt_deg : -18, ts); // Handled before clearRect`
);

// 5. Disable drawing in drawBackground
code = code.replace(
  /ctx\.fillStyle = _bgCache\.gSky;\s*ctx\.fillRect\(0, 0, W, Math\.max\(0, hy\)\);/,
  `// ctx.fillStyle = _bgCache.gSky;
        // ctx.fillRect(0, 0, W, Math.max(0, hy));`
);

code = code.replace(
  /drawOcean\(hy, ts, horRGB\);/,
  `// drawOcean(hy, ts, horRGB);`
);

code = code.replace(
  /if \(hy >= H\) \{\s*ctx\.fillStyle = `rgb\(\$\{_bgCache\.topRGB\.join\(\',\ '\)\}\)`;\s*ctx\.fillRect\(0, 0, W, H\);\s*\}/,
  `if (hy >= H) {
          // ctx.fillStyle = \`rgb(\${_bgCache.topRGB.join(',')})\`;
          // ctx.fillRect(0, 0, W, H);
        }`
);

// 6. Disable old FieldStars
code = code.replace(
  /drawFieldStars\(lst_deg, ts\);/,
  `// drawFieldStars(lst_deg, ts);`
);

// 7. Disable old ConstellationLines
code = code.replace(
  /if \(toggles\.constellations\) drawConstellationLines\(lst_deg\);/,
  `// if (toggles.constellations) drawConstellationLines(lst_deg);`
);

fs.writeFileSync('index.html', code);
console.log('index.html clean migration successful!');
