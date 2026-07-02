import * as THREE from 'three';

window.THREE = THREE;

export async function loadAstronomicalData() {
  const [{ STARS, CON_NAMES }, { REAL_STARS }, { CONSTELLATION_SEGMENTS }] = await Promise.all([
    import('./data/stars_data.js'),
    import('./data/real_stars.js'),
    import('./data/constellations_data.js')
  ]);

  window.STARS = STARS;
  window.CON_NAMES = CON_NAMES;
  window.REAL_STARS = REAL_STARS;
  window.CONSTELLATION_SEGMENTS = CONSTELLATION_SEGMENTS;
}
