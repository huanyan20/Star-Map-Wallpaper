import { skyRuntime } from './runtime.js';

/**
 * @typedef {Object} RenderContext
 * 
 * --- Core Three.js Objects ---
 * @property {import('three').Scene} [scene]
 * @property {import('three').PerspectiveCamera} [camera]
 * @property {import('three').WebGLRenderer} [renderer]
 * @property {typeof import('three')} [THREE]
 * 
 * --- State & Configuration ---
 * @property {Object} [toggles] - Feature toggles (e.g. { milkyway: true, nebulas: true, constellationLines: true })
 * @property {Object} [bloomCfg] - Post-processing settings (e.g. { enabled: true, threshold: 0.85, strength: 1.2 })
 * @property {Object} [bloomLayers]
 * @property {number} [skyW]
 * @property {number} [skyH]
 * @property {number} [lookAz]
 * @property {number} [lookEl]
 * @property {number} [hFOV]
 * @property {string} [spatialHash]
 * 
 * --- Shared Global Data Arrays ---
 * @property {Array<any>} [STAR_CHUNKS]
 * @property {Array<any>} [STARS]
 * @property {Array<any>} [CON_NAMES]
 * @property {Array<any>} [REAL_STARS]
 * @property {Array<any>} [CONSTELLATION_SEGMENTS]
 * 
 * --- Promises ---
 * @property {Promise<any>} [starCatalogPromise]
 * @property {Promise<any>} [labelFontPromise]
 * 
 * --- WebGL Geometries ---
 * @property {import('three').BufferGeometry} [fieldStarsGeo]
 * @property {import('three').BufferGeometry} [namedStarsGeo]
 * 
 * --- WebGL Materials ---
 * @property {import('three').ShaderMaterial} [starsMaterial]
 * @property {import('three').Material} [constellationLinesMaterial]
 * @property {import('three').ShaderMaterial} [oceanMaterial]
 * @property {Array<import('three').MeshBasicMaterial>} [nebulaMaterials]
 * @property {import('three').ShaderMaterial} [mwMaterial]
 * @property {import('three').ShaderMaterial} [mwGlowMaterial]
 * @property {import('three').ShaderMaterial} [moonMaterial]
 * @property {import('three').ShaderMaterial} [sunMaterial]
 * 
 * --- WebGL Meshes ---
 * @property {import('three').Points} [fieldStarsMesh]
 * @property {import('three').Points} [namedStarsMesh]
 * @property {import('three').Mesh} [constellationLineMesh]
 * @property {import('three').Mesh} [skyMesh]
 * @property {import('three').Mesh} [oceanMesh]
 * @property {import('three').Points} [mwMesh]
 * @property {import('three').Mesh} [mwGlowMesh]
 * @property {import('three').Mesh} [moonMesh]
 * @property {import('three').Mesh} [sunMesh]
 * @property {import('three').LineSegments} [eqGridMesh]
 * @property {import('three').LineSegments} [eclipticMesh]
 * @property {import('three').LineSegments} [altAzGridMesh]
 * 
 * --- Render Layers ---
 * @property {any} [labelLayer]
 * 
 * --- Lifecycle Hooks / Setup Functions ---
 * @property {function(number): void} [updateStarLOD]
 * @property {function(): void} [setupStars]
 * @property {function(): Promise<void>} [loadStarCatalog]
 * @property {function(string, number, number): import('three').Material} [createSpindleMaterial]
 * @property {function(function): import('three').LineSegments} [createGridMaterial]
 * @property {function(): void} [setupMoon]
 * @property {function(): void} [setupSun]
 * @property {function(): void} [updateSkyGeometry]
 * @property {function(): void} [setupShaders]
 * @property {function(number): void} [renderWebGL]
 * @property {function(): void} [setupOcean]
 * @property {function(): void} [setupNebulas]
 * @property {function(): void} [setupMilkyWay]
 * @property {function(): void} [setupMilkyWayGlow]
 * @property {function(): void} [updateMilkyWayGeometry]
 * @property {function(): void} [setupLabelLayer]
 * @property {function(): Promise<void>} [loadLabelFont]
 * @property {function(): void} [setupGrids]
 * @property {function(): void} [setupBloom]
 * @property {function(number, number): void} [resizeBloom]
 * @property {function(): void} [renderBloom]
 */

/**
 * Strongly-typed adapter over the generic skyRuntime/window object.
 * New modules SHOULD use this instead of interacting directly with `window` to prevent
 * the creation of loose/untracked global variables.
 * 
 * Usage example:
 * ```javascript
 * import { renderContext } from '../core/renderContext.js';
 * 
 * // Typed reading
 * if (renderContext.scene) { ... }
 * 
 * // Typed writing
 * renderContext.sunMesh = myNewSunMesh;
 * ```
 * 
 * @type {RenderContext & typeof skyRuntime}
 */
export const renderContext = skyRuntime;
