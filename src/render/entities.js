import { altAzToXY } from '../core/camera.js';

const entities = [];

export function updateEntities(dt) {
  // Spawn Meteor (approx 1 per 3-5 seconds depending on fps)
  if (Math.random() < 0.005) {
    entities.push({
      type: 'meteor',
      alt: (Math.random() * Math.PI) / 2 + 0.2,
      az: Math.random() * Math.PI * 2,
      speed: 0.1 + Math.random() * 0.3, // fast
      dir: Math.random() * Math.PI * 2,
      life: 0.15 + Math.random() * 0.4,
      maxLife: 0,
      brightness: 0.5 + Math.random(),
      col: Math.random() > 0.7 ? '#aaffcc' : '#ffffff',
    });
    const m = entities[entities.length - 1];
    m.maxLife = m.life;
  }

  // Spawn Satellite (approx 1 per 30 seconds)
  if (Math.random() < 0.0005) {
    entities.push({
      type: 'satellite',
      alt: (Math.random() * Math.PI) / 2,
      az: Math.random() * Math.PI * 2,
      speed: 0.002 + Math.random() * 0.004, // slow
      dir: Math.random() * Math.PI * 2,
      life: 60,
      maxLife: 60,
      brightness: 0.3 + Math.random() * 0.7,
    });
  }

  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i];
    e.life -= dt;

    if (e.life <= 0) {
      entities.splice(i, 1);
      continue;
    }

    // Move on sphere
    e.alt += Math.sin(e.dir) * e.speed * dt;
    e.az += (Math.cos(e.dir) * e.speed * dt) / Math.cos(e.alt);
  }
}

export function drawEntities(ctx) {
  ctx.save();

  for (const e of entities) {
    const p = altAzToXY(e.alt, e.az);
    if (!p) continue;

    if (e.type === 'meteor') {
      const tailAlt = e.alt - Math.sin(e.dir) * e.speed * 0.1;
      const tailAz = e.az - (Math.cos(e.dir) * e.speed * 0.1) / Math.cos(e.alt);
      const pt = altAzToXY(tailAlt, tailAz);

      if (!pt) continue;

      const alpha = Math.min(1, (e.life / e.maxLife) * 3) * e.brightness;
      const grad = ctx.createLinearGradient(pt.x, pt.y, p.x, p.y);

      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, e.col);

      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      // head flash
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.0, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === 'satellite') {
      const alpha =
        Math.min(1, Math.max(0, Math.sin(e.alt) * 2)) *
        Math.min(1, e.life / 5) *
        Math.min(1, (e.maxLife - e.life) / 5) *
        e.brightness;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffeedd';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
