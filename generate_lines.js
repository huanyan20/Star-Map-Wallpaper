const fs = require('fs');
const data = JSON.parse(fs.readFileSync('constellations_d3.json', 'utf8'));

let segments = [];
let names = [];

for (const feature of data.features) {
    const id = feature.id; // e.g. "And"
    const coords = feature.geometry.coordinates;
    
    // coords is an array of LineStrings
    for (const line of coords) {
        for (let i = 0; i < line.length - 1; i++) {
            const p1 = line[i].split(' ').map(Number);
            const p2 = line[i+1].split(' ').map(Number);
            
            // p[0] is RA in degrees (-180 to 180), p[1] is Dec in degrees
            let ra1 = p1[0] < 0 ? 360 + p1[0] : p1[0];
            let dec1 = p1[1];
            
            let ra2 = p2[0] < 0 ? 360 + p2[0] : p2[0];
            let dec2 = p2[1];
            
            segments.push([ra1, dec1, ra2, dec2, id]);
        }
    }
}

const jsCode = "const CONSTELLATION_SEGMENTS = " + JSON.stringify(segments) + ";\n";
fs.writeFileSync('constellations_data.js', jsCode);
console.log('Generated constellations_data.js with ' + segments.length + ' segments');
