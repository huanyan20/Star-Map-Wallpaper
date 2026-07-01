const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, '..', 'src'),
  path.join(__dirname, '..', 'src', 'webgl')
];

const globalVars = [
  'lookAz', 'lookEl', 'hFOV', 'focalLen', 'toggles', 'STAR_CHUNKS'
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  
  files.forEach(f => {
    let content = fs.readFileSync(path.join(dir, f), 'utf-8');
    let original = content;
    
    // Convert declarations
    content = content.replace(/^let\s+lookAz/gm, 'window.lookAz');
    content = content.replace(/^let\s+lookEl/gm, 'window.lookEl');
    content = content.replace(/^let\s+hFOV/gm, 'window.hFOV');
    content = content.replace(/^const\s+toggles/gm, 'window.toggles');
    content = content.replace(/^const\s+STAR_CHUNKS/gm, 'window.STAR_CHUNKS');
    content = content.replace(/^function\s+focalLen\(/gm, 'window.focalLen = function(');

    // Also replace focalLen() with window.focalLen()
    
    // Replace all isolated references
    globalVars.forEach(v => {
      const regex = new RegExp(`(?<!\\.|\\w|function\\s+|const\\s+|let\\s+|var\\s+|window\\.)${v}\\b`, 'g');
      content = content.replace(regex, `window.${v}`);
    });

    if (content !== original) {
      fs.writeFileSync(path.join(dir, f), content);
      console.log('Fixed', f);
    }
  });
});
