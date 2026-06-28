# STAR WebGL Performance Optimization Plan

## Summary

Optimize the Lively Wallpaper build by moving the large background star catalog to a binary asset, rendering all canvas text through a WebGL SDF/MSDF label layer, and throttling slow-moving astronomy calculations.

The runtime target is Lively Wallpaper / Edge WebView2, where project files are served through an HTTP-like local server. Published builds should include generated assets, while local development keeps scripts to regenerate them.

## Key Changes

- Add an asset pipeline with `npm run build:assets`.
- Generate `assets/stars.bin` from `real_stars.js` and load it with `fetch()` as an `ArrayBuffer`.
- Generate a SDF/MSDF-style label atlas from the exact runtime glyph set and load it as `assets/labels.json` plus `assets/labels.png`.
- Update `webgl_engine.js` so star geometry is created from binary typed-array views instead of the `REAL_STARS` JavaScript array.
- Add a WebGL label layer for all runtime text: star names, constellation names, horizon/cardinal labels, grid degree labels, zenith, and ecliptic label.
- Remove runtime `ctx.fillText` usage from the render path.
- Add astronomy-position caching so Sun/Moon RA/Dec and related derived values are recomputed every 500 ms, or immediately after a simulated clock jump larger than 60 seconds.
- Fix per-frame sky geometry reallocation by updating sky geometry only when the viewport changes.

## Test Plan

- Run `npm run build:assets` and verify generated asset counts.
- Serve the folder over HTTP and verify `index.html` loads without console/page errors.
- Toggle star names, constellation names, horizon grid, and ecliptic labels.
- Confirm `index.html` contains no active `ctx.fillText`/`ctx.strokeText` render calls.
- Compare FPS and load-time behavior before and after the optimization.

## Assumptions

- Lively Wallpaper can resolve `fetch('assets/stars.bin')`.
- `real_stars.js` remains as a build input, not as a runtime dependency.
- The generated label atlas is shipped with the wallpaper package.
