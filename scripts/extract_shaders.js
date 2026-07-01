const fs = require('fs');
const path = require('path');

const dir = 'c:\\Users\\ggini\\Desktop\\STAR\\src\\shaders';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.glsl.js'));

for (let f of files) {
    const fullPath = path.join(dir, f);
    let content = fs.readFileSync(fullPath, 'utf8');
    
    if (content.startsWith('export default `')) {
        content = content.substring(16);
    }
    content = content.replace(/`;?\s*$/, '');
    
    const newName = f.replace('.glsl.js', '.glsl');
    fs.writeFileSync(path.join(dir, newName), content, 'utf8');
    fs.unlinkSync(fullPath);
}
console.log('Shaders converted successfully.');
