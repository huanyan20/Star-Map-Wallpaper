const fs = require('fs');
const https = require('https');

https.get('https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json', (resp) => {
  let data = '';
  resp.on('data', (chunk) => { data += chunk; });
  resp.on('end', () => {
    const json = JSON.parse(data);
    let segments = [];
    for (const feature of json.features) {
        const id = feature.id;
        const coords = feature.geometry.coordinates;
        for (const line of coords) {
            for (let i = 0; i < line.length - 1; i++) {
                const p1 = typeof line[i] === 'string' ? line[i].split(' ').map(Number) : line[i];
                const p2 = typeof line[i+1] === 'string' ? line[i+1].split(' ').map(Number) : line[i+1];
                let ra1 = p1[0] < 0 ? 360 + p1[0] : p1[0];
                let ra2 = p2[0] < 0 ? 360 + p2[0] : p2[0];
                segments.push([ra1, p1[1], ra2, p2[1], id]);
            }
        }
    }
    const jsCode = "const CONSTELLATION_SEGMENTS = " + JSON.stringify(segments) + ";\n";
    fs.writeFileSync('constellations_data.js', jsCode);
    console.log('Generated constellations_data.js with ' + segments.length + ' segments');
  });
}).on("error", (err) => {
  console.log("Error: " + err.message);
});
