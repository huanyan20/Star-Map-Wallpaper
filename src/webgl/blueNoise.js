export function generateBlueNoiseField(size = 256) {
  const field = new Float32Array(size * size);
  const radius = Math.max(2, Math.round(size / 20));
  const cellSize = Math.max(2, Math.round(radius * 0.75));
  const gridSize = Math.ceil(size / cellSize);
  const grid = new Int32Array(gridSize * gridSize).fill(-1);
  const points = [];
  const maxPoints = Math.max(96, Math.floor((size * size) / (radius * radius * 1.25)));

  const rng = (() => {
    let state = 0x6d2b79f5;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  })();

  const isValid = (x, y) => {
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const nx = gx + ox;
        const ny = gy + oy;
        if (nx < 0 || ny < 0 || nx >= gridSize || ny >= gridSize) continue;
        const neighbor = grid[ny * gridSize + nx];
        if (neighbor < 0) continue;
        const point = points[neighbor];
        const dx = x - point.x;
        const dy = y - point.y;
        if (dx * dx + dy * dy < radius * radius) {
          return false;
        }
      }
    }
    return true;
  };

  for (let attempt = 0; attempt < maxPoints * 40 && points.length < maxPoints; attempt++) {
    const x = Math.floor(rng() * size);
    const y = Math.floor(rng() * size);
    if (!isValid(x, y)) continue;

    const idx = points.length;
    points.push({ x, y });
    grid[Math.floor(y / cellSize) * gridSize + Math.floor(x / cellSize)] = idx;
  }

  const maxDistance = radius * 1.7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let best = maxDistance;
      for (const point of points) {
        const dx = x - point.x;
        const dy = y - point.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < best) best = dist;
      }
      const normalized = 1.0 - Math.min(best / maxDistance, 1.0);
      field[y * size + x] = Math.min(1.0, Math.max(0.0, normalized * normalized));
    }
  }

  return field;
}
