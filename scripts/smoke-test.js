const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 8081;
const rootDir = path.resolve(__dirname, '..');

(async () => {
  console.log(`Starting http-server on port ${PORT}...`);
  const server = spawn('npx', ['http-server', '-p', PORT.toString(), '-c-1'], {
    cwd: rootDir,
    shell: true,
  });

  // Wait a moment for the server to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('Launching puppeteer...');
  let browser;
  try {
    browser = await puppeteer.launch();
    const page = await browser.newPage();

    let hasErrors = false;

    page.on('console', msg => {
      if (msg.type() === 'error') {
        if (msg.text().includes('favicon.ico')) return; // Ignore favicon errors
        console.log('PAGE ERROR (console):', msg.text());
        hasErrors = true;
      } else {
        console.log('PAGE LOG:', msg.text());
      }
    });
    
    page.on('pageerror', error => {
      console.log('PAGE ERROR (exception):', error.message);
      hasErrors = true;
    });
    
    page.on('requestfailed', request => {
      const url = request.url();
      if (url.includes('favicon.ico')) return;
      console.log('REQUEST FAILED:', url, request.failure().errorText);
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
    server.kill();
    // Sometimes Windows requires taskkill for child processes, but server.kill() usually works for http-server.
  }
})();
