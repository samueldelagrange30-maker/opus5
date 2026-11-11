import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(f.range(lo, hi + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  return f;
}

export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = (typeof location !== 'undefined' && /aniso1/.test(location.search)) ? 1 : (opts.aniso || 2);
  if (typeof location !== 'undefined' && /nomip/.test(location.search)) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t; }
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Halo radial doux (sprites lumineux, fumée)
export function radialTexture(size, stops) {
  return canvasTexture(size, size, (g) => {
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  });
}

// Bruit de valeur tuilable (canaux R,G,B indépendants)
export function noiseTexture(size = 256, seed = 7) {
  const r = rng(seed);
  const t = canvasTexture(size, size, (g) => {
    const img = g.createImageData(size, size);
    const layers = [];
    for (let ch = 0; ch < 3; ch++) {
      const acc = new Float32Array(size * size);
      let amp = 0.5, tot = 0;
      for (let oct = 0, cells = 4; oct < 5; oct++, cells *= 2) {
        const grid = new Float32Array(cells * cells);
        for (let i = 0; i < grid.length; i++) grid[i] = r();
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          const fx = (x / size) * cells, fy = (y / size) * cells;
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const tx = fx - x0, ty = fy - y0;
          const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
          const g00 = grid[(y0 % cells) * cells + (x0 % cells)], g10 = grid[(y0 % cells) * cells + ((x0 + 1) % cells)];
          const g01 = grid[((y0 + 1) % cells) * cells + (x0 % cells)], g11 = grid[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
          acc[y * size + x] += amp * (g00 + (g10 - g00) * sx + (g01 - g00) * sy + (g00 - g10 - g01 + g11) * sx * sy);
        }
        tot += amp; amp *= 0.5;
      }
      for (let i = 0; i < acc.length; i++) acc[i] /= tot;
      layers.push(acc);
    }
    for (let i = 0; i < size * size; i++) {
      img.data[i * 4] = layers[0][i] * 255; img.data[i * 4 + 1] = layers[1][i] * 255; img.data[i * 4 + 2] = layers[2][i] * 255; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: true });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
