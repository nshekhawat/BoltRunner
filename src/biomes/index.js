// Biome loader and disposal. An environment is data: adding a biome = one file + one import in registry.js.
import * as THREE from 'three';
import { CONFIG as C } from '../config.js';
import { canvasTexture, makeNoiseTexture, heightToNormal, fbm, smooth, clamp255, mix, injectHC } from '../textures.js';
import { mergeStatic, doubleAlongX } from '../merge.js';
import { beginRecording, endRecording } from '../noise.js';
export const NOISE_LISTS = {}; // biome id → noise field keys it requested (learned on first build; main.js persists and prefetches them)
export { BIOMES, BIOME_IDS } from './registry.js';

const shadowed = m => { m.castShadow = true; m.receiveShadow = true; return m; };
// Mesh primitives handed to biome factories. Every geometry is owned by the biome instance and freed on dispose.
const prim = {
  box: (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)); m.position.set(x, y, z); return m; },
  cyl: (rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 14) => { const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat)); m.position.set(x, y, z); return m; },
  cone: (r, h, mat, x = 0, y = 0, z = 0, seg = 7) => { const m = shadowed(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat)); m.position.set(x, y, z); return m; },
  sphere: (r, mat, x = 0, y = 0, z = 0, seg = 12) => { const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), mat)); m.position.set(x, y, z); return m; },
  plane: (w, h, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); return m; },
  group: () => new THREE.Group(),
};

// ctx handed to every biome factory. Textures made through ctx.tex are tracked so dispose() can free them.
// tex.clone makes a real second texture, not texture.clone(): clones share one GL texture and skew renderer.info.memory.textures by one per clone on dispose.
function makeCtx(shared, inst) {
  const track = t => { inst.textures.add(t); return t; };
  return {
    THREE, prim, shared, S: 256, viewDir: new THREE.Vector3(...C.CAMERA_LOOK).sub(new THREE.Vector3(...C.CAMERA_POS)).normalize(), // chase-camera view direction (face decor toward it)
    std: o => new THREE.MeshStandardMaterial(o), basic: o => new THREE.MeshBasicMaterial(o),
    tex: { canvasTexture: (...a) => track(canvasTexture(...a)), heightToNormal: (...a) => track(heightToNormal(...a)), clone: t => { const c = new THREE.CanvasTexture(t.image); c.wrapS = t.wrapS; c.wrapT = t.wrapT; c.colorSpace = t.colorSpace; c.anisotropy = t.anisotropy; c.repeat.copy(t.repeat); return track(c); }, makeNoiseTexture, fbm, smooth, clamp255, mix },
    rnd: seed => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }, // deterministic per-biome randomness
  };
}

