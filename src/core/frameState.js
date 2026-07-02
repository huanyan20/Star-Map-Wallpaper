import { julianDate, getLST, raDecToAltAz, getSunRaDec, getMoonRaDec } from '../vendor/astronomy_engine.js';

const astroCache = {
  lastCalcT: -Infinity,
  lastUnixMs: 0,
  now: null,
  lst_deg: 0,
  sunRaDec: null,
  sunAltAz: null,
  sunAlt_deg: 0,
  moonRaDec: null,
  moonPhase: 0,
  starVisibility: 1,
};

const bgCache = {
  t: -99,
  t2: -99,
  hy: -99,
  topRGB: null,
  midRGB: null,
  horRGB: null,
};

function lerp3(a, b, f) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * f));
}

export function getFrameState(ts, now) {
  // 1. Update astronomy cache
  const unixMs = now.getTime();
  const jumped = astroCache.lastUnixMs && Math.abs(unixMs - astroCache.lastUnixMs) > 60000;
  
  if (!astroCache.now || jumped || ts - astroCache.lastCalcT >= 500) {
    const jd = julianDate(now);
    const lst_deg = getLST(now);
    const sunRaDec = getSunRaDec(jd);
    const sunAltAz = raDecToAltAz(sunRaDec.ra, sunRaDec.dec, lst_deg);
    const sunAlt_deg = (sunAltAz.alt * 180) / Math.PI;
    const moonRaDec = getMoonRaDec(jd);
    const moonPhase = moonRaDec.phase;
    const starVisibility = window.toggles && window.toggles.atmosphere
      ? Math.max(0, Math.min(1, (-sunAlt_deg - 2) / 10))
      : 1.0;
      
    astroCache.lastCalcT = ts;
    astroCache.now = now;
    astroCache.lst_deg = lst_deg;
    astroCache.sunRaDec = sunRaDec;
    astroCache.sunAltAz = sunAltAz;
    astroCache.sunAlt_deg = sunAlt_deg;
    astroCache.moonRaDec = moonRaDec;
    astroCache.moonPhase = moonPhase;
    astroCache.starVisibility = starVisibility;
  }
  astroCache.lastUnixMs = unixMs;

  // 2. Update background sky color cache
  const bgSunAlt = (window.toggles && window.toggles.atmosphere) ? astroCache.sunAlt_deg : -18;
  const hy = window.horizonY ? window.horizonY() : window.innerHeight / 2;
  
  const t = Math.max(0, Math.min(1, (bgSunAlt + 18) / 30));
  const t2 = Math.max(0, Math.min(1, (bgSunAlt + 4) / 14));
  
  const tR = Math.round(t * 200);
  const t2R = Math.round(t2 * 200);
  const hyR = Math.round(hy);

  if (bgCache.t !== tR || bgCache.t2 !== t2R || bgCache.hy !== hyR) {
    const nightTop = [8, 11, 20];
    const twilightTop = [8, 18, 52];
    const dayTop = [30, 100, 200];

    const nightMid = [18, 22, 41];
    const twilightMid = [20, 35, 75];
    const dayMid = [80, 140, 215];

    const nightHor = [42, 31, 29];
    const twilightHor = [30, 60, 110];
    const dayHor = [150, 190, 230];

    bgCache.topRGB = lerp3(lerp3(nightTop, twilightTop, t), dayTop, t2);
    bgCache.midRGB = lerp3(lerp3(nightMid, twilightMid, t), dayMid, t2);
    bgCache.horRGB = lerp3(lerp3(nightHor, twilightHor, t), dayHor, t2);

    bgCache.t = tR;
    bgCache.t2 = t2R;
    bgCache.hy = hyR;
  }

  return {
    ts,
    dt: 0, // App will fill this
    now,
    lst_deg: astroCache.lst_deg,
    sunRaDec: astroCache.sunRaDec,
    sunAltAz: astroCache.sunAltAz,
    sunAlt_deg: astroCache.sunAlt_deg,
    moonRaDec: astroCache.moonRaDec,
    moonPhase: astroCache.moonPhase,
    starVisibility: astroCache.starVisibility,
    topRGB: bgCache.topRGB,
    midRGB: bgCache.midRGB,
    horRGB: bgCache.horRGB,
    hy: bgCache.hy,
    atmosphereEnabled: window.toggles ? window.toggles.atmosphere : true
  };
}
