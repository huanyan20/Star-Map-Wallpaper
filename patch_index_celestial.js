const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// The call in render() currently looks like:
// window.renderWebGL(ts, lst_deg, starVisibility, _bgCache.topRGB, _bgCache.horRGB, _bgCache.hy, H);

// We need to pass sunRaDec (in rad), moonRaDec (in rad) and phase
code = code.replace(
  /window\.renderWebGL\(ts, lst_deg, starVisibility, _bgCache\.topRGB, _bgCache\.horRGB, _bgCache\.hy, H\);/,
  `window.renderWebGL(
                ts, lst_deg, starVisibility, 
                _bgCache.topRGB, _bgCache.horRGB, _bgCache.hy, H,
                { ra: sunRaDec.ra, dec: sunRaDec.dec },
                { ra: moonRaDec.ra, dec: moonRaDec.dec },
                moonPhase
            );`
);

// We need to define moonPhase if it's not defined, or get it from getMoonPhase
code = code.replace(
  /const moonRaDec = getMoonRaDec\(jd\);/,
  `const moonRaDec = getMoonRaDec(jd);
        const moonPhase = getMoonPhase(jd);`
);

// Comment out drawSun
code = code.replace(
  /if \(sunAltAz\.alt > toRad\(-0\.5\)\) drawSun\(sunAltAz\.alt, sunAltAz\.az\);/,
  `// if (sunAltAz.alt > toRad(-0.5)) drawSun(sunAltAz.alt, sunAltAz.az); // Migrated to WebGL`
);

// Disable drawMoon inside render() if it exists
code = code.replace(
  /drawMoon\(/g,
  `// drawMoon(`
);

fs.writeFileSync('index.html', code);
console.log('index.html patched with Sun and Moon payload');