// Ambient particle field from an AMBIENT spec: points drifting with `vel`, wrapping inside `area` (behind or beside the lane, never in front).
function makeAmbient(spec, shared) {
  const n = spec.count, pos = new Float32Array(n * 3), seed = new Float32Array(n), ax = spec.area.x, ay = spec.area.y, az = spec.area.z;
  for (let i = 0; i < n; i++) { pos[i * 3] = ax[0] + Math.random() * (ax[1] - ax[0]); pos[i * 3 + 1] = ay[0] + Math.random() * (ay[1] - ay[0]); pos[i * 3 + 2] = az[0] + Math.random() * (az[1] - az[0]); seed[i] = Math.random() * 6.28; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ map: shared.textures[spec.texture ?? 'dot'], size: spec.size, transparent: true, opacity: spec.opacity ?? 0.6, depthWrite: false, color: spec.color, blending: spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  return { spec, pts, pos, seed, n };
}

// Build a biome instance. A generator: each `yield` is a safe point to give the frame back (Journey builds on idle time).
export function* buildBiome(def, shared) {
  const inst = { def, textures: new Set(), root: new THREE.Group(), M: null, layers: [], props: [], ambient: [] };
  const ctx = inst.ctx = makeCtx(shared, inst); beginRecording();
  inst.M = yield* def.makeMaterials(ctx);
  // Ground plane + lane strip (one texture per step: each is a few ms once the noise fields are prefetched)
  const gmap = def.ground.makeTexture(ctx); yield; const gnorm = def.ground.makeNormal(ctx); yield; const grough = def.ground.makeRoughness?.(ctx); yield;
  const gopts = { ...def.ground.material }; if (grough) gopts.roughnessMap = grough; if (gopts.normalScale) gopts.normalScale = new THREE.Vector2(gopts.normalScale.x, gopts.normalScale.y);
  inst.groundMat = new THREE.MeshStandardMaterial({ map: gmap, normalMap: gnorm, roughness: 1, metalness: 0, ...gopts });
  for (const t of [gmap, gnorm, inst.groundMat.roughnessMap]) if (t) { t.repeat.set(40 * def.ground.scrollDetail, 12 * def.ground.scrollDetail); t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  inst.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 120), inst.groundMat); inst.ground.rotation.x = -Math.PI / 2; inst.ground.receiveShadow = true; inst.ground.updateMatrix(); inst.ground.matrixAutoUpdate = false; inst.root.add(inst.ground);
  const lmap = def.lane.makeTexture(ctx); lmap.repeat.set(40, 1); yield;
  inst.laneMat = new THREE.MeshBasicMaterial({ map: lmap, transparent: true, depthWrite: false });
  inst.lane = new THREE.Mesh(new THREE.PlaneGeometry(400, def.lane.width), inst.laneMat); inst.lane.rotation.x = -Math.PI / 2; inst.lane.position.set(0, 0.012, 0.25); inst.lane.updateMatrix(); inst.lane.matrixAutoUpdate = false; inst.root.add(inst.lane);
  // Parallax layers: one mesh per material holding two periods of the strip, so it wraps seamlessly by jumping back one period.
  // Far scenery never casts a shadow that reaches the lane (the sun sits on the camera side), so it stays out of the shadow pass.
  def.parallax.forEach((L, i) => {
    const a = doubleAlongX(mergeStatic(L.makeLayer(ctx, inst.M, i)), L.len); a.position.set(-20, L.y, L.z); a.traverse(o => { o.castShadow = false; }); inst.root.add(a);
    inst.layers.push({ a, par: L.speedFactor, len: L.len, def: L });
  });
  yield;
  // Decor props: each prop type is one scrolling band (static parts merged into one mesh per material, named parts kept per item for the
  // update hooks), doubled along x like a parallax layer. Spacing, depth and scale are randomised once at build time.
  for (const P of def.props) {
    const band = new THREE.Group(), items = []; let x = 0;
    for (let i = 0; i < P.count; i++) { const g = P.make(ctx, inst.M, i); g.position.set(x, 0, P.z[0] + Math.random() * (P.z[1] - P.z[0])); if (P.scale) g.scale.setScalar(P.scale[0] + Math.random() * (P.scale[1] - P.scale[0])); band.add(g); items.push(g); x += P.every[0] + Math.random() * (P.every[1] - P.every[0]); }
    const len = Math.max(x, 90); mergeStatic(band); doubleAlongX(band, len); band.position.x = -20; inst.root.add(band); // ≥ 90 u so a period never repeats inside the view
    inst.props.push({ def: P, items, band, len });
  }
  yield;
  for (const A of def.particles.ambient) { const a = makeAmbient(A, shared); inst.ambient.push(a); inst.root.add(a.pts); }
  inst.root.traverse(o => { if (o.material) for (const m of [].concat(o.material)) injectHC(m, 'scenery'); }); // High-Contrast Mode hook (scenery fades)
  NOISE_LISTS[def.id] = endRecording(); return inst;
}

export function buildBiomeSync(def, shared) { const g = buildBiome(def, shared); let r; do r = g.next(); while (!r.done); return r.value; }

// Free every GPU resource the instance owns. Materials used by obstacle meshes are in inst.M, so Obstacles.setBiome must run first.
// A generator: yields every few deletes so Journey can spread the work over idle callbacks (a full dispose is ~30 ms of GL deletes).
export function* disposeBiomeChunked(inst, extraGeometries = []) {
  const objs = []; inst.root.traverse(o => objs.push(o)); inst.root.removeFromParent(); inst.root.clear(); let n = 0;
  for (const o of objs) { if (o.geometry) o.geometry.dispose(); if (o.material) for (const m of [].concat(o.material)) m.dispose(); if (++n % 25 === 0) yield; }
  for (const g of extraGeometries) { g.dispose(); if (++n % 25 === 0) yield; }
  for (const v of Object.values(inst.M)) for (const m of [].concat(v)) if (m?.isMaterial) m.dispose();
  for (const t of inst.textures) { t.dispose(); if (++n % 5 === 0) yield; } inst.textures.clear();
  inst.groundMat.dispose(); inst.laneMat.dispose(); inst.M = null;
}
export function disposeBiome(inst) { for (const _ of disposeBiomeChunked(inst)); }
