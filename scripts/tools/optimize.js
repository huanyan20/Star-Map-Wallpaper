const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// 1. Camera vectors cache
code = code.replace(
  /function altAzToXY\(alt_rad, az_rad\) \{[\s\S]*?return \{ x: px, y: py \};\s*\}/,
`/* === CACHED CAMERA VECTORS === */
    let _camLx=0, _camLy=1, _camLz=0;
    let _camRx=1, _camRy=0;
    let _camUx=0, _camUy=0, _camUz=1;
    let _camF=500;

    function updateCamCache(){
      _camLx = Math.sin(lookAz)*Math.cos(lookEl);
      _camLy = Math.cos(lookAz)*Math.cos(lookEl);
      _camLz = Math.sin(lookEl);
      _camRx =  Math.cos(lookAz);
      _camRy = -Math.sin(lookAz);
      _camUx = _camRy*_camLz;
      _camUy = -_camRx*_camLz;
      _camUz = _camRx*_camLy - _camRy*_camLx;
      _camF  = focalLen();
    }

    function altAzToXY(alt_rad, az_rad) {
      if (alt_rad < toRad(-10)) return null;
      const sx = Math.sin(az_rad) * Math.cos(alt_rad);
      const sy = Math.cos(az_rad) * Math.cos(alt_rad);
      const sz = Math.sin(alt_rad);
      const depth = sx*_camLx + sy*_camLy + sz*_camLz;
      if (depth < -0.5) return null;
      const pr = sx*_camRx + sy*_camRy;
      const pu = sx*_camUx + sy*_camUy + sz*_camUz;
      const k = 2 / (1 + depth);
      const px = CX + pr * k * _camF;
      const py = CY - pu * k * _camF;
      if (px < -W * 2 || px > W * 3 || py < -H * 2 || py > H * 3) return null;
      return { x: px, y: py };
    }`
);

// 2. updateClock
code = code.replace(
  /function updateClock\(\) \{\s*const now = new Date\(\);/,
  `function updateClock(now) {`
);

// 3. Grid optimizations (Equatorial Grid step size)
code = code.replace(/ra \+= 0\.2/g, 'ra += 0.5');
code = code.replace(/dec \+= 3/g, 'dec += 5');

// 4. Star Position Cache
code = code.replace(
  /function drawConstellationLines\(lst_deg\) \{/,
`/* === NAMED STAR SCREEN POSITION CACHE === */
    let _starPosCache = {};
    function buildStarPositionCache(lst_deg){
      _starPosCache = {};
      for(const star of STARS){
        const rd = raDecToAltAz(star.ra, star.dec, lst_deg);
        const p = altAzToXY(rd.alt, rd.az);
        if(p) _starPosCache[star.cn] = { x:p.x, y:p.y, alt:rd.alt };
      }
    }

    function drawConstellationLines(lst_deg) {`
);

code = code.replace(
  /const s1 = STAR_BY_CN\[cn1\], s2 = STAR_BY_CN\[cn2\];\s*if \(\!s1 \|\| \!s2\) continue;\s*const p1 = getXY\(s1\.ra, s1\.dec, lst_deg\), p2 = getXY\(s2\.ra, s2\.dec, lst_deg\);/,
  `const p1 = _starPosCache[cn1], p2 = _starPosCache[cn2];`
);

code = code.replace(
  /if \(\!centroids\[star\.con\]\) centroids\[star\.con\] = \{ x: 0, y: 0, n: 0 \};\s*const p = getXY\(star\.ra, star\.dec, lst_deg\);\s*if \(\!p\) continue;\s*centroids\[star\.con\]\.x \+= p\.x; centroids\[star\.con\]\.y \+= p\.y; centroids\[star\.con\]\.n\+\+;/,
  `const c = _starPosCache[star.cn];
        if(!c) continue;
        if (!centroids[star.con]) centroids[star.con] = { x: 0, y: 0, n: 0 };
        centroids[star.con].x += c.x; centroids[star.con].y += c.y; centroids[star.con].n++;`
);

// 5. drawFieldStars vectors
code = code.replace(
  /const lx = Math\.sin\(lookAz\) \* Math\.cos\(lookEl\);[\s\S]*?const f = focalLen\(\);/,
  `// Use cached camera vectors
      const D1 = E1*_camLx + N1*_camLy + U1*_camLz, D2 = E2*_camLx + N2*_camLy + U2*_camLz, D3 = N3*_camLy + U3*_camLz;
      const R1 = E1*_camRx + N1*_camRy, R2 = E2*_camRx + N2*_camRy, R3 = N3*_camRy;
      const Uu1 = E1*_camUx + N1*_camUy + U1*_camUz, Uu2 = E2*_camUx + N2*_camUy + U2*_camUz, Uu3 = N3*_camUy + U3*_camUz;
      const f = _camF;`
);

// 6. drawStars cache + screenPos bug fix
code = code.replace(
  /const screenPos = \[\];\s*ctx\.save\(\);\s*for \(const star of STARS\) \{\s*const rd = raDecToAltAz\(star\.ra, star\.dec, lst_deg\);\s*const p = altAzToXY\(rd\.alt, rd\.az\);\s*if \(\!p\) continue;\s*screenPos\.push\(\{ x: p\.x, y: p\.y, star \}\);\s*const sinAlt = Math\.max\(0\.05, Math\.sin\(rd\.alt\)\);/,
  `screenPos.length = 0;

      ctx.save();

      for (const star of STARS) {

        const cached = _starPosCache[star.cn];
        if (!cached) continue;

        screenPos.push({ x: cached.x, y: cached.y, star });

        const sinAlt = Math.max(0.05, Math.sin(cached.alt));`
);

// 7. Render loop
code = code.replace(
  /if \(ts - lastClockT > 200\) \{ updateClock\(\); lastClockT = ts; \}\s*const now = new Date\(\);\s*const jd = julianDate\(now\);\s*const lst_deg = getLST\(now\);/,
  `const now = new Date();
      const jd = julianDate(now);
      const lst_deg = getLST(now);

      if (ts - lastClockT > 200) { updateClock(now); lastClockT = ts; }

      updateCamCache();
      buildStarPositionCache(lst_deg);`
);

fs.writeFileSync('index.html', code);
console.log('Optimizations applied successfully via node replace script!');
