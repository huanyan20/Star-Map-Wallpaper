/* === ASTRONOMY ENGINE ===
   Provides astronomical algorithms for calculating positions of 
   stars, sun, moon, and coordinate transformations.
*/

export const LAT_DEG = 22.6;
export const LON_DEG = 120.3;
export const LAT_RAD = (LAT_DEG * Math.PI) / 180;

export function toRad(d) {
  return (d * Math.PI) / 180;
}
export function toDeg(r) {
  return (r * 180) / Math.PI;
}

export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

export function gmst(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  let g =
    280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - (T * T * T) / 38710000;
  return ((g % 360) + 360) % 360;
}

export function getLST(date) {
  const jd = julianDate(date);
  return (((gmst(jd) + LON_DEG) % 360) + 360) % 360;
}

export function raDecToAltAz(ra_h, dec_deg, lst_deg) {
  const raRad = toRad(ra_h * 15);
  const decRad = toRad(dec_deg);
  const lstRad = toRad(lst_deg);
  const ha = lstRad - raRad;
  const sinAlt =
    Math.sin(decRad) * Math.sin(LAT_RAD) + Math.cos(decRad) * Math.cos(LAT_RAD) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAz =
    (Math.sin(decRad) - Math.sin(alt) * Math.sin(LAT_RAD)) / (Math.cos(alt) * Math.cos(LAT_RAD));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.sin(ha) > 0) az = 2 * Math.PI - az;
  return { alt, az };
}

/* === SUN POSITION (VSOP87 High Precision) === */
export function getSunRaDec(jd) {
  const date = new Date((jd - 2440587.5) * 86400000);
  const obs = new Astronomy.Observer(LAT_DEG, LON_DEG, 0);
  const sunEq = Astronomy.Equator('Sun', date, obs, false, true);
  return { ra: sunEq.ra, dec: sunEq.dec };
}

/* === MOON POSITION (High Precision) === */
export function getMoonRaDec(jd) {
  const date = new Date((jd - 2440587.5) * 86400000);
  const obs = new Astronomy.Observer(LAT_DEG, LON_DEG, 0);
  const moonEq = Astronomy.Equator('Moon', date, obs, false, true);
  const illum = Astronomy.Illumination('Moon', date);
  return { ra: moonEq.ra, dec: moonEq.dec, phase: illum.phase_fraction };
}

/* === MILKY WAY COORDS === */
export function galToRaDec(l, b) {
  const lRad = toRad(l),
    bRad = toRad(b);
  const lNCP = toRad(122.93192);
  const poleRa = toRad(192.85948),
    poleDec = toRad(27.12825);
  const sinDec =
    Math.sin(bRad) * Math.sin(poleDec) + Math.cos(bRad) * Math.cos(poleDec) * Math.cos(lNCP - lRad);
  const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  const x = Math.cos(bRad) * Math.sin(lNCP - lRad);
  const y =
    Math.sin(bRad) * Math.cos(poleDec) - Math.cos(bRad) * Math.sin(poleDec) * Math.cos(lNCP - lRad);
  const ra = (((poleRa + Math.atan2(x, y)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { ra: toDeg(ra) / 15, dec: toDeg(dec) };
}
