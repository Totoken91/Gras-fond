// Petits outils mathématiques partagés : hasard reproductible, bruit de Perlin simplex, interpolations.
export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

export function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

const perm = new Uint8Array(512);
{
  const r = mulberry(8612), p = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const GX = [1, -1, 1, -1, 1, -1, 0, 0], GY = [1, 1, -1, -1, 0, 0, 1, -1];
export function noise2(x, y) {
  const F = 0.366025403784, G = 0.211324865405, s = (x + y) * F;
  const i = Math.floor(x + s), j = Math.floor(y + s), t = (i + j) * G;
  const x0 = x - (i - t), y0 = y - (j - t), i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G, y1 = y0 - j1 + G, x2 = x0 - 1 + 2 * G, y2 = y0 - 1 + 2 * G, ii = i & 255, jj = j & 255;
  let n = 0, q = 0.5 - x0 * x0 - y0 * y0;
  if (q > 0) { const g = perm[ii + perm[jj]] & 7; q *= q; n += q * q * (GX[g] * x0 + GY[g] * y0); }
  q = 0.5 - x1 * x1 - y1 * y1;
  if (q > 0) { const g = perm[ii + i1 + perm[jj + j1]] & 7; q *= q; n += q * q * (GX[g] * x1 + GY[g] * y1); }
  q = 0.5 - x2 * x2 - y2 * y2;
  if (q > 0) { const g = perm[ii + 1 + perm[jj + 1]] & 7; q *= q; n += q * q * (GX[g] * x2 + GY[g] * y2); }
  return 70 * n;
}
export function fbm(x, y, o = 4) {
  let a = 0.5, f = 1, s = 0;
  for (let i = 0; i < o; i++) { s += a * noise2(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}
