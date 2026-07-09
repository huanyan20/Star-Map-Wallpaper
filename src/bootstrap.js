import * as THREE from 'three';
import { skyRuntime } from './core/runtime.js';

skyRuntime.set('THREE', THREE);

export async function loadAstronomicalData() {
  const [{ STARS, CON_NAMES }, { REAL_STARS }, { CONSTELLATION_SEGMENTS }] = await Promise.all([
    import('./data/stars_data.js'),
    import('./data/real_stars.js'),
    import('./data/constellations_data.js')
  ]);

  skyRuntime.set('STARS', STARS);
  skyRuntime.set('CON_NAMES', CON_NAMES);
  skyRuntime.set('REAL_STARS', REAL_STARS);
  skyRuntime.set('CONSTELLATION_SEGMENTS', CONSTELLATION_SEGMENTS);
}
