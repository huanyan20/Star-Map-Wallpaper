# Implementation Plan for Stellarium-inspired Features

This plan outlines the integration of four key features inspired by Stellarium, as requested in `newimp.md`, to dramatically enhance the scientific accuracy and visual fidelity of the Star Map engine. The features are: B-V Color Index to RGB, Atmospheric Extinction & Refraction, Scintillation, and High-Precision Ephemeris (VSOP87).

## User Review Required

> [!WARNING]  
> **New Dependency**: We will be introducing a new third-party dependency: `astronomy-engine`. I will fetch its browser-ready JavaScript file from a CDN or NPM and add it to the project so it can work completely offline without bundler configuration. This will replace the low-precision Meeus algorithms currently used in `astronomy_engine.js`.

> [!IMPORTANT]  
> **Asset Regeneration**: After updating `scripts/build_assets.js` with the new B-V to RGB color physics, we will need to run `npm run build:assets` to regenerate the `stars.bin` data before running the application.

## Open Questions

None at this time.

## Proposed Changes

---

### Asset Compilation (B-V Color to RGB)

We will implement a physically accurate conversion from the B-V color index to Blackbody Temperature (Kelvin), and then to sRGB, to generate realistic star colors directly within the binary asset.

#### [MODIFY] [build_assets.js](file:///c:/Users/ggini/Desktop/STAR/scripts/build_assets.js)
- Rewrite `colorForBv(bv)` to use the Ballesteros formula to convert B-V to Temperature:
  $T = 4600 \times \left( \frac{1}{0.92 \times bv + 1.7} + \frac{1}{0.92 \times bv + 0.62} \right)$
- Add a standard `kelvinToRGB` conversion function.
- This ensures `stars.bin` contains scientifically accurate colors (e.g., deep orange for Betelgeuse, brilliant icy blue for Sirius) without adding runtime overhead.

---

### Rendering Engine (Atmospheric Effects & Scintillation)

We will shift the twinkling logic to the Fragment Shader for per-pixel precision and implement physically-based atmospheric reddening (extinction) and refraction based on the airmass.

#### [MODIFY] [webgl_engine.js](file:///c:/Users/ggini/Desktop/STAR/webgl_engine.js)
- **Vertex Shader**:
  - Calculate `airMass` using the altitude angle ($X \approx \frac{1}{\sin(\text{Alt})}$). Ensure the GPU specifically targets altitudes below $15^\circ$ for proportional attenuation and reddening.
  - Implement basic atmospheric refraction logic for stars near the horizon to simulate optical bending.
  - Pass `airMass` to the Fragment Shader via a `varying float vAirMass`.
- **Fragment Shader**:
  - **Scintillation**: Calculate scintillation amplitude based on `vAirMass` (stars lower on the horizon twinkle more violently), base star brightness, and an atmospheric "seeing" parameter. Use a noise function (such as Fractional Brownian Motion or Hash-based noise) indexed by `time` and pixel coordinates to create organic, non-sinusoidal flickering.
  - **Atmospheric Extinction**: Apply wavelength-dependent extinction based on Rayleigh scattering principles. Blue light attenuates faster than red light through thicker atmosphere: `vec3 extinctionColor = exp(-vec3(0.12, 0.16, 0.24) * vAirMass);`
  - Combine extinction and scintillation with the base color for the final pixel output.

---

### Ephemeris Engine (VSOP87 Integration)

We will integrate `astronomy-engine`, a high-precision astronomical library based on VSOP87, to replace the existing simplified orbital mechanics.

#### [NEW] [astronomy.browser.js](file:///c:/Users/ggini/Desktop/STAR/astronomy.browser.js)
- Add the bundled browser build of the `astronomy-engine` package to the project root to keep the project completely offline and self-contained.

#### [MODIFY] [index.html](file:///c:/Users/ggini/Desktop/STAR/index.html)
- Add `<script src="astronomy.browser.js"></script>` before the other custom scripts to load the new engine globally.

#### [MODIFY] [astronomy_engine.js](file:///c:/Users/ggini/Desktop/STAR/astronomy_engine.js)
- Rewrite core astronomical functions (`getSunRaDec`, `getMoonRaDec`, `getLST`, `raDecToAltAz`) to leverage `astronomy-engine`'s precise topocentric conversions and VSOP87 models.
- Retain and adapt the `astroCache` logic to ensure the heavy VSOP87 calculations do not execute every frame, maintaining the strict 120 FPS constraint.

---

### Future Expansion (HEALPix Grid)

Although the current implementation efficiently handles ~8,785 naked-eye stars in a single buffer, future expansions targeting millions of stars will reference Stellarium's HEALPix (Hierarchical Equal Area isoLatitude Pixelization) architecture for dynamic, chunk-based binary loading based on the camera's viewport.

## Verification Plan

### Automated Tests
- N/A

### Manual Verification
- Rebuild `stars.bin` by running `npm run build:assets`.
- Serve the site locally and observe the night sky.
- Verify that stars near the horizon appear significantly dimmer and redder (Atmospheric Extinction).
- Observe the scintillation effect to ensure it feels organic, chaotic, and more pronounced near the horizon.
- Confirm the Sun and Moon correctly track across the sky, and verify that the `astroCache` prevents performance stuttering during rapid time acceleration.
