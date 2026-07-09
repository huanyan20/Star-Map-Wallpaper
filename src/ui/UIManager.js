import { toRad } from '../vendor/astronomy_engine.js';
import { state } from '../core/state.js';
import { skyRuntime } from '../core/runtime.js';

export function initUI() {
  const runtime = skyRuntime;
  window.onerror = function (msg, src, lineno, colno, error) {
    const errDiv = document.createElement('div');
    errDiv.style.position = 'absolute';
    errDiv.style.top = '10px';
    errDiv.style.left = '10px';
    errDiv.style.color = 'red';
    errDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
    errDiv.style.padding = '20px';
    errDiv.style.zIndex = '999999';
    errDiv.style.fontFamily = 'monospace';
    errDiv.style.fontSize = '20px';
    errDiv.style.maxWidth = '80vw';
    errDiv.innerText = 'ERROR: ' + msg + '\nLINE: ' + lineno + '\n' + (error && error.stack ? error.stack : '');
    document.body.appendChild(errDiv);
  };
  window.addEventListener('unhandledrejection', function (event) {
    const errDiv = document.createElement('div');
    errDiv.style.position = 'absolute';
    errDiv.style.top = '150px';
    errDiv.style.left = '10px';
    errDiv.style.color = 'orange';
    errDiv.style.backgroundColor = 'rgba(0,0,0,0.8)';
    errDiv.style.padding = '20px';
    errDiv.style.zIndex = '999999';
    errDiv.style.fontFamily = 'monospace';
    errDiv.style.fontSize = '20px';
    errDiv.style.maxWidth = '80vw';
    errDiv.innerText = 'PROMISE REJECTION: ' + (event.reason && event.reason.stack ? event.reason.stack : event.reason);
    document.body.appendChild(errDiv);
  });

  runtime.set('toggles', {
    atmosphere: true,
    constellations: false,
    conNames: false,
    starNames: false,
    milkyway: true,
    grid: false,
    equatorial: false,
    ecliptic: false,
    bloom: false,
  });
  function bindToggle(id, key) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
      runtime.get('toggles')[key] = !runtime.get('toggles')[key];
      el.classList.toggle('active');
      if (key === 'bloom' && runtime.get('bloomCfg')) {
        runtime.get('bloomCfg').enabled = runtime.get('toggles').bloom;
      }
    });
  }
  bindToggle('btn-atmosphere', 'atmosphere');
  bindToggle('btn-constellations', 'constellations');
  bindToggle('btn-con-names', 'conNames');
  bindToggle('btn-star-names', 'starNames');
  bindToggle('btn-milkyway', 'milkyway');
  bindToggle('btn-grid', 'grid');
  bindToggle('btn-equatorial', 'equatorial');
  bindToggle('btn-ecliptic', 'ecliptic');
  bindToggle('btn-bloom', 'bloom');
  
  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.lookAz = Math.PI;
      state.lookEl = toRad(25);
      state.hFOV = toRad(90);
    });
  }

  const keyMap = {
    t: 'atmosphere', c: 'constellations', n: 'conNames',
    s: 'starNames', m: 'milkyway', g: 'grid', e: 'equatorial',
    b: 'bloom',
  };
  const btnMap = {
    atmosphere: 'btn-atmosphere', constellations: 'btn-constellations',
    conNames: 'btn-con-names', starNames: 'btn-star-names',
    milkyway: 'btn-milkyway', grid: 'btn-grid', equatorial: 'btn-equatorial',
    bloom: 'btn-bloom',
  };
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if (keyMap[k]) {
      const key = keyMap[k];
      runtime.get('toggles')[key] = !runtime.get('toggles')[key];
      const btn = document.getElementById(btnMap[key]);
      if (btn) btn.classList.toggle('active', runtime.get('toggles')[key]);
      if (key === 'bloom' && runtime.get('bloomCfg')) {
        runtime.get('bloomCfg').enabled = runtime.get('toggles').bloom;
      }
    } else if (k === 'r') {
      state.lookAz = Math.PI;
      state.lookEl = toRad(25);
      state.hFOV = toRad(90);
    } else if (k === 'w' || e.key === 'ArrowUp') {
      state.lookAz = 0;
      state.lookEl = toRad(25);
    } else if (k === 's' || e.key === 'ArrowDown') {
      state.lookAz = Math.PI;
      state.lookEl = toRad(25);
    } else if (k === 'a' || e.key === 'ArrowLeft') {
      state.lookAz = toRad(270);
      state.lookEl = toRad(25);
    } else if (k === 'd' || e.key === 'ArrowRight') {
      state.lookAz = toRad(90);
      state.lookEl = toRad(25);
    } else if (k === 'z' || k === ' ') {
      state.lookEl = toRad(89.9);
    } else if (k === '1') {
      state.hFOV = toRad(110);
    } else if (k === '2') {
      state.hFOV = toRad(90);
    } else if (k === '3') {
      state.hFOV = toRad(45);
    }
  });

  const infoBar = document.getElementById('info-bar');
  if (infoBar) {
    infoBar.innerHTML = '滾輪縮放 · 拖曳旋轉視角 · 懸停查看 &nbsp;|&nbsp; ' +
      '<span style="color:#5b8fff">WASD/方向鍵</span>切換方位 ' +
      '<span style="color:#5b8fff">Z</span>天頂 ' +
      '<span style="color:#5b8fff">123</span>切換視野 ' +
      '<span style="color:#5b8fff">R</span>重置';
  }
}

export function doHover(mx, my) {
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) return;
  const cellW = state.W / state.SH_COLS;
  const cellH = state.H / state.SH_ROWS;
  const gx = Math.floor(mx / cellW);
  const gy = Math.floor(my / cellH);

  let nearest = null, minD = 22;
  for (let y = Math.max(0, gy - 1); y <= Math.min(state.SH_ROWS - 1, gy + 1); y++) {
    for (let x = Math.max(0, gx - 1); x <= Math.min(state.SH_COLS - 1, gx + 1); x++) {
      const idx = y * state.SH_COLS + x;
      for (const { x: sx, y: sy, star } of state.spatialHash[idx]) {
        const d = Math.hypot(sx - mx, sy - my);
        if (d < minD) {
          minD = d;
          nearest = star;
        }
      }
    }
  }
  if (nearest) {
    document.getElementById('tt-name').textContent = nearest.n + ' (' + nearest.cn + ')';
    document.getElementById('tt-meta').innerHTML =
      '星座: ' + (window.CON_NAMES && window.CON_NAMES[nearest.con] ? window.CON_NAMES[nearest.con] : nearest.con) + '<br>' +
      '<span class="star-mag">視星等: ' + nearest.mag.toFixed(2) + '</span><br>' +
      '光譜型: ' + (nearest.sp || '?') + '<br>' +
      'RA: ' + nearest.ra.toFixed(3) + 'h &nbsp;Dec: ' + nearest.dec.toFixed(2) + '°';
    tooltip.style.left = Math.min(mx + 14, state.W - 215) + 'px';
    tooltip.style.top = Math.min(my - 10, state.H - 130) + 'px';
    tooltip.classList.add('show');
  } else {
    tooltip.classList.remove('show');
  }
}

export function updateClock(now) {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const td = document.getElementById('time-display');
  const dd = document.getElementById('date-display');
  if (td) td.textContent = hh + ':' + mm + ':' + ss;
  if (dd) dd.textContent = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';
}
skyRuntime.set('updateClock', updateClock);
