/* === ASTRONOMY ENGINE ===
   Provides astronomical algorithms for calculating positions of 
   stars, sun, moon, and coordinate transformations.
*/

const LAT_DEG = 22.6;
const LON_DEG = 120.3;
const LAT_RAD = LAT_DEG * Math.PI / 180;

function toRad(d){ return d * Math.PI / 180; }
function toDeg(r){ return r * 180 / Math.PI; }

function julianDate(date){
  return date.getTime() / 86400000 + 2440587.5;
}

function gmst(jd){
  const T = (jd - 2451545.0) / 36525.0;
  let g = 280.46061837 + 360.98564736629*(jd-2451545) +
          0.000387933*T*T - T*T*T/38710000;
  return ((g % 360) + 360) % 360;
}

function getLST(date){
  const jd = julianDate(date);
  return ((gmst(jd) + LON_DEG) % 360 + 360) % 360;
}

function raDecToAltAz(ra_h, dec_deg, lst_deg){
  const raRad  = toRad(ra_h * 15);
  const decRad = toRad(dec_deg);
  const lstRad = toRad(lst_deg);
  const ha     = lstRad - raRad;
  const sinAlt = Math.sin(decRad)*Math.sin(LAT_RAD) +
                 Math.cos(decRad)*Math.cos(LAT_RAD)*Math.cos(ha);
  const alt    = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAz  = (Math.sin(decRad) - Math.sin(alt)*Math.sin(LAT_RAD)) /
                 (Math.cos(alt)*Math.cos(LAT_RAD));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if(Math.sin(ha) > 0) az = 2*Math.PI - az;
  return {alt, az};
}

/* === SUN POSITION (Meeus Ch.25 low precision) === */
function getSunRaDec(jd){
  const n  = jd - 2451545.0;
  const L  = ((280.460 + 0.9856474*n) % 360 + 360) % 360;
  const g  = toRad(((357.528 + 0.9856003*n) % 360 + 360) % 360);
  const lambda = toRad(L + 1.915*Math.sin(g) + 0.020*Math.sin(2*g));
  const eps = toRad(23.439 - 0.0000004*n);
  const ra  = (Math.atan2(Math.cos(eps)*Math.sin(lambda), Math.cos(lambda)) * 180/Math.PI + 360) % 360;
  const dec = Math.asin(Math.sin(eps)*Math.sin(lambda)) * 180/Math.PI;
  return { ra: ra/15, dec };
}

/* === MOON POSITION (Meeus Ch.47 simplified) === */
function getMoonRaDec(jd){
  const T  = (jd - 2451545.0) / 36525.0;
  // Fundamental arguments
  const Lp = toRad(((218.3164477 + 481267.88123421*T) % 360 + 360) % 360);
  const D  = toRad(((297.8501921 + 445267.1114034*T) % 360 + 360) % 360);
  const M  = toRad(((357.5291092 +  35999.0502909*T) % 360 + 360) % 360);
  const Mp = toRad(((134.9633964 + 477198.8675055*T) % 360 + 360) % 360);
  const F  = toRad(((93.2720950  + 483202.0175233*T) % 360 + 360) % 360);
  // Longitude corrections (degrees)
  let lon = toDeg(Lp)
    + 6.289*Math.sin(Mp)
    - 1.274*Math.sin(2*D - Mp)
    + 0.658*Math.sin(2*D)
    - 0.186*Math.sin(M)
    - 0.059*Math.sin(2*Mp - 2*D)
    - 0.057*Math.sin(Mp - 2*D + M)
    + 0.053*Math.sin(Mp + 2*D)
    + 0.046*Math.sin(2*D - M)
    + 0.041*Math.sin(Mp - M)
    - 0.035*Math.sin(D)
    - 0.031*Math.sin(Mp + M)
    - 0.015*Math.sin(2*F - 2*D)
    + 0.011*Math.sin(Mp - 4*D);
  // Latitude corrections
  let lat = 5.128*Math.sin(F)
    + 0.280*Math.sin(Mp + F)
    + 0.277*Math.sin(Mp - F)
    + 0.173*Math.sin(F - 2*D)
    + 0.055*Math.sin(2*D + F - Mp)
    - 0.046*Math.sin(2*D - F - Mp)
    + 0.033*Math.sin(F + 2*D)
    + 0.017*Math.sin(2*Mp + F);
  const lonRad = toRad(lon), latRad = toRad(lat);
  const eps = toRad(23.439 - 0.0000004*(jd-2451545.0));
  const ra  = (Math.atan2(
    Math.sin(lonRad)*Math.cos(eps) - Math.tan(latRad)*Math.sin(eps),
    Math.cos(lonRad)
  ) * 180/Math.PI + 360) % 360;
  const dec = Math.asin(
    Math.sin(latRad)*Math.cos(eps) +
    Math.cos(latRad)*Math.sin(eps)*Math.sin(lonRad)
  ) * 180/Math.PI;
  // Moon phase angle (0=new, 0.5=full, 1=new again)
  const sunInfo = getSunRaDec(jd);
  const sunLon = ((sunInfo.ra*15 + 180) % 360);
  const phase = (((lon - sunLon) % 360) + 360) % 360 / 360; // 0=new, 0.5=full
  return { ra: ra/15, dec, phase };
}

/* === MILKY WAY COORDS === */
function galToRaDec(l, b){
  const lRad = toRad(l), bRad = toRad(b);
  const lNCP = toRad(122.93192);
  const poleRa = toRad(192.85948), poleDec = toRad(27.12825);
  const sinDec = Math.sin(bRad)*Math.sin(poleDec) +
                 Math.cos(bRad)*Math.cos(poleDec)*Math.cos(lNCP-lRad);
  const dec = Math.asin(Math.max(-1,Math.min(1,sinDec)));
  const x = Math.cos(bRad)*Math.sin(lNCP-lRad);
  const y = Math.sin(bRad)*Math.cos(poleDec) - Math.cos(bRad)*Math.sin(poleDec)*Math.cos(lNCP-lRad);
  const ra = ((poleRa + Math.atan2(x,y)) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI);
  return {ra: toDeg(ra)/15, dec: toDeg(dec)};
}
