// Writes the atlas's paper textures into public/. Run by hand after editing:
//
//   node scripts/textures.mjs
//
// The outputs are committed. They are static on purpose — Safari runs SVG
// filters and blend modes on the CPU every frame, so the grain, the marbling
// and the torn edge are pixels painted once here, never live effects.
// No dependencies: PNGs are encoded with node:zlib (deflate + crc32).

import fs from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const OUT = new URL("../public/", import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

// ---- PNG encoding ---------------------------------------------------------

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** `px` is RGBA (channels 4) or RGB (channels 3), row-major. */
function png(w, h, channels, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  const stride = w * channels;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    // Filter 1 (Sub): neighbouring pixels are alike, so deltas compress.
    raw[y * (stride + 1)] = 1;
    for (let x = 0; x < stride; x++) {
      const v = px[y * stride + x];
      const left = x >= channels ? px[y * stride + x - channels] : 0;
      raw[y * (stride + 1) + 1 + x] = (v - left) & 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- deterministic randomness & tileable noise ----------------------------

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value noise on a lattice of `period` cells that wraps — so it tiles. */
function periodicNoise(period, seed) {
  const r = rng(seed);
  const lattice = Array.from({ length: period * period }, r);
  const at = (i, j) =>
    lattice[
      (((j % period) + period) % period) * period + (((i % period) + period) % period)
    ];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    // u, v in [0, 1) across one tile.
    const x = u * period;
    const y = v * period;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = smooth(x - i);
    const fy = smooth(y - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
}

// ---- paper grain: iron-gall specks, fibres and mottling over transparency --

function paperGrain() {
  const N = 128;
  const px = new Uint8Array(N * N * 4);
  const INK = [43, 33, 24];
  const alpha = new Float32Array(N * N);
  const mottle = [periodicNoise(4, 11), periodicNoise(16, 12)];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const m = 0.65 * mottle[0](x / N, y / N) + 0.35 * mottle[1](x / N, y / N);
      alpha[y * N + x] = Math.max(0, m - 0.45) * 22;
    }
  const r = rng(7);
  const put = (x, y, a) => {
    const i = (((y % N) + N) % N) * N + (((x % N) + N) % N);
    alpha[i] = Math.min(255, alpha[i] + a);
  };
  // Specks: most faint, a few dark — ink flecks caught in the rag.
  for (let k = 0; k < 150; k++) {
    const x = Math.floor(r() * N);
    const y = Math.floor(r() * N);
    const a = r() < 0.05 ? 50 + r() * 40 : 8 + r() * 16;
    put(x, y, a);
    if (r() < 0.3) put(x + 1, y, a * 0.5);
  }
  // Fibres: short, faint, slightly curved strokes.
  for (let k = 0; k < 26; k++) {
    let x = r() * N;
    let y = r() * N;
    let dir = r() * Math.PI * 2;
    const len = 6 + r() * 14;
    for (let s = 0; s < len; s++) {
      put(Math.round(x), Math.round(y), 12);
      dir += (r() - 0.5) * 0.5;
      x += Math.cos(dir);
      y += Math.sin(dir);
    }
  }
  for (let i = 0; i < N * N; i++) {
    px.set(INK, i * 4);
    // Quantise: fewer distinct alphas, smaller file, no visible difference.
    px[i * 4 + 3] = Math.round(Math.min(255, alpha[i]) / 3) * 3;
  }
  return png(N, N, 4, px);
}

// ---- marbled endpaper: stone marbling, seamless -----------------------------
//
// Done the way a marbler does it, run backwards. Drops of ink land one after
// another on the size, each pushing everything already there outward (area is
// conserved: a point at distance d moves to sqrt(d² + r²)); then a comb is
// drawn gently across. For each pixel we undo the comb, then undo the drops
// newest-first until the point falls inside one — that drop's ink is the
// colour. Distances wrap around the tile, so it has no seam.

function endpaper() {
  // Drawn at 512 and shown smaller, so the veins stay crisp rather than
  // stair-stepped by upscaling.
  const N = 512;
  const scale = N / 256;
  const INKS = [
    [38, 50, 84], // indigo
    [148, 60, 40], // red ochre
    [228, 214, 182], // cream
    [46, 84, 86], // deep teal
    [176, 139, 62], // gilt
    [112, 40, 34], // oxblood
    [58, 70, 104], // slate indigo
  ];
  const GROUND = [214, 196, 160];
  const VEIN = [34, 26, 20];
  const r = rng(41);
  const drops = Array.from({ length: 150 }, (_, k) => ({
    x: r() * N,
    y: r() * N,
    r: (7 + r() * r() * 30) * scale,
    ink: k % INKS.length,
  }));
  const wrap = (d) => d - N * Math.round(d / N);
  const TAU = Math.PI * 2;
  const index = new Int16Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // Undo the comb: a slow wave, an integer number per tile.
      let qx = x;
      let qy =
        y - scale * (5 * Math.sin((TAU * 2 * x) / N) + 1.5 * Math.sin((TAU * 9 * x) / N));
      let hit = -1;
      for (let k = drops.length - 1; k >= 0; k--) {
        const d = drops[k];
        const dx = wrap(qx - d.x);
        const dy = wrap(qy - d.y);
        const dist2 = dx * dx + dy * dy;
        if (dist2 < d.r * d.r) {
          hit = d.ink;
          break;
        }
        const f = Math.sqrt(1 - (d.r * d.r) / dist2);
        qx = d.x + dx * f;
        qy = d.y + dy * f;
      }
      index[y * N + x] = hit;
    }
  const px = new Uint8Array(N * N * 3);
  const shade = periodicNoise(8, 43);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const k = index[i];
      // A dark vein where two inks meet, the way stone marbling holds its line.
      const edge =
        k !== index[y * N + ((x + 1) % N)] || k !== index[((y + 1) % N) * N + x];
      const c = edge ? VEIN : k < 0 ? GROUND : INKS[k];
      const s = 0.9 + 0.1 * shade(x / N, y / N);
      px[i * 3] = Math.round(c[0] * s);
      px[i * 3 + 1] = Math.round(c[1] * s);
      px[i * 3 + 2] = Math.round(c[2] * s);
    }
  return png(N, N, 3, px);
}

// ---- deckle: the torn edge of hand-made paper, as a tiling SVG strip -------

function deckle() {
  const r = rng(31);
  const W = 120;
  const pts = [];
  for (let x = 0; x <= W; x += 2) pts.push(`${x} ${(1 + r() * 4.5).toFixed(1)}`);
  // Start and end at the same height so the strip tiles without a step.
  pts[pts.length - 1] = `${W} ${pts[0].split(" ")[1]}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 8" width="${W}" height="8" preserveAspectRatio="none"><path fill="#f6efdf" d="M0 8L${pts.join("L")}L${W} 8Z"/></svg>\n`;
}

fs.writeFileSync(new URL("paper-grain.png", OUT), paperGrain());
fs.writeFileSync(new URL("endpaper.png", OUT), endpaper());
fs.writeFileSync(new URL("deckle.svg", OUT), deckle());
for (const f of ["paper-grain.png", "endpaper.png", "deckle.svg"])
  console.log(f, fs.statSync(new URL(f, OUT)).size, "bytes");
