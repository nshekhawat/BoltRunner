// Tileable value-noise fBm: the heavy part of every procedural texture. Pure (no DOM, no three), so the same module runs in a Worker.
// Main thread: getNoise() serves from a cache that a Worker fills ahead of time (prefetch), or computes synchronously on a miss.
// The list of fields a biome needs is learned on its first build (recorded per biome id, persisted by the caller) and replayed later.
const hash = (x, y, seed) => { let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const smooth = t => t * t * (3 - 2 * t);
function valueNoiseWrapped(x, y, wx, wy, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const X = (xi + 1) % wx, Y = (yi + 1) % wy;
  const a = hash(xi, yi, seed), b = hash(X, yi, seed), c = hash(xi, Y, seed), d = hash(X, Y, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm(x, y, { scale = 8, octaves = 4, seed = 1, stretchY = 1 } = {}) {
  let amp = 0.5, sum = 0, norm = 0, freq = scale;
  for (let o = 0; o < octaves; o++) {
    const px = x * freq, py = y * freq * stretchY;
    const wx = ((px % freq) + freq) % freq, wy = (((py % (freq * stretchY)) + freq * stretchY) % (freq * stretchY));
    sum += amp * valueNoiseWrapped(wx, wy, freq, freq * stretchY, seed + o * 7); norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}
export function computeNoise(size, opts = {}) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fbm(x / size, y / size, opts);
  return h;
}
export const noiseKey = (size, opts = {}) => `${size}|${opts.scale ?? 8}|${opts.octaves ?? 4}|${opts.seed ?? 1}|${opts.stretchY ?? 1}`;
const parseKey = k => { const [size, scale, octaves, seed, stretchY] = k.split('|').map(Number); return { size, opts: { scale, octaves, seed, stretchY } }; };

// ---- Main-thread side -------------------------------------------------------------------------------------------------------
const cache = new Map(); let recording = null, worker = null, pending = new Map(); export const stats = { hits: 0, misses: 0, prefetched: 0 };
export function getNoise(size, opts) {
  const k = noiseKey(size, opts); if (recording && !recording.includes(k)) recording.push(k);
  let h = cache.get(k); if (h) { stats.hits++; return h; }
  stats.misses++; h = computeNoise(size, opts); cache.set(k, h); return h;
}
export function beginRecording() { recording = []; }
export function endRecording() { const r = recording; recording = null; cache.clear(); return r; } // fields are only needed during a build; drop them after
function getWorker() {
  if (worker !== null) return worker;
  try { worker = new Worker(new URL('./noise-worker.js', import.meta.url), { type: 'module' }); worker.onmessage = e => { const { key, data } = e.data; cache.set(key, data); pending.get(key)?.(); pending.delete(key); stats.prefetched++; }; worker.onerror = () => { worker = false; }; }
  catch { worker = false; } // no module workers (old Safari): everything computes on the main thread
  return worker;
}
// Compute the given fields in the Worker; resolves when they are all cached (or immediately when no worker is available).
export function prefetch(keys) {
  const w = getWorker(); if (!w || !keys?.length) return Promise.resolve(false);
  return Promise.all(keys.map(k => cache.has(k) ? null : new Promise(res => { pending.set(k, res); const { size, opts } = parseKey(k); w.postMessage({ key: k, size, opts }); }))).then(() => true);
}
