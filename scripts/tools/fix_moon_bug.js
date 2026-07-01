const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

code = code.replace(
  /const moonRaDec = getMoonRaDec\(jd\);\s*const moonPhase = getMoonPhase\(jd\);/g,
  `const moonRaDec = getMoonRaDec(jd);
        const moonPhase = moonRaDec.phase || 0.5;`,
);

fs.writeFileSync('index.html', code);
console.log('Fixed moonPhase bug in index.html');
