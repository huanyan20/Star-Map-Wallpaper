const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const startMarker = 'js/astronomy_engine.js"></script>';
const endMarker = '</body>';

const startIdx = html.indexOf(startMarker);
const endIdx = html.lastIndexOf(endMarker);

if (startIdx !== -1 && endIdx !== -1) {
    let scriptBlock = html.substring(startIdx + startMarker.length, endIdx);
    
    // Find the actual <script> tag start and </script> end within scriptBlock
    const scriptTagStart = scriptBlock.indexOf('<script>');
    const scriptTagEnd = scriptBlock.lastIndexOf('</script>');
    
    if (scriptTagStart !== -1 && scriptTagEnd !== -1) {
        let scriptContent = scriptBlock.substring(scriptTagStart + 8, scriptTagEnd);
        fs.writeFileSync('js/main.js', scriptContent, 'utf8');
        
        let newHtml = html.substring(0, startIdx + startMarker.length) + 
                      '\n  <script src="js/main.js"></script>\n' + 
                      html.substring(startIdx + startMarker.length + scriptTagEnd + 9);
                      
        fs.writeFileSync('index.html', newHtml, 'utf8');
        console.log('Extracted to main.js');
    } else {
        console.log('Inner script tags not found');
    }
} else {
    console.log('Markers not found');
}
