# Moon Rendering Implementation Plan

The goal is to render the Moon in the 3D WebGL engine, complete with its correct astronomical position, orientation, and dynamic lighting phases (e.g., Crescent, Full Moon).

## Proposed Changes

### `webgl_engine.js`

1. **Create `setupMoon()` function:**
   - Load the existing `moon.png` texture.
   - Create a `THREE.PlaneGeometry(1, 1)` to serve as a billboard for the moon.
   - Define a custom `moonVertexShader`. This shader will take the `celestialPos` (equatorial coordinates) of the moon, construct a local tangent plane so the moon correctly tilts with the celestial sphere, and then project it to the screen using the camera's FOV and rotation.
   - Define a custom `moonFragmentShader`. This shader will map the 2D plane UVs to a 3D sphere. Using the `phase` value provided by the astronomy engine (0.0 to 1.0), it will calculate a directional sunlight vector and apply Lambertian lighting to simulate the moon's phases. It will also apply a 5% ambient light to simulate "Earthshine" on the dark side of the moon.
   - Assign `window.moonMesh = new THREE.Mesh(...)` and add it to the scene with a render order that places it in front of the stars but behind the clouds/horizon.

2. **Update `initWebGL / setupShaders`:**
   - Call `setupMoon()` during the engine initialization phase.

3. **Update `renderWebGL()`:**
   - In the rendering loop, update `window.moonMaterial`'s uniforms: `eqToHoriz`, `lookAz`, `lookEl`, and `focalLen`. This ensures the moon correctly tracks the camera's panning and the Earth's rotation, exactly like the stars do. The `celestialPos` and `phase` are already wired up to be updated.

## Verification Plan

- Check the browser to ensure the moon is visible in the sky at the correct location.
- Fast-forward the time to observe the moon phase changing from New Moon to Full Moon.
- Pan the camera to ensure the moon stays perfectly locked to the celestial sphere and doesn't drift.
