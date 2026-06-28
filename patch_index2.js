const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

code = code.replace(
  /if \(window\.renderWebGL\) window\.renderWebGL\(ts, lst_deg\);/,
  `if (window.renderWebGL) window.renderWebGL(ts, lst_deg, starVisibility);`
);

fs.writeFileSync('index.html', code);
