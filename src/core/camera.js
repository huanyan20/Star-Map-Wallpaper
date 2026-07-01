import { toRad, raDecToAltAz } from '../vendor/astronomy_engine.js';
import { state } from './state.js';

/* === CACHED CAMERA VECTORS === */
let _camLx = 0, _camLy = 1, _camLz = 0;
let _camRx = 1, _camRy = 0;
let _camUx = 0, _camUy = 0, _camUz = 1;
let _camF = 500;

export function updateCamCache() {
  _camLx = Math.sin(state.lookAz) * Math.cos(state.lookEl);
  _camLy = Math.cos(state.lookAz) * Math.cos(state.lookEl);
  _camLz = Math.sin(state.lookEl);
  _camRx = Math.cos(state.lookAz);
  _camRy = -Math.sin(state.lookAz);
  _camUx = _camRy * _camLz;
  _camUy = -_camRx * _camLz;
  _camUz = _camRx * _camLy - _camRy * _camLx;
  _camF = window.focalLen();
}

window.focalLen = function() {
  return state.W / 4 / Math.tan(state.hFOV / 4);
}

export function horizonY() {
  return state.CY + 2 * window.focalLen() * Math.tan(state.lookEl / 2);
}

export function altAzToXY(alt_rad, az_rad) {
  if (!isFinite(alt_rad) || !isFinite(az_rad)) return null;
  if (alt_rad < toRad(-10)) return null;
  const sx = Math.sin(az_rad) * Math.cos(alt_rad);
  const sy = Math.cos(az_rad) * Math.cos(alt_rad);
  const sz = Math.sin(alt_rad);
  const depth = sx * _camLx + sy * _camLy + sz * _camLz;
  if (depth < -0.5) return null;
  const pr = sx * _camRx + sy * _camRy;
  const pu = sx * _camUx + sy * _camUy + sz * _camUz;
  const k = 2 / (1 + depth);
  const px = state.CX + pr * k * _camF;
  const py = state.CY - pu * k * _camF;
  if (!isFinite(px) || !isFinite(py)) return null;
  if (px < -state.W * 2 || px > state.W * 3 || py < -state.H * 2 || py > state.H * 3) return null;
  return { x: px, y: py };
}

export function getXY(ra_h, dec_deg, lst_deg) {
  const { alt, az } = raDecToAltAz(ra_h, dec_deg, lst_deg);
  return altAzToXY(alt, az);
}

window.updateCamCache = updateCamCache;
window.altAzToXY = altAzToXY;
window.horizonY = horizonY;
window.getXY = getXY;
