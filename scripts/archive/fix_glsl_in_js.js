const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'webgl');
if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  files.forEach(f => {
    const p = path.join(dir, f);
    let c = fs.readFileSync(p, 'utf8');
    const original = c;
    
    // Replace within backticks (template literals)
    // We match backticks and process their content.
    // Note: This simple regex approach works if there are no nested backticks or complex escapes,
    // which is true for these GLSL shaders.
    c = c.replace(/`([\s\S]*?)`/g, (match, p1) => {
      const fixed = p1.replace(/window\.(lookAz|lookEl|hFOV|focalLen|toggles|STAR_CHUNKS)/g, '$1');
      return `\`${fixed}\``;
    });

    if (c !== original) {
      fs.writeFileSync(p, c);
      console.log('Fixed', f);
    }
  });
}
