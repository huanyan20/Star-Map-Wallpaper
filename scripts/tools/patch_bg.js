const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// Modify render loop to pass the colors to WebGL instead of drawing 2D background
code = code.replace(
  /drawBackground\(toggles\.atmosphere \? sunAlt_deg : -18, ts\);/,
  `// drawBackground(toggles.atmosphere ? sunAlt_deg : -18, ts); // Migrated to WebGL
        // We still need the colors calculated by drawBackground logic, so we call it but modify it to NOT draw, 
        // OR we just let drawBackground calculate _bgCache and comment out ctx.fillRect inside it.`
);

// We should just comment out ctx.fillStyle and ctx.fillRect inside drawBackground and drawOcean
code = code.replace(/ctx\.fillStyle = _bgCache\.gSky;/g, '// ctx.fillStyle = _bgCache.gSky;');
code = code.replace(/ctx\.fillRect\(0, 0, W, Math\.max\(0, hy\)\);/g, '// ctx.fillRect(0, 0, W, Math.max(0, hy));');
code = code.replace(/drawOcean\(hy, ts, horRGB\);/g, '// drawOcean(hy, ts, horRGB); // Migrated to WebGL');

// Pass background data to renderWebGL
code = code.replace(
  /if \(window\.renderWebGL\) window\.renderWebGL\(ts, lst_deg, starVisibility\);/,
  `
        // Ensure _bgCache is populated
        const bgSunAlt = toggles.atmosphere ? sunAlt_deg : -18;
        drawBackground(bgSunAlt, ts); // Updates _bgCache but doesn't fillRect anymore
        
        if (window.renderWebGL) {
            window.renderWebGL(ts, lst_deg, starVisibility, _bgCache.topRGB, _bgCache.horRGB, _bgCache.hy, H);
        }
  `
);

fs.writeFileSync('index.html', code);
console.log('index.html patched to send background data to WebGL');
