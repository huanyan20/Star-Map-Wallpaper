const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// 1. Remove the entire corrupted block from drawBackground
code = code.replace(
  /if \(hy >= H\) \{\s*ctx\.fillStyle = `rgb\(\$\{_bgCache\.topRGB\.join\(\',\ '\)\}\)`;\s*\/\/ ctx\.fillRect\(0, 0, W, H\);\s*ctx\.clearRect\(0, 0, W, H\);\s*\/\/ Ensure _bgCache is populated\s*const bgSunAlt = toggles\.atmosphere \? sunAlt_deg : -18;\s*drawBackground\(bgSunAlt, ts\);\s*if \(window\.renderWebGL\) \{\s*window\.renderWebGL\(ts, lst_deg, starVisibility, _bgCache\.topRGB, _bgCache\.horRGB, _bgCache\.hy, H\);\s*\}\s*\}/g,
  `if (hy >= H) {
          // ctx.fillStyle = \`rgb(\${_bgCache.topRGB.join(',')})\`;
          // ctx.fillRect(0, 0, W, H);
        }`,
);

// 2. Insert renderWebGL into render()
// Wait, I should find exactly where to insert it.
// It goes right after ctx.clearRect(0, 0, W, H); inside function render(ts)
code = code.replace(
  /ctx\.clearRect\(0, 0, W, H\);/,
  `ctx.clearRect(0, 0, W, H);
        
        // 1. Calculate background colors
        const bgSunAlt = toggles.atmosphere ? sunAlt_deg : -18;
        drawBackground(bgSunAlt, ts); // Updates _bgCache
        
        // 2. Render WebGL layer (Background, Ocean, Ecliptic, Stars, Lines)
        if (window.renderWebGL) {
            window.renderWebGL(ts, lst_deg, starVisibility, _bgCache.topRGB, _bgCache.horRGB, _bgCache.hy, H);
        }`,
);

fs.writeFileSync('index.html', code);
console.log('index.html fixed!');
