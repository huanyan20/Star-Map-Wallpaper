const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8081;
const rootDir = path.resolve(__dirname, '../dist');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm'
};

const server = http.createServer((request, response) => {
  let filePath = path.join(rootDir, request.url === '/' ? 'index.html' : request.url);
  
  // ignore query string
  filePath = filePath.split('?')[0];

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if(error.code === 'ENOENT') {
        console.log('HTTP 404:', request.url, '->', filePath);
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('File not found', 'utf-8');
      } else {
        response.writeHead(500);
        response.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
      }
    } else {
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(content, 'utf-8');
    }
  });
});

(async () => {
  console.log(`Starting http server on port ${PORT}...`);
  await new Promise(resolve => server.listen(PORT, resolve));

  console.log('Server started. Launching puppeteer...');
  let browser;
  try {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    let executablePath = null;
    for (const p of paths) {
      if (fs.existsSync(p)) {
        executablePath = p;
        break;
      }
    }

    const launchOptions = executablePath ? { executablePath } : {};
    if (executablePath) {
       console.log(`Using browser executable: ${executablePath}`);
    } else {
       console.log('No fallback browser found, relying on Puppeteer default.');
    }

    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();

    let hasErrors = false;

    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') {
        if (text.includes('favicon.ico')) return; // Ignore favicon errors
        if (text.includes('Failed to load resource: the server responded with a status of 404')) return; // Ignore 404s like favicon from console
        console.log('PAGE ERROR (console):', text);
        hasErrors = true;
      } else if (msg.type() === 'warning') {
        if (text.includes('THREE.WebGLProgram') || text.includes('THREE.Material') || text.includes('f_getProceduralSkyline') || text.includes('WebGL') || text.includes('warning')) {
          console.log('PAGE WARNING (WebGL):', text);
          hasErrors = true;
        } else {
          console.log('PAGE LOG:', text);
        }
      } else {
        console.log('PAGE LOG:', text);
      }
    });
    
    page.on('pageerror', error => {
      console.log('PAGE ERROR (exception):', error.message);
      hasErrors = true;
    });
    
    page.on('requestfailed', request => {
      const url = request.url();
      if (url.includes('favicon.ico')) return;
      console.log('REQUEST FAILED:', url, request.failure()?.errorText);
      hasErrors = true;
    });

    console.log(`Navigating to http://localhost:${PORT}/index.html...`);
    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 10000 });

    if (hasErrors) {
      console.error('Smoke test failed due to page errors.');
      process.exitCode = 1;
    } else {
      console.log('Smoke test passed successfully.');
    }
  } catch (e) {
    console.log('TEST ERROR:', e.message);
    process.exitCode = 1;
  } finally {
    if (browser) {
      await browser.close();
    }
    server.close();
  }
})();
