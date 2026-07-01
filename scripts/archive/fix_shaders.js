const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'src', 'shaders');
if (fs.existsSync(dir)) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js') || f.endsWith('.glsl'));
  files.forEach(f => {
    const p = path.join(dir, f);
    let c = fs.readFileSync(p, 'utf8');
    const original = c;
    c = c.replace(/window\.(lookAz|lookEl|hFOV|focalLen|toggles|STAR_CHUNKS)/g, '$1');
    if (c !== original) {
      fs.writeFileSync(p, c);
      console.log('Fixed', f);
    }
  });
}
