# STAR Architecture Memory Map

## Main Architecture
STAR is a WebGL-based lively wallpaper application built with Three.js and Vite. It utilizes raw astronomical data (Tycho-2 catalog) to render an accurate, interactive night sky.

### Core Components
- **Application Entry**: `src/app.js` initializes the scene and handles user interactions.
- **WebGL Subsystem**: Handles all rendering logic.
  - `src/webgl/init.js`: Sets up the renderer, camera, scene, and base shaders.
  - `src/webgl/render.js`: Manages the main render loop, camera positioning, and time updates.
  - `src/webgl/sky.js` & shaders (`skyFragment`, `skyVertex`): Renders the procedural, physically-based sky and atmospheric scattering.
  - `src/webgl/ocean.js` & shaders: Renders the ocean with realistic wave normals and lighting.
  - `src/webgl/stars.js` & `src/webgl/labels.js`: Manages the massive star catalog buffer and constellation labels.
- **Data Processing**:
  - `scripts/build_assets.js`: Generates MSDF fonts.
  - `scripts/build_tycho2.js`: Compiles the raw Tycho-2 catalog into an optimized binary format.

## Indexing Ignore Rules
The `codebase-memory-mcp` knowledge graph is actively maintained. To reduce noise and improve search efficiency, the following paths are ignored via `.cbmignore` and successfully excluded from the index:
- `.archive/` (Old backup files)
- `dist/` (Vite build output)
- `node_modules/` (Dependencies)
- `public/assets/` & `assets/` (Compiled binary data and generated font textures)

## Remaining Complex Hotspots
While the codebase has been significantly cleaned up and refactored, the following modules remain large or computationally dense and are candidates for future optimization or refactoring:
- `src/webgl/sky.js`
- `src/webgl/render.js`
- `src/webgl/stars.js`
- `src/app.js`
