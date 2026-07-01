const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// Replace the bad moon if block
code = code.replace(
  /if \(moonAltAz\.alt > toRad\(-0\.5\)\) \/\/ drawMoon\(moonAltAz\.alt, moonAltAz\.az, moonRaDec\.phase\);/,
  `// Moon rendering migrated to WebGL`,
);

// Just to be absolutely safe, let's also check the sun if block
code = code.replace(
  /if \(sunAltAz\.alt > toRad\(-0\.5\)\) \/\/ drawSun\(sunAltAz\.alt, sunAltAz\.az\); \/\/ Migrated to WebGL/,
  `// Sun rendering migrated to WebGL`,
);

fs.writeFileSync('index.html', code);
console.log('Fixed inline if commenting bug in index.html');
