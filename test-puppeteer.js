const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');

const PORT = 4173;
const BROWSER_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium-1223', 'chrome-win64', 'chrome.exe')
].filter(Boolean);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.bin': 'application/octet-stream',
  '.css': 'text/css; charset=utf-8'
};

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname);
  const filePath = path.join(__dirname, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

(async () => {
  let browser;
  const errors = [];
  try {
    await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
    const executablePath = BROWSER_PATHS.find(candidate => fs.existsSync(candidate));
    browser = await puppeteer.launch({ headless: 'new', executablePath });
    const page = await browser.newPage();
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error' && !text.includes('Failed to load resource')) errors.push(text);
    });
    page.on('pageerror', err => errors.push(err.message));
    page.on('response', resp => {
      if (resp.status() >= 400 && !resp.url().endsWith('/favicon.ico')) {
        errors.push(`${resp.status()} ${resp.url()}`);
      }
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle0' });
    await page.click('#btn-star-names');
    await page.click('#btn-con-names');
    await page.click('#btn-grid');
    await page.click('#btn-ecliptic');
    await wait(1200);
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('Smoke test passed');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => {
  console.error(error);
  server.close();
  process.exit(1);
});
