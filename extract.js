const fs = require('fs');
const path = require('path');

function extractShader(filePath, varName, ext) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const regex = new RegExp(`const\\s+${varName}\\s*=\\s*\\/\\*\\s*glsl\\s*\\*\\/\\s*\`([\\s\\S]*?)\`;`);
    const match = content.match(regex);
    if (match) {
        const shaderCode = match[1];
        const outPath = path.join(__dirname, 'src', 'shaders', `${varName.replace('Shader', '')}.${ext}.glsl`);
        fs.writeFileSync(outPath, shaderCode.trim());
        console.log(`Extracted ${varName} to ${outPath}`);
        
        // Replace in original file
        content = content.replace(regex, ''); // Remove the string definition
        
        // Add import at the top
        const importStr = `import ${varName} from '../shaders/${varName.replace('Shader', '')}.${ext}.glsl';\n`;
        content = importStr + content;
        fs.writeFileSync(filePath, content);
    } else {
        console.log(`Could not find ${varName} in ${filePath}`);
    }
}

// Extract from init.js
const initJs = path.join(__dirname, 'js', 'webgl', 'init.js');
extractShader(initJs, 'skyVertexShader', 'vert');
extractShader(initJs, 'skyFragmentShader', 'frag');

// Extract from ocean.js
const oceanJs = path.join(__dirname, 'js', 'webgl', 'ocean.js');
extractShader(oceanJs, 'oceanVertexShader', 'vert');
extractShader(oceanJs, 'oceanFragmentShader', 'frag');
