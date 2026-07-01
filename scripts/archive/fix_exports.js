const fs = require('fs');
let code = fs.readFileSync('src/astronomy_engine.js', 'utf8');
code = code.replace(/^export\s+([A-Z_]+)\s*=/gm, 'export const $1 =');
code = code.replace(/^export\s+([a-zA-Z0-9_]+)\(/gm, 'export function $1(');
fs.writeFileSync('src/astronomy_engine.js', code);
