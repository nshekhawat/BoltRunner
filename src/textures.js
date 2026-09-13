// All procedural textures and PBR materials. No image files anywhere.
import * as THREE from 'three';

// ---- Noise ----------------------------------------------------------------
// Deterministic hash → value noise → fBm. Returns Float32Array heights in [0,1].
const hash = (x, y, seed) => { let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const smooth = t => t * t * (3 - 2 * t);
function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
// Tileable fBm: sample on a torus by wrapping integer lattice coords modulo `scale`.
export function fbm(x, y, { scale = 8, octaves = 4, seed = 1, stretchY = 1 } = {}) {
  let amp = 0.5, sum = 0, norm = 0, freq = scale;
  for (let o = 0; o < octaves; o++) {
    const px = x * freq, py = y * freq * stretchY;
    // wrap so the texture tiles seamlessly
    const wx = ((px % freq) + freq) % freq, wy = (((py % (freq * stretchY)) + freq * stretchY) % (freq * stretchY));
    sum += amp * valueNoiseWrapped(wx, wy, freq, freq * stretchY, seed + o * 7); norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}
function valueNoiseWrapped(x, y, wx, wy, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const X = (xi + 1) % wx, Y = (yi + 1) % wy;
  const a = hash(xi, yi, seed), b = hash(X, yi, seed), c = hash(xi, Y, seed), d = hash(X, Y, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function makeNoiseTexture(size, opts = {}) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fbm(x / size, y / size, opts);
  return h;
}

// Generic canvas → texture. fn(x, y, u, v) returns [r,g,b] in 0..255 (or [r,g,b,a]).
export function canvasTexture(size, fn, { srgb = true, repeat = 1 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const p = fn(x, y, x / size, y / size), i = (y * size + x) * 4; d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = p[3] ?? 255; }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t;
}

// Height field → tangent-space normal map (Sobel). strength ≈ bump depth.
export function heightToNormal(h, size, strength = 2, repeat = 1) {
  return canvasTexture(size, (x, y) => {
    const g = (dx, dy) => h[((y + dy + size) % size) * size + (x + dx + size) % size];
    const dX = (g(1, 0) - g(-1, 0)) * strength, dY = (g(0, 1) - g(0, -1)) * strength;
    const len = Math.hypot(dX, dY, 1);
    return [(-dX / len * 0.5 + 0.5) * 255, (dY / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255];
  }, { srgb: false, repeat });
}

const clamp255 = v => Math.max(0, Math.min(255, v));
const mix = (a, b, t) => a + (b - a) * t;

// ---- Materials ------------------------------------------------------------
export function makeMaterials() {
  const S = 256;
  // Sand: grain + gentle dunes; roughness follows height.
  const sandH = makeNoiseTexture(S, { scale: 6, octaves: 5, seed: 3 });
  const grain = makeNoiseTexture(S, { scale: 64, octaves: 2, seed: 11 });
  const sandMap = canvasTexture(S, (x, y) => { const i = y * S + x, h = sandH[i], g = grain[i]; return [clamp255(mix(212, 230, h) - g * 14), clamp255(mix(165, 185, h) - g * 14), clamp255(mix(110, 130, h) - g * 12)]; });
  const sandRough = canvasTexture(S, (x, y) => { const v = clamp255(200 + grain[y * S + x] * 55); return [v, v, v]; }, { srgb: false });
  const sandNormal = heightToNormal(sandH.map((v, i) => v * 0.6 + grain[i] * 0.4), S, 1.6);
  // Rock: strong noise, warm red-brown with darker crevices.
  const rockH = makeNoiseTexture(S, { scale: 5, octaves: 5, seed: 21 });
  const rockMap = canvasTexture(S, (x, y) => { const h = rockH[y * S + x], k = Math.pow(h, 1.4); return [clamp255(mix(95, 190, k)), clamp255(mix(52, 115, k)), clamp255(mix(40, 85, k))]; });
  const rockNormal = heightToNormal(rockH, S, 3.5);
  // Brushed metal: horizontally stretched streaks. Roughness carries the streaks; albedo is faintly striped.
  const streak = makeNoiseTexture(S, { scale: 3, octaves: 4, seed: 5, stretchY: 40 });
  const metalMap = canvasTexture(S, (x, y) => { const v = clamp255(178 + (streak[y * S + x] - 0.5) * 50); return [v, v + 3, v + 8]; });
  const metalRough = canvasTexture(S, (x, y) => { const v = clamp255(80 + streak[y * S + x] * 110); return [v, v, v]; }, { srgb: false });
  const metalNormal = heightToNormal(streak, S, 0.6);
  // Scratched paint with panel lines: base colour + light scratches + dark grid seams.
  const scratches = makeNoiseTexture(S, { scale: 40, octaves: 2, seed: 9, stretchY: 0.15 });
  const paint = (r, g, b, seam = 64) => canvasTexture(S, (x, y) => {
    const s = scratches[y * S + x], sc = s > 0.72 ? (s - 0.72) * 260 : 0; // sparse bright scratches
    const onSeam = (x % seam < 2) || (y % seam < 2); const k = onSeam ? 0.55 : 1;
    return [clamp255((r + sc) * k), clamp255((g + sc) * k), clamp255((b + sc) * k)];
  });
  const paintRough = canvasTexture(S, (x, y) => { const s = scratches[y * S + x]; const v = clamp255(120 + s * 60); return [v, v, v]; }, { srgb: false });
  const paintNormal = heightToNormal(makeNoiseTexture(S, { scale: 40, octaves: 1, seed: 9, stretchY: 0.15 }).map(v => v > 0.72 ? v : 0.5), S, 1.2);
  // Wood grain.
  const woodH = makeNoiseTexture(S, { scale: 2, octaves: 4, seed: 33, stretchY: 12 });
  const woodMap = canvasTexture(S, (x, y) => { const h = woodH[y * S + x], k = 0.5 + 0.5 * Math.sin(h * 18); return [clamp255(mix(110, 170, k)), clamp255(mix(70, 115, k)), clamp255(mix(40, 65, k))]; });
  const woodNormal = heightToNormal(woodH, S, 1.5);
  // Rust for barrels: paint with orange rust blotches.
  const rustN = makeNoiseTexture(S, { scale: 4, octaves: 4, seed: 44 });
  const rustMap = canvasTexture(S, (x, y) => { const i = y * S + x, r = rustN[i], k = smooth(Math.min(1, Math.max(0, (r - 0.45) * 3))); return [clamp255(mix(185, 120, k)), clamp255(mix(70, 60, k)), clamp255(mix(40, 30, k))]; });
  const rustRough = canvasTexture(S, (x, y) => { const v = clamp255(110 + rustN[y * S + x] * 140); return [v, v, v]; }, { srgb: false });
  // Tyre tracks: transparent strip with two tread lines (alpha only where the tread is).
  const tracks = canvasTexture(128, (x, y, u, v) => { const inLane = (Math.abs(v - 0.3) < 0.07 || Math.abs(v - 0.7) < 0.07), tread = (x % 16) < 9; const a = inLane && tread ? 90 : 0; return [40, 25, 15, a]; });
  tracks.repeat.set(40, 1);
  // Cloud sprite: soft blobs with alpha.
  const cloudN = makeNoiseTexture(128, { scale: 3, octaves: 3, seed: 77 });
  const cloud = canvasTexture(128, (x, y, u, v) => { const d = Math.hypot(u - 0.5, (v - 0.5) * 2.2), a = Math.max(0, 1 - d * 2) * Math.max(0, cloudN[y * 128 + x] * 1.8 - 0.4); return [255, 255, 255, clamp255(a * 255)]; });
  cloud.wrapS = cloud.wrapT = THREE.ClampToEdgeWrapping;
  // Light shaft: vertical soft gradient.
  const shaft = canvasTexture(64, (x, y, u, v) => { const a = Math.sin(u * Math.PI) ** 2 * (1 - v) * v * 4; return [255, 240, 200, clamp255(a * 255)]; });
  shaft.wrapS = shaft.wrapT = THREE.ClampToEdgeWrapping;
  // Round particle dot.
  const dot = canvasTexture(32, (x, y, u, v) => { const d = Math.hypot(u - 0.5, v - 0.5) * 2, a = Math.max(0, 1 - d); return [255, 255, 255, clamp255(a * a * 255)]; });

  const std = o => new THREE.MeshStandardMaterial(o);
  sandMap.repeat.set(40, 12); sandRough.repeat.copy(sandMap.repeat); sandNormal.repeat.copy(sandMap.repeat);
  return {
    textures: { tracks, cloud, shaft, dot, sandMap, sandRough, sandNormal },
    ground: std({ map: sandMap, roughnessMap: sandRough, normalMap: sandNormal, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1, metalness: 0 }),
    tracks: new THREE.MeshBasicMaterial({ map: tracks, transparent: true, depthWrite: false }),
    rock: std({ map: rockMap, normalMap: rockNormal, roughness: 0.95, metalness: 0 }),
    barrel: std({ map: rustMap, roughnessMap: rustRough, normalMap: paintNormal, roughness: 1, metalness: 0.35 }),
    barrelRim: std({ map: metalMap, roughnessMap: metalRough, color: 0x777a80, roughness: 1, metalness: 0.9 }),
    wood: std({ map: woodMap, normalMap: woodNormal, roughness: 0.85 }),
    drone: std({ map: paint(232, 226, 210, 32), roughnessMap: paintRough, normalMap: paintNormal, roughness: 0.9, metalness: 0.5 }),
    droneDark: std({ color: 0x3b3f4a, roughness: 0.5, metalness: 0.6 }),
    droneEye: std({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 2 }),
    rotor: std({ color: 0x222222, transparent: true, opacity: 0.6 }),
    vent: std({ map: metalMap, roughnessMap: metalRough, normalMap: metalNormal, color: 0x8a8f98, roughness: 1, metalness: 0.9 }),
    steam: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
    tyre: std({ color: 0x2a2a2e, roughness: 0.9, normalMap: paintNormal }),
    rim: std({ map: metalMap, roughnessMap: metalRough, color: 0xb0b4bc, roughness: 1, metalness: 0.9 }),
    battery: std({ color: 0x3ddc84, emissive: 0x1a8a4a, emissiveIntensity: 0.8, roughness: 0.4 }),
    batteryBolt: new THREE.MeshBasicMaterial({ color: 0xfff27a }),
    robotMetal: std({ map: metalMap, roughnessMap: metalRough, normalMap: metalNormal, normalScale: new THREE.Vector2(0.4, 0.4), color: 0xd0d6e0, roughness: 1, metalness: 0.9 }),
    robotAccent: std({ map: paint(255, 138, 61, 48), roughnessMap: paintRough, normalMap: paintNormal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1, metalness: 0.15 }),
    robotDark: std({ color: 0x2f3540, roughness: 0.6, metalness: 0.5 }),
    robotEye: std({ color: 0x9ff8ff, emissive: 0x30e0ff, emissiveIntensity: 2.5, roughness: 0.3 }),
    mesa: [0xd08a60, 0xc47a58, 0xb06a50].map(c => { const m = rockMap.clone(); m.repeat.set(0.08, 0.08); const n = rockNormal.clone(); n.repeat.set(0.08, 0.08); return std({ color: c, map: m, normalMap: n, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1 }); }),
  };
}
