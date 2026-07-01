const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, '..', 'src'),
  path.join(__dirname, '..', 'src', 'webgl'),
  path.join(__dirname, '..', 'src', 'shaders')
];

const globalVars = ['lookAz', 'lookEl', 'hFOV', 'focalLen', 'toggles', 'STAR_CHUNKS'];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  
  files.forEach(f => {
    let content = fs.readFileSync(path.join(dir, f), 'utf-8');
    let original = content;
    
    globalVars.forEach(v => {
      // Replace only if not preceded by window., function , const, let, var, or .
      const regex = new RegExp(`(?<!\\.|\\w|function\\s+|const\\s+|let\\s+|var\\s+|window\\.)\\b${v}\\b`, 'g');
      content = content.replace(regex, `window.${v}`);
    });
    
    // Now fix object keys (e.g. { window.lookAz: 1 })
    content = content.replace(/window\.(lookAz|lookEl|hFOV|focalLen|toggles|STAR_CHUNKS)\s*:/g, '$1:');
    
    // Fix function arguments specifically (e.g. function(window.lookAz))
    // We only want to strip window. if it's inside function( ... window.xxx ... )
    // A simple hack: just find 'function (window.hFOV)' and replace it
    content = content.replace(/function\s*\(\s*window\.(lookAz|lookEl|hFOV|focalLen)\s*\)/g, 'function ($1)');
    content = content.replace(/function\s+\w+\s*\(\s*window\.(lookAz|lookEl|hFOV|focalLen)\s*\)/g, 'function ($1)');
    
    // Check if there are multi-parameter functions with window.var
    // Like function(a, window.hFOV)
    content = content.replace(/function\s*\([^)]*?,\s*window\.(lookAz|lookEl|hFOV|focalLen)\b/g, (match, p1) => {
        return match.replace(/window\./, '');
    });

    if (content !== original) {
      fs.writeFileSync(path.join(dir, f), content);
      console.log('Fixed', f);
    }
  });
});
