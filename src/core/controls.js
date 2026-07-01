import { toRad } from '../vendor/astronomy_engine.js';
import { state } from './state.js';
import { doHover } from '../ui/UIManager.js';

export function initControls(canvas) {
  canvas.addEventListener('mousedown', (e) => {
    state.isDragging = true;
    state.velAz = 0;
    state.velEl = 0;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
  });
  window.addEventListener('mouseup', () => {
    if (state.isDragging) {
      state.velAz *= 0.65;
      state.velEl *= 0.65;
    }
    state.isDragging = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    if (state.isDragging) {
      const sens = state.hFOV / state.W;
      state.velAz = -(e.clientX - state.lastX) * sens;
      state.velEl = (e.clientY - state.lastY) * sens;
      state.lookAz += state.velAz;
      state.lookEl += state.velEl;
      state.lookEl = Math.max(toRad(-89.9), Math.min(toRad(89.9), state.lookEl));
      state.lookAz = ((state.lookAz % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      state.lastX = e.clientX;
      state.lastY = e.clientY;
    }
    doHover(e.clientX, e.clientY);
  });
  
  function handleZoom(e) {
    const delta = e.deltaY || e.wheelDelta || -e.detail;
    if (!delta) return;
    e.preventDefault();
    const d = Math.sign(delta);
    state.velZoom += d * 0.009;
  }
  window.addEventListener('wheel', handleZoom, { passive: false });
  window.addEventListener('mousewheel', handleZoom, { passive: false });
  window.addEventListener('DOMMouseScroll', handleZoom, { passive: false });
  document.addEventListener('wheel', handleZoom, { passive: false });
  document.addEventListener('mousewheel', handleZoom, { passive: false });

  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      state.isDragging = true;
      state.velAz = 0;
      state.velEl = 0;
      state.lastX = e.touches[0].clientX;
      state.lastY = e.touches[0].clientY;
    }
  }, { passive: true });
  canvas.addEventListener('touchend', () => {
    if (state.isDragging) {
      state.velAz *= 0.6;
      state.velEl *= 0.6;
    }
    state.isDragging = false;
    state.lastTD = null;
  });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (state.lastTD) {
        state.hFOV *= state.lastTD / d;
        state.hFOV = Math.max(toRad(5), Math.min(toRad(185), state.hFOV));
      }
      state.lastTD = d;
    } else if (e.touches.length === 1 && state.isDragging) {
      const sens = state.hFOV / state.W;
      state.velAz = -(e.touches[0].clientX - state.lastX) * sens;
      state.velEl = (e.touches[0].clientY - state.lastY) * sens;
      state.lookAz += state.velAz;
      state.lookEl += state.velEl;
      state.lookEl = Math.max(toRad(-89.9), Math.min(toRad(89.9), state.lookEl));
      state.lookAz = ((state.lookAz % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      state.lastX = e.touches[0].clientX;
      state.lastY = e.touches[0].clientY;
    }
  }, { passive: true });
}
