import { skyRuntime } from './runtime.js';

skyRuntime.set('lookAz', Math.PI); // direction looking: 0=N, π=S (radians)
skyRuntime.set('lookEl', 15 * Math.PI / 180); // toRad(15)
skyRuntime.set('hFOV', 90 * Math.PI / 180); // toRad(90)

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
  lastInteractionTime: performance.now(),
  
  get lookAz() { return skyRuntime.get('lookAz'); },
  set lookAz(v) { skyRuntime.set('lookAz', v); },
  get lookEl() { return skyRuntime.get('lookEl'); },
  set lookEl(v) { skyRuntime.set('lookEl', v); },
  get hFOV() { return skyRuntime.get('hFOV'); },
  set hFOV(v) { skyRuntime.set('hFOV', v); },
  get toggles() { return skyRuntime.get('toggles'); },
  set toggles(v) { skyRuntime.set('toggles', v); }
};

skyRuntime.set('spatialHash', state.spatialHash);
