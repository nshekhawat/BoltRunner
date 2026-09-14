// Benchmark determinism: replace Math.random with a seeded generator before any module that draws random numbers is evaluated.
// Imported first by main.js so the parallax, props, spawner and particles all take the same path on every run.
const params = new URLSearchParams(location.search);
if (params.get('bench')) {
  let s = (+(params.get('seed') ?? 1) >>> 0) || 1;
  Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32
}
export const BENCH = !!params.get('bench');
