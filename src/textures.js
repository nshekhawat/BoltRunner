// Procedural texture helpers and the biome-independent materials (robot, particles). No image files anywhere.
// Biome-specific textures live in src/biomes/*.js and are built through the ctx these helpers form.
import * as THREE from 'three';

// ---- High-Contrast Mode ----------------------------------------------------
// Shared uniforms: scenery materials desaturate by `desat`, obstacle/pickup materials gain `sat` extra saturation. Applied after
// tone mapping and fog so it works in display space. Programs are shared (same injected source), so toggling costs nothing.
export const HC = { desat: { value: 0 }, sat: { value: 0 } };
const HC_GLSL = `
  vec3 hcLum = vec3(dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114)));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, hcLum, uDesat);
  gl_FragColor.rgb = clamp(mix(hcLum, gl_FragColor.rgb, 1.0 + uSat), 0.0, 1.0);`;
function hcScenery(shader) { shader.uniforms.uDesat = HC.desat; shader.uniforms.uSat = HC.zero; shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform float uDesat, uSat;\nvoid main() {').replace('#include <premultiplied_alpha_fragment>', '#include <premultiplied_alpha_fragment>' + HC_GLSL); }
function hcObstacle(shader) { shader.uniforms.uDesat = HC.zero; shader.uniforms.uSat = HC.sat; shader.fragmentShader = shader.fragmentShader.replace('void main() {', 'uniform float uDesat, uSat;\nvoid main() {').replace('#include <premultiplied_alpha_fragment>', '#include <premultiplied_alpha_fragment>' + HC_GLSL); }
HC.zero = { value: 0 };
export function injectHC(material, kind = 'scenery') { if (material.isShaderMaterial || material.userData.hc) return material; material.userData.hc = kind; material.onBeforeCompile = kind === 'obstacle' ? hcObstacle : hcScenery; material.needsUpdate = true; return material; }

// ---- Noise ----------------------------------------------------------------
// Deterministic hash → value noise → fBm. Returns Float32Array heights in [0,1].
const hash = (x, y, seed) => { let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const smooth = t => t * t * (3 - 2 * t);
// Tileable fBm: sample on a torus by wrapping integer lattice coords modulo `scale`.
export function fbm(x, y, { scale = 8, octaves = 4, seed = 1, stretchY = 1 } = {}) {
  let amp = 0.5, sum = 0, norm = 0, freq = scale;
  for (let o = 0; o < octaves; o++) {
    const px = x * freq, py = y * freq * stretchY;
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
export function canvasTexture(size, fn, { srgb = true, repeat = 1, clamp = false } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const p = fn(x, y, x / size, y / size), i = (y * size + x) * 4; d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2]; d[i + 3] = p[3] ?? 255; }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
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

export const clamp255 = v => Math.max(0, Math.min(255, v));
export const mix = (a, b, t) => a + (b - a) * t;

// Brushed metal + scratched paint used by the robot (and available to biomes through ctx.shared).
export function makeSharedMaterials() {
  const S = 256, std = o => new THREE.MeshStandardMaterial(o);
  const streak = makeNoiseTexture(S, { scale: 3, octaves: 4, seed: 5, stretchY: 40 });
  const metalMap = canvasTexture(S, (x, y) => { const v = clamp255(178 + (streak[y * S + x] - 0.5) * 50); return [v, v + 3, v + 8]; });
  const metalRough = canvasTexture(S, (x, y) => { const v = clamp255(80 + streak[y * S + x] * 110); return [v, v, v]; }, { srgb: false });
  const metalNormal = heightToNormal(streak, S, 0.6);
  const scratches = makeNoiseTexture(S, { scale: 40, octaves: 2, seed: 9, stretchY: 0.15 });
  const paint = (r, g, b, seam = 64) => canvasTexture(S, (x, y) => {
    const s = scratches[y * S + x], sc = s > 0.72 ? (s - 0.72) * 260 : 0;
    const k = ((x % seam < 2) || (y % seam < 2)) ? 0.55 : 1;
    return [clamp255((r + sc) * k), clamp255((g + sc) * k), clamp255((b + sc) * k)];
  });
  const paintRough = canvasTexture(S, (x, y) => { const v = clamp255(120 + scratches[y * S + x] * 60); return [v, v, v]; }, { srgb: false });
  const paintNormal = heightToNormal(makeNoiseTexture(S, { scale: 40, octaves: 1, seed: 9, stretchY: 0.15 }).map(v => v > 0.72 ? v : 0.5), S, 1.2);
  const cloudN = makeNoiseTexture(128, { scale: 3, octaves: 3, seed: 77 });
  const cloud = canvasTexture(128, (x, y, u, v) => { const d = Math.hypot(u - 0.5, (v - 0.5) * 2.2), a = Math.max(0, 1 - d * 2) * Math.max(0, cloudN[y * 128 + x] * 1.8 - 0.4); return [255, 255, 255, clamp255(a * 255)]; }, { clamp: true });
  const shaft = canvasTexture(64, (x, y, u, v) => { const a = Math.sin(u * Math.PI) ** 2 * (1 - v) * v * 4; return [255, 240, 200, clamp255(a * 255)]; }, { clamp: true });
  const disc = canvasTexture(64, (x, y, u, v) => { const d = Math.hypot(u - 0.5, v - 0.5) * 2, a = d < 0.7 ? 1 : Math.max(0, 1 - (d - 0.7) / 0.3); return [255, 255, 255, clamp255(a * a * 255)]; }, { clamp: true }); // halo plate: solid centre, soft rim
  const dot = canvasTexture(32, (x, y, u, v) => { const d = Math.hypot(u - 0.5, v - 0.5) * 2, a = Math.max(0, 1 - d); return [255, 255, 255, clamp255(a * a * 255)]; });
  const streakTex = canvasTexture(32, (x, y, u, v) => { const a = Math.max(0, 1 - Math.abs(u - 0.5) * 6) * Math.sin(v * Math.PI); return [255, 255, 255, clamp255(a * 255)]; });
  return {
    textures: { cloud, shaft, dot, disc, streak: streakTex, metalMap, metalRough, metalNormal, paintRough, paintNormal },
    paint,
    robotMetal: std({ map: metalMap, roughnessMap: metalRough, normalMap: metalNormal, normalScale: new THREE.Vector2(0.4, 0.4), color: 0xd0d6e0, roughness: 1, metalness: 0.9 }),
    robotAccent: std({ map: paint(255, 138, 61, 48), roughnessMap: paintRough, normalMap: paintNormal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1, metalness: 0.15 }),
    robotDark: std({ color: 0x2f3540, roughness: 0.6, metalness: 0.5 }),
    robotEye: std({ color: 0x9ff8ff, emissive: 0x30e0ff, emissiveIntensity: 2.5, roughness: 0.3 }),
  };
}
