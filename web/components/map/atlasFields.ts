// The numeric fields under the atlas: seeded value noise for the coast and
// the borders, and a distance transform for the washes and the water lines.

export const seedOf = (ids: string[]) => {
  let h = 2166136261;
  for (const c of ids.join("|")) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};

const hash2 = (x: number, y: number, s: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const smooth = (t: number) => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number, s: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Four octaves of value noise, roughly in [-0.5, 0.5]. */
export function fbm(x: number, y: number, s: number) {
  let sum = 0;
  let amp = 0.5;
  for (let o = 0; o < 4; o++, amp /= 2, x *= 2.03, y *= 2.03) {
    sum += amp * (valueNoise(x, y, s + o) - 0.5);
  }
  return sum * 1.9;
}

/**
 * Chamfer distance (in pixels) from every pixel to the nearest `seed` pixel —
 * two raster passes, so the washes and the water lines cost O(pixels).
 */
export function distanceTo(seed: Uint8Array, w: number, h: number) {
  const d = new Float32Array(w * h);
  for (let k = 0; k < d.length; k++) d[k] = seed[k] ? 0 : 1e9;
  const relax = (k: number, n: number, c: number) => {
    if (d[n] + c < d[k]) d[k] = d[n] + c;
  };
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (i > 0) relax(k, k - 1, 1);
      if (j > 0) {
        relax(k, k - w, 1);
        if (i > 0) relax(k, k - w - 1, 1.414);
        if (i + 1 < w) relax(k, k - w + 1, 1.414);
      }
    }
  for (let j = h - 1; j >= 0; j--)
    for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i;
      if (i + 1 < w) relax(k, k + 1, 1);
      if (j + 1 < h) {
        relax(k, k + w, 1);
        if (i + 1 < w) relax(k, k + w + 1, 1.414);
        if (i > 0) relax(k, k + w - 1, 1.414);
      }
    }
  return d;
}

/** Where a country's name goes, and how much room it has across. */
