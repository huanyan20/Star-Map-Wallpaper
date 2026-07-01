const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'webgl');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

const globalVars = [
  'scene', 'camera', 'renderer', 
  'starsMaterial', 'fieldStarsGeo', 'namedStarsGeo', 
  'fieldStarsMesh', 'namedStarsMesh', 
  'starCatalogPromise', 'labelFontPromise', 'labelLayer', 
  'skyW', 'skyH',
  'initWebGL', 'renderWebGL', 'setupStars', 'updateSkyGeometry', 
  'setupShaders', 'setupGrids', 'setupLabelLayer', 'setupOcean', 
  'updateStarLOD'
];

files.forEach(f => {
  let content = fs.readFileSync(path.join(dir, f), 'utf-8');
  
  globalVars.forEach(v => {
    const regex = new RegExp(`(?<!\\.|\\w|function\\s+)${v}\\b`, 'g');
    content = content.replace(regex, `window.${v}`);
  });

  fs.writeFileSync(path.join(dir, f), content);
});

console.log('Fixed global variables in webgl files.');
