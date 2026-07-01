window.lookAz = Math.PI; // direction looking: 0=N, π=S (radians)
window.lookEl = 15 * Math.PI / 180; // toRad(15)
window.hFOV = 90 * Math.PI / 180; // toRad(90)

export const state = {
  W: window.innerWidth,
  H: window.innerHeight,
  CX: window.innerWidth / 2,
  CY: window.innerHeight / 2,
  R: 0,
  
  isDragging: false,
  lastX: 0,
  lastY: 0,
  velAz: 0,
  velEl: 0,
  velZoom: 0,
  
  screenPos: [],
  spatialHash: Array.from({ length: 32 * 32 }, () => []),
  SH_COLS: 32,
  SH_ROWS: 32,
  lastTD: null,
  
  get lookAz() { return window.lookAz; },
  set lookAz(v) { window.lookAz = v; },
  get lookEl() { return window.lookEl; },
  set lookEl(v) { window.lookEl = v; },
  get hFOV() { return window.hFOV; },
  set hFOV(v) { window.hFOV = v; },
  get toggles() { return window.toggles; },
  set toggles(v) { window.toggles = v; }
};

window.spatialHash = state.spatialHash;
