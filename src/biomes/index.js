// Biome loader and disposal. An environment is data: adding a biome = one file + one import in registry.js.
import * as THREE from 'three';
import { canvasTexture, makeNoiseTexture, heightToNormal, fbm, smooth, clamp255, mix } from '../textures.js';
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
function makeCtx(shared, inst) {
  const track = t => { inst.textures.add(t); return t; };
  return {
    THREE, prim, shared, S: 256,
    std: o => new THREE.MeshStandardMaterial(o), basic: o => new THREE.MeshBasicMaterial(o),
    tex: { canvasTexture: (...a) => track(canvasTexture(...a)), heightToNormal: (...a) => track(heightToNormal(...a)), clone: t => { const c = t.clone(); c.needsUpdate = true; return track(c); }, makeNoiseTexture, fbm, smooth, clamp255, mix },
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
  const ctx = inst.ctx = makeCtx(shared, inst);
  inst.M = yield* def.makeMaterials(ctx);
  // Ground plane + lane strip
  const gmap = def.ground.makeTexture(ctx), gnorm = def.ground.makeNormal(ctx); yield;
  inst.groundMat = new THREE.MeshStandardMaterial({ map: gmap, normalMap: gnorm, roughness: 1, metalness: 0, ...def.ground.material });
  for (const t of [gmap, gnorm, inst.groundMat.roughnessMap]) if (t) { t.repeat.set(40 * def.ground.scrollDetail, 12 * def.ground.scrollDetail); t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  inst.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 120), inst.groundMat); inst.ground.rotation.x = -Math.PI / 2; inst.ground.receiveShadow = true; inst.root.add(inst.ground);
  const lmap = def.lane.makeTexture(ctx); lmap.repeat.set(40, 1); yield;
  inst.laneMat = new THREE.MeshBasicMaterial({ map: lmap, transparent: true, depthWrite: false });
  inst.lane = new THREE.Mesh(new THREE.PlaneGeometry(400, def.lane.width), inst.laneMat); inst.lane.rotation.x = -Math.PI / 2; inst.lane.position.set(0, 0.012, 0.25); inst.root.add(inst.lane);
  // Parallax layers: two copies of a strip so it wraps seamlessly.
  def.parallax.forEach((L, i) => {
    const a = L.makeLayer(ctx, inst.M, i), b = a.clone(); a.position.set(-20, L.y, L.z); b.position.set(-20 + L.len, L.y, L.z); inst.root.add(a, b);
    inst.layers.push({ a, b, par: L.speedFactor, len: L.len, def: L });
  });
  yield;
  // Decor props: pooled instances recycled along x.
  for (const P of def.props) {
    const items = []; let x = -20;
    for (let i = 0; i < P.count; i++) { const g = P.make(ctx, inst.M, i); g.position.set(x, 0, P.z[0] + Math.random() * (P.z[1] - P.z[0])); if (P.scale) g.scale.setScalar(P.scale[0] + Math.random() * (P.scale[1] - P.scale[0])); inst.root.add(g); items.push(g); x += P.every[0] + Math.random() * (P.every[1] - P.every[0]); }
    inst.props.push({ def: P, items });
  }
  yield;
  for (const A of def.particles.ambient) { const a = makeAmbient(A, shared); inst.ambient.push(a); inst.root.add(a.pts); }
  return inst;
}

export function buildBiomeSync(def, shared) { const g = buildBiome(def, shared); let r; do r = g.next(); while (!r.done); return r.value; }

// Free every GPU resource the instance owns. Materials used by obstacle meshes are in inst.M, so Obstacles.setBiome must run first.
export function disposeBiome(inst) {
  inst.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) for (const m of [].concat(o.material)) m.dispose(); });
  inst.root.removeFromParent(); inst.root.clear();
  for (const v of Object.values(inst.M)) for (const m of [].concat(v)) if (m?.isMaterial) m.dispose();
  for (const t of inst.textures) t.dispose(); inst.textures.clear();
  inst.groundMat.dispose(); inst.laneMat.dispose(); inst.M = null;
}
