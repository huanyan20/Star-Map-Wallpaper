const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, '..', 'src'),
  path.join(__dirname, '..', 'src', 'webgl')
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  
  files.forEach(f => {
    let content = fs.readFileSync(path.join(dir, f), 'utf-8');
    let original = content;
    
    // Fix object keys
    content = content.replace(/window\.(lookAz|lookEl|hFOV|focalLen)\s*:/g, '$1:');
    
    // Fix function arguments
    content = content.replace(/function\s*\(\s*window\.(lookAz|lookEl|hFOV|focalLen)\s*\)/g, 'function ($1)');
    content = content.replace(/function\s+\w+\s*\(\s*window\.(lookAz|lookEl|hFOV|focalLen)\s*\)/g, 'function ($1)');

    // For any case where window.var is inside a parameter list, like function(a, window.hFOV)
    content = content.replace(/,\s*window\.(lookAz|lookEl|hFOV|focalLen)\b/g, ', $1');
    content = content.replace(/\(\s*window\.(lookAz|lookEl|hFOV|focalLen)\b/g, '($1');

    if (content !== original) {
      fs.writeFileSync(path.join(dir, f), content);
      console.log('Fixed', f);
    }
  });
});
