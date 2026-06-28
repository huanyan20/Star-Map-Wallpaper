const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const badBlock = `if (hy >= H) {
          ctx.fillStyle = \`rgb(\${_bgCache.topRGB.join(',')})\`;
          // ctx.fillRect(0, 0, W, H); // Disabled to show WebGL behind
          ctx.clearRect(0, 0, W, H);
          
          // 1. Calculate background colors
          const bgSunAlt = toggles.atmosphere ? sunAlt_deg : -18;
          drawBackground(bgSunAlt, ts); // Updates _bgCache
          
          // 2. Render WebGL layer (Background, Ocean, Ecliptic, Stars, Lines)
          if (window.renderWebGL) {
              window.renderWebGL(ts, lst_deg, starVisibility, _bgCache.topRGB, _bgCache.horRGB, _bgCache.hy, H);
          }
          
          // Ensure _bgCache is populated
          const bgSunAlt = toggles.atmosphere ? sunAlt_deg : -18;
          drawBackground(bgSunAlt, ts); // Updates _bgCache but doesn't fillRect anymore
          
          if (window.renderWebGL) {
              window.renderWebGL(ts, lst_deg, starVisibility, _bgCache.topRGB, _bgCache.horRGB, _bgCache.hy, H);
          }
    
        }`;

code = code.replace(badBlock, `// WebGL handles below horizon now`);

// Now we need to insert the proper call to renderWebGL inside the render() function
// Let's find ctx.clearRect(0, 0, W, H); inside render()
const clearRectBlock = `ctx.clearRect(0, 0, W, H);`;
const properRenderCode = `ctx.clearRect(0, 0, W, H);
        
        // 1. Calculate background colors (updates _bgCache)
        const bgSunAlt = toggles.atmosphere ? sunAlt_deg : -18;
        drawBackground(bgSunAlt, ts); 
        
        // 2. Render WebGL layer (Background, Ocean, Ecliptic, Stars, Lines)
        if (window.renderWebGL) {
            window.renderWebGL(ts, lst_deg, starVisibility, _bgCache.topRGB, _bgCache.horRGB, _bgCache.hy, H);
        }`;

// We only want to replace the first occurrence of ctx.clearRect(0, 0, W, H); after 'const starVisibility = '
// Actually there's only one ctx.clearRect in render(). Let's just replace it.
// Wait, drawBackground has a ctx.clearRect now? No, we removed it in badBlock.
code = code.replace(clearRectBlock, properRenderCode);

fs.writeFileSync('index.html', code);
console.log('Fixed index.html completely!');
