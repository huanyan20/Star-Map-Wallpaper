# STAR Architecture Memory Map

Last updated: 2026-07-03 (Milestone v1.1 — Nebula DSO Decals Active)

## Main Architecture
STAR is a WebGL-based lively wallpaper application built with Three.js and Vite. It utilizes raw astronomical data (Tycho-2 catalog) to render an accurate, interactive night sky.

### Core Components
- **Application Entry**: `src/app.js` initializes the scene and handles user interactions. Time is currently fixed at 21:00 local for development/testing.
- **WebGL Subsystem**: Handles all rendering logic.
  - `src/webgl/init.js`: Sets up the renderer, camera, scene, and base shaders. Calls all `setup*` hooks including `setupMilkyWay` and `setupNebulas`.
  - `src/webgl/render.js`: Manages the main render loop, camera positioning, and time updates. Propagates uniforms to all materials. **Render output goes through `renderBloom()` (5-pass bloom pipeline) instead of a bare `renderer.render()` call.**
  - `src/webgl/bloom.js`: 5-pass post-processing bloom pipeline. Pass 1: full scene → HALF_FLOAT rtScene. Pass 2: luminance threshold → rtBright (½ res). Pass 3-4: separable 9-tap Gaussian blur (H then V) → rtBlurB. Pass 5: additive composite (scene + bloom) → screen. Tunable via `window.bloomCfg.{enabled, threshold, strength}`.
  - `src/webgl/sky.js` & shaders (`skyFragment`, `skyVertex`): Renders the procedural, physically-based sky and atmospheric scattering.
  - `src/webgl/ocean.js` & shaders: Renders the ocean with realistic wave normals and lighting.
  - `src/webgl/stars.js` & `src/webgl/labels.js`: Manages the massive star catalog buffer and constellation labels.
  - `src/webgl/milkyway.js`: Particle-based Milky Way (300k points). Loads `assets/mw_particles.bin`. Exposes `window.setupMilkyWay`, `window.mwMaterial`, `window.mwMesh`.
  - `src/webgl/nebulas.js`: Texture-decal nebula overlays. Loads config from `assets/nebulas.json` (optional, gracefully absent). Exposes `window.setupNebulas`, `window.nebulaMaterials` (array).
- **Module Load Order** (`src/main.js`): bootstrap → vendor → globals → stars → labels → ocean → sky → grids → milkyway → nebulas → **bloom** → render → init → app
- **Data Processing**:
  - `scripts/build_assets.js`: Generates MSDF fonts.
  - `scripts/build_tycho2.js`: Compiles the raw Tycho-2 catalog into an optimized binary format.
  - `scripts/build_mw_particles.js`: Generates `public/assets/mw_particles.bin` (300k galactic particles via rejection sampling from `milkyway.png`).

## Indexing Ignore Rules
The `codebase-memory-mcp` knowledge graph is actively maintained. To reduce noise and improve search efficiency, the following paths are ignored via `.cbmignore` and successfully excluded from the index:
- `.archive/` (Old backup files)
- `dist/` (Vite build output)
- `node_modules/` (Dependencies)
- `public/assets/` & `assets/` (Compiled binary data and generated font textures)
- `temp/` (Raw Tycho-2 source data and scratch files)

## Key Design Decisions
- **Stereographic projection** is used in all star/milkyway/nebula vertex shaders (not Three.js camera matrix) for correct panoramic rendering.
- **Additive blending** is used for milkyway particles and nebula decals.
- All "sky-space" materials share the same uniform set: `eqToHoriz` (equatorial-to-horizontal rotation matrix), `lookAz`, `lookEl`, `focalLen`, `starVisibility`, `dpr`.
- **Nebula alpha**: Fragment shader derives alpha from **luminance** (`dot(rgb, vec3(0.299,0.587,0.114))`) instead of texture alpha channel. This lets black-background PNG textures work correctly with additive blending without requiring a dedicated alpha channel.
- `window.toggles.milkyway` drives `window.mwMesh.visible` each frame.

## Milestone Status: v1.0 — Milky Way Pipeline Complete
- ✅ Tycho-2 star catalog with HEALPix LOD indexing
- ✅ Physical atmosphere (Rayleigh/Mie scattering)
- ✅ Moon with halo, phase, bump mapping
- ✅ Sun with atmospheric scattering
- ✅ Ocean with animated wave normals
- ✅ Constellation lines, equatorial/alt-az grids, ecliptic
- ✅ Milky Way particle system (300k pts) — fully wired into render pipeline
- ✅ Nebula texture-decal system — **active** with 6 Messier DSOs (M31, M42, M45, M13, M8, M20). Textures in `assets/nebulas/`, config in `assets/nebulas.json`.
- ✅ Smoke test passing (build + puppeteer headless)
- 🔲 Bundle code-split (main JS ~953 kB minified, candidate for dynamic import)
- 🔲 Time unlock from fixed 21:00 (dev mode convenience)
- ✅ `nebulas.json` config and nebula textures — complete (M31 M42 M45 M13 M8 M20)

## Remaining Complex Hotspots
While the codebase has been significantly cleaned up and refactored, the following modules remain large or computationally dense and are candidates for future optimization or refactoring:
- `src/webgl/sky.js`
- `src/webgl/render.js`
- `src/webgl/stars.js`
- `src/app.js`

## Documentation Index
- `docs/architecture-memory-map.md` — this file
- `docs/assets.md` — asset pipeline explanation
- `docs/walkthrough.md` — feature walkthrough
- `docs/quality-plan.md` — quality maintenance plan (moved from root)
- `docs/refactor-plan.md` — mid-size module refactor roadmap (moved from root)
- `docs/twilight-artifacts.md` — twilight visual artifact notes
- `docs/repo-cleanup-plan.md` — repository cleanup history
