const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

code = code.replace(
  /const moonPhase = getMoonPhase\(jd\);/g,
  `const moonPhase = moonRaDec.phase;`
);

fs.writeFileSync('index.html', code);
console.log('Fixed moonPhase bug in index.html!');
