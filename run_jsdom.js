const jsdom = require("jsdom");
const { JSDOM } = jsdom;

(async () => {
  const resourceLoader = new jsdom.ResourceLoader({
    strictSSL: false,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
  });
  
  const virtualConsole = new jsdom.VirtualConsole();
  virtualConsole.on("error", () => { console.error("Error:", ...arguments); });
  virtualConsole.on("warn", () => { console.warn("Warn:", ...arguments); });
  virtualConsole.on("info", () => { console.info("Info:", ...arguments); });
  virtualConsole.on("dir", () => { console.dir("Dir:", ...arguments); });
  virtualConsole.on("log", () => { console.log("Log:", ...arguments); });

  try {
    const dom = await JSDOM.fromURL('http://localhost:5173/', {
      runScripts: "dangerously",
      resources: resourceLoader,
      virtualConsole: virtualConsole,
      pretendToBeVisual: true
    });

    console.log("Page loaded. Waiting for scripts...");
    
    setTimeout(() => {
      console.log('Finished waiting.');
      process.exit(0);
    }, 5000);
  } catch (err) {
    console.error("Fetch Error:", err);
  }
})();
