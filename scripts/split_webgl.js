const fs = require('fs');
const lines = fs.readFileSync('js/webgl_engine.js', 'utf8').split(/\r?\n/);

function getLines(start, end) {
  return lines.slice(start - 1, end).join('\n') + '\n';
}

const globals = getLines(1, 10);
const stars = getLines(11, 113) + getLines(1390, 1555);
const labels = getLines(114, 135) + getLines(1877, 1880);
const ocean = getLines(136, 652);
const sky = getLines(653, 660) + getLines(887, 1389) + getLines(1881, 2064) + getLines(2228, 2360);
const grids = getLines(1556, 1876);
const render = getLines(2065, 2223);
const init = getLines(661, 886) + getLines(2224, 2227);

fs.writeFileSync('js/webgl/globals.js', globals, 'utf8');
fs.writeFileSync('js/webgl/stars.js', stars, 'utf8');
fs.writeFileSync('js/webgl/labels.js', labels, 'utf8');
fs.writeFileSync('js/webgl/ocean.js', ocean, 'utf8');
fs.writeFileSync('js/webgl/sky.js', sky, 'utf8');
fs.writeFileSync('js/webgl/grids.js', grids, 'utf8');
fs.writeFileSync('js/webgl/render.js', render, 'utf8');
fs.writeFileSync('js/webgl/init.js', init, 'utf8');

console.log('Files split successfully.');
