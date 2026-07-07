import './bootstrap.js';
import './vendor/astronomy.browser.js';
import './webgl/globals.js';
import './webgl/additiveSkyMaterial.js';
import './webgl/render.js';
import './webgl/init.js';

// Use Dynamic Imports to code-split WebGL features and heavy modules
Promise.all([
  import('./webgl/stars.js'),
  import('./webgl/labels.js'),
  import('./webgl/ocean.js'),
  import('./webgl/sky.js'),
  import('./webgl/grids.js'),
  import('./webgl/milkyway.js'),
  import('./webgl/nebulas.js'),
  import('./webgl/bloom.js')
]).then(() => {
  // Start the main application loop only after WebGL modules are loaded
  import('./app.js');
});
