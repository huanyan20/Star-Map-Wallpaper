import test from 'node:test';
import assert from 'node:assert/strict';

// Mock Astronomy for tests
global.Astronomy = {
  Observer: class {
    constructor(lat, lon, height) { this.lat = lat; this.lon = lon; this.height = height; }
  },
  Equator: (body, date, obs, ofdate, topo) => {
    return { ra: 12, dec: 45 }; // dummy value for sun/moon
  },
  Illumination: (body, date) => {
    return { phase_fraction: 0.5 };
  }
};

import { julianDate, gmst, getLST, raDecToAltAz, galToRaDec, getSunRaDec, getMoonRaDec } from '../src/vendor/astronomy_engine.js';

test('astronomy_engine: julianDate', () => {
  const d = new Date(Date.UTC(2000, 0, 1, 12, 0, 0)); // 2000-01-01T12:00:00Z
  const jd = julianDate(d);
  assert.ok(Math.abs(jd - 2451545.0) < 0.001, `JD should be close to 2451545.0, got ${jd}`);
});

test('astronomy_engine: raDecToAltAz', () => {
  // A star at zenith: RA = LST, Dec = Latitude
  const lat = 22.6; // from astronomy_engine.js
  const lst = 100;
  const { alt, az } = raDecToAltAz(lst / 15, lat, lst);
  assert.ok(Math.abs(alt - Math.PI / 2) < 0.001, 'Altitude should be 90 degrees (PI/2)');
});

test('astronomy_engine: galToRaDec', () => {
  // Galactic center (l=0, b=0)
  const { ra, dec } = galToRaDec(0, 0);
  assert.ok(typeof ra === 'number' && !Number.isNaN(ra));
  assert.ok(typeof dec === 'number' && !Number.isNaN(dec));
});

test('astronomy_engine: sun and moon', () => {
  const d = new Date(Date.UTC(2024, 0, 1, 12, 0, 0));
  const jd = julianDate(d);
  const sun = getSunRaDec(jd);
  const moon = getMoonRaDec(jd);
  
  assert.ok(sun.ra >= 0 && sun.ra < 24);
  assert.ok(sun.dec >= -90 && sun.dec <= 90);
  assert.ok(moon.ra >= 0 && moon.ra < 24);
  assert.ok(moon.dec >= -90 && moon.dec <= 90);
  assert.ok(moon.phase >= 0 && moon.phase <= 1);
});
