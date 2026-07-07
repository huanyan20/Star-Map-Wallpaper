# STAR Codebase Rules

## Context Initialization
- **CRITICAL**: At the start of EVERY conversation or task, you MUST review **`docs/architecture-memory-map.md`** first. This file serves as the definitive codebase memory map for the STAR project.
- **CRITICAL**: After reviewing the architecture memory map, review any other relevant markdown (`.md`) files in the project (e.g., `README.md`, `docs/performance-plan.md`, etc.) using the `view_file` tool to establish a complete understanding before performing edits.
- *Note*: If `codebase-memory-mcp` tools (like `get_architecture`, `search_graph`) are available in the tool list, use them. Otherwise, rely on `grep_search` and `docs/architecture-memory-map.md`.

## Architecture & Performance Guidelines
- **Strict GPU Offloading**: Never compute per-star or per-particle coordinates, positions, or animations (e.g., twinkling) on the CPU within the render loop. Always use a single `BufferGeometry` with `THREE.Points` and handle transformations (`eqToHoriz`) and animations (via `uTime` and `seed` attributes) entirely within Vertex and Fragment Shaders.
- **Draw Call Minimization**: Do not create individual `THREE.Mesh` or `THREE.Sprite` objects for large entity collections. Merge them into unified buffers.
- **Wallpaper Engine Awareness**: STAR is a lively wallpaper. It must not waste CPU cycles when paused. Always respect and implement listeners for wallpaper engine events (e.g., `livelyWallpaperPlaybackChanged`, `wallpaperPropertyListener`) to pause `requestAnimationFrame` and throttle FPS accordingly.
- **Avoid Expensive Fragment Ops**: Avoid expensive per-pixel distance/falloff math in Fragment Shaders (e.g., procedural glowing spheres). Instead, use pre-baked soft sprite textures with `AdditiveBlending`.
- **Atmospheric Scattering Performance**: Avoid brute-force per-pixel raymarching (`getAtmosphere()`-style loops, e.g. 96+ Rayleigh/Mie steps) at full resolution every frame. Prefer one of: (a) bake the result into a small LUT texture updated only when sun angle changes meaningfully, (b) render the sky pass to a half/quarter-res target and upscale (same pattern as `bloom.js`), or (c) reduce to ~16-24 non-uniform (denser-near-horizon) samples. Validate any change by A/B measuring actual FPS delta before committing to a rewrite.
