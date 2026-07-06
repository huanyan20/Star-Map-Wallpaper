# STAR Codebase Rules

## Context Initialization
- **CRITICAL**: At the start of EVERY conversation or task, you MUST review **all markdown (`.md`) files** in the project (e.g., `docs/*.md`, `README.md`, etc.) using the `view_file` tool.
- **CRITICAL**: Following the markdown review, you MUST use the `codebase-memory-mcp` tools (such as `get_architecture`, `search_graph`, etc.) to read and establish a complete understanding of the STAR project content before performing any code edits or implementation planning.

## Architecture & Performance Guidelines
- **Strict GPU Offloading**: Never compute per-star or per-particle coordinates, positions, or animations (e.g., twinkling) on the CPU within the render loop. Always use a single `BufferGeometry` with `THREE.Points` and handle transformations (`eqToHoriz`) and animations (via `uTime` and `seed` attributes) entirely within Vertex and Fragment Shaders.
- **Draw Call Minimization**: Do not create individual `THREE.Mesh` or `THREE.Sprite` objects for large entity collections. Merge them into unified buffers.
- **Wallpaper Engine Awareness**: STAR is a lively wallpaper. It must not waste CPU cycles when paused. Always respect and implement listeners for wallpaper engine events (e.g., `livelyWallpaperPlaybackChanged`, `wallpaperPropertyListener`) to pause `requestAnimationFrame` and throttle FPS accordingly.
- **Avoid Expensive Fragment Ops**: Avoid expensive per-pixel distance/falloff math in Fragment Shaders (e.g., procedural glowing spheres). Instead, use pre-baked soft sprite textures with `AdditiveBlending`.
