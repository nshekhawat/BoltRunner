// Pooled obstacle meshes + collision. Physics (hitboxes, timing) is the archetype table in spawn.js and never changes per biome;
// a biome only supplies makeMesh() per archetype, auto-fitted to the archetype box here. The health pickup's recognition layer
// (core, ring, halo, beam) is built here and is identical everywhere; the biome adds a decorative shell around it.
import * as THREE from 'three';
import { CONFIG as C } from './config.js';
import { DEFS, Spawner, checkClearable, leadTime, REQUIRED_LEAD, timeToPlayer } from './spawn.js';
import { PALETTES } from './palettes.js';
import { injectHC } from './textures.js';

// Startup assertions: geometry and lead time must be provably fair, not eyeballed.
{
  const bad = checkClearable(); console.assert(bad.length === 0, 'Unclearable obstacles:', bad);
  for (const cap of Object.values(C.SPEED_CAP)) for (const [n, d] of Object.entries(DEFS))
    console.assert(leadTime(cap, d.speedMult ?? 1) >= REQUIRED_LEAD, `Lead time too short for ${n} at ${cap} u/s`);
}

// Rim outline: back-face scaled clone in the biome's rim colour so silhouettes separate from any sky.
function addOutline(group, mat) {
  group.traverse(m => {
    if (!m.isMesh || m.userData.noOutline) return;
    const o = new THREE.Mesh(m.geometry, mat); o.scale.setScalar(1.06); o.userData.noOutline = true; o.userData.outline = true; m.add(o);
  });
}
const disposeTree = root => root.traverse(o => { if (o.geometry && !o.userData.keep) o.geometry.dispose(); });
const collectGeometries = (root, out) => { root.traverse(o => { if (o.geometry && !o.userData.keep) out.push(o.geometry); }); return out; };

// ---- Health pickup: invariant recognition layer -----------------------------------------------
const WHITE = new THREE.Color(0xffffff), DARK = new THREE.Color();
// Chase-camera view direction: rings are oriented to face it so they project as full circles around the core, never across it.
export const VIEW_DIR = new THREE.Vector3(...C.CAMERA_LOOK).sub(new THREE.Vector3(...C.CAMERA_POS)).normalize();
const PICK = {
  // transparent:true (opacity 1) puts core and ring in the transparent pass so renderOrder can place them above the halo plate.
  core: injectHC(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3, roughness: 0.2, transparent: true }), 'obstacle'),
  ring: injectHC(new THREE.MeshStandardMaterial({ color: 0x9ffcff, emissive: 0x40e8ff, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0.4, transparent: true }), 'obstacle'),
  coreGeo: new THREE.SphereGeometry(0.27, 20, 14), ringGeo: new THREE.TorusGeometry(0.72, 0.055, 10, 36), knobGeo: new THREE.SphereGeometry(0.1, 8, 6), beamGeo: new THREE.PlaneGeometry(0.7, 60),
};
let palette = PALETTES.normal;
export function setPalette(id) { palette = PALETTES[id] ?? PALETTES.normal; PICK.ring.emissive.setHex(palette.ring); PICK.ring.color.setHex(palette.ring); }
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const complement = hex => { const c = new THREE.Color(hex), h = {}; c.getHSL(h); return c.setHSL((h.h + 0.5) % 1, Math.max(0.8, h.s), 0.62); };

export class Obstacles {
  constructor(scene, shared, rng = Math.random) {
    this.scene = scene; this.shared = shared; this.spawner = new Spawner(rng); this.pools = {}; this.active = []; this.biome = null; this.fit = {};
    this.hitboxScale = C.HITBOX_SCALE.kid;
    this.dbgMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
    this.outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a1020, side: THREE.BackSide });
    // Halo: a backing plate in the palette's complementary hue whose lightness is the inverse of the scene's (dark on bright days, bright at night),
    // drawn with depth test off so it shows through fog, rain, snow and dust. This is the contrast guarantee.
    this.haloMat = new THREE.SpriteMaterial({ map: shared.textures.disc, color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, opacity: 1, fog: false });
    this.rimMat = new THREE.SpriteMaterial({ map: shared.textures.disc, color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, opacity: 0.9, fog: false }); // complement-hue ring around the plate
    this.beamMat = new THREE.MeshBasicMaterial({ map: shared.textures.streak, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0, fog: false, side: THREE.DoubleSide });
    this.sceneL = 0.5; this.plateDark = true; this.plateTarget = new THREE.Color(); this._v2 = new THREE.Vector2(); this._v3 = new THREE.Vector3(); this._px = new Uint8Array(6 * 6 * 4);
    this.pickups = [0, 1].map(() => this.buildPickup());
    for (const g of this.pickups) { g.visible = false; scene.add(g); }
    // Power-up orb: same recognition layer (plate, rim, beam, bob) with a coloured core and an icon; one instance so two never coexist.
    this.powerKinds = { shield: { color: 0x4fa0ff, icon: '🛡️' }, magnet: { color: 0xff5a5a, icon: '🧲' }, slowmo: { color: 0xc07dff, icon: '⏳' }, rocket: { color: 0xff9a3a, icon: '🚀' } };
    for (const k of Object.values(this.powerKinds)) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.font = '48px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(k.icon, 32, 36); k.tex = new THREE.CanvasTexture(c); k.tex.colorSpace = THREE.SRGBColorSpace; }
    this.power = this.buildPickup(); this.power.userData.type = 'power'; this.power.userData.def = DEFS.power; this.power.visible = false; scene.add(this.power);
    const pc = this.power.getObjectByName('core'); pc.material = injectHC(PICK.core.clone(), 'obstacle'); pc.userData.own = true;
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false })); icon.scale.setScalar(0.62); icon.renderOrder = 14; icon.name = 'icon'; pc.add(icon);
    this.magnet = false;
    this.reset();
  }

  buildPickup() {
    const g = new THREE.Group(), body = new THREE.Group(); body.name = 'body'; body.position.y = C.PICKUP_HEIGHT; g.add(body);
    const core = new THREE.Mesh(PICK.coreGeo, PICK.core); core.name = 'core'; core.userData.keep = true; core.renderOrder = 12; body.add(core);
    const ring = new THREE.Mesh(PICK.ringGeo, PICK.ring); ring.name = 'ring'; ring.userData.keep = true; ring.lookAt(VIEW_DIR); ring.renderOrder = 13; body.add(ring);
    for (let k = 0; k < 4; k++) { const knob = new THREE.Mesh(PICK.knobGeo, PICK.ring); knob.position.set(Math.cos(k * Math.PI / 2) * 0.72, Math.sin(k * Math.PI / 2) * 0.72, 0); knob.userData.keep = true; knob.renderOrder = 13; ring.add(knob); } // knobs make the spin visible
    for (const m of [core, ring]) { const o = new THREE.Mesh(m.geometry, this.outlineMat); o.scale.setScalar(1.08); o.userData.noOutline = true; o.userData.keep = true; m.add(o); } // thin rim outline
    const rim = new THREE.Sprite(this.rimMat); rim.scale.setScalar(2.05); rim.renderOrder = 9; body.add(rim);
    const halo = new THREE.Sprite(this.haloMat); halo.scale.setScalar(1.75); halo.name = 'halo'; halo.renderOrder = 10; body.add(halo); // draw order: beam/rim 9 → halo 10 → shell 11 → core 12 → ring 13
    const beam = new THREE.Mesh(PICK.beamGeo, this.beamMat); beam.name = 'beam'; beam.userData.keep = true; beam.position.y = 30; beam.rotation.y = 0.5; beam.renderOrder = 9; g.add(beam);
    const shell = new THREE.Group(); shell.name = 'shell'; body.add(shell);
    const dbg = new THREE.Mesh(new THREE.BoxGeometry(DEFS.pickup.boxes[0][2], DEFS.pickup.boxes[0][3], 1), this.dbgMat); dbg.position.y = C.PICKUP_HEIGHT; dbg.visible = false; g.add(dbg);
    g.userData = { type: 'pickup', def: DEFS.pickup, t: 0, passed: false, hit: false, dbg: [dbg] };
    return g;
  }

  // Build one obstacle group from the biome's makeMesh, scaled to the archetype box. Warns when the art needs more than 15% scaling.
  build(type, inst) {
    const d = DEFS[type], mk = inst.def.obstacles[d.arch].makeMesh, g = new THREE.Group(), body = new THREE.Group(); body.name = 'body';
    const mesh = mk(inst.ctx, inst.M, type); body.add(mesh); g.add(body);
    this.boostMaterials(mesh, inst); // obstacle-only material clones so High-Contrast Mode can saturate them without touching scenery
    const box = new THREE.Box3().setFromObject(mesh, true), size = box.getSize(new THREE.Vector3());
    const sx = d.width / size.x, sy = d.height / size.y; mesh.scale.set(sx, sy, sx);
    if (d.fly !== undefined) { mesh.position.y = -(box.min.y + box.max.y) / 2 * sy; body.position.y = d.fly; } else mesh.position.y = -box.min.y * sy;
    const key = `${inst.def.id}.${d.arch}`;
    if (!(key in this.fit)) { this.fit[key] = { sx: +sx.toFixed(2), sy: +sy.toFixed(2) }; if (Math.abs(sx - 1) > 0.15 || Math.abs(sy - 1) > 0.15) console.warn(`Obstacle mesh ${key} needs ${Math.round(Math.max(Math.abs(sx - 1), Math.abs(sy - 1)) * 100)}% scaling to fit its archetype box (${d.width}×${d.height})`); }
    addOutline(mesh, this.outlineMat);
    g.userData = { type, def: d, t: 0, passed: false, hit: false, phase: 0, dbg: [] };
    for (const b of d.boxes) { const m = new THREE.Mesh(new THREE.BoxGeometry(b[2], b[3], 1), this.dbgMat); m.position.set(b[0], b[1], 0); m.visible = false; g.add(m); g.userData.dbg.push(m); }
    return g;
  }

  boostMaterials(root, inst) {
    const cache = (inst.hcClones ??= new Map());
    root.traverse(o => { if (!o.isMesh || o.userData.outline) return; let c = cache.get(o.material); if (!c) { c = injectHC(o.material.clone(), 'obstacle'); cache.set(o.material, c); } o.material = c; });
  }
  // Build the pools for a biome instance. A generator (one archetype per step) so Journey can do it on idle time before the swap.
  *buildPools(inst) {
    const pools = {};
    for (const type of Object.keys(DEFS)) {
      if (DEFS[type].pickup) continue; pools[type] = [];
      for (let i = 0; i < C.POOL_PER_TYPE; i++) { const g = this.build(type, inst); g.visible = false; pools[type].push(g); }
      yield;
    }
    const shells = this.pickups.map(() => { const s = inst.def.pickup.makePickupShell(inst.ctx, inst.M); this.boostMaterials(s, inst); addOutline(s, this.outlineMat); s.traverse(o => { o.renderOrder = 11; if (o.material?.transparent) o.material.depthWrite = false; }); return s; }); // shell sits between the halo plate and the core
    return { pools, shells };
  }
  // Swap every pooled mesh for the new biome's art. Old geometries are freed; materials belong to the old biome instance.
  // Returns the old pools' geometries; the caller disposes them (immediately, or chunked on idle time in Journey).
  setBiome(inst, prebuilt = null) {
    const old = []; if (this.biome?.hcClones) { for (const m of this.biome.hcClones.values()) m.dispose(); this.biome.hcClones.clear(); }
    for (const [type, list] of Object.entries(this.pools)) if (type !== 'pickup' && type !== 'power') for (const g of list) { collectGeometries(g, old); this.scene.remove(g); } // pickups persist; only their shell changes
    for (const g of this.active) if (g.userData.type !== 'pickup') { collectGeometries(g, old); this.scene.remove(g); }
    this.active = this.active.filter(g => g.userData.type === 'pickup');
    this.biome = inst; this.outlineMat.color.setHex(inst.def.palette.rim); this.rimMat.color.copy(complement(inst.def.palette.sky)); this.beamMat.color.copy(this.rimMat.color); this.setBackgroundLuminance(this.sceneL); this.applyPlate(0);
    const { pools, shells } = prebuilt ?? (() => { const g = this.buildPools(inst); let r; do r = g.next(); while (!r.done); return r.value; })();
    this.pools = pools; for (const list of Object.values(pools)) for (const g of list) this.scene.add(g);
    this.pickups.forEach((p, i) => { const shell = p.getObjectByName('shell'); collectGeometries(shell, old); shell.clear(); shell.add(shells[i]); });
    { const shell = this.power.getObjectByName('shell'); collectGeometries(shell, old); shell.clear(); } // the orb wears no biome shell: the icon is its identity
    this.pools.pickup = this.pickups.filter(p => !p.visible); this.pools.power = this.power.visible ? [] : [this.power];
    return old;
  }
  // Contrast guarantee. The plate is a light or dark tint of the complement hue depending on what is actually behind the pickup lane:
  // display luminance > 0.18 → near-black plate, else near-white plate (with hysteresis). Either way the median footprint pixel clears 4.5:1.
  // Pure black or white plate: at the crossover luminance (~0.18) only the extremes reach 4.5:1, so the complement hue lives on the rim sprite and the beam.
  setBackgroundLuminance(l) { this.sceneL = l; this.plateDark = l > 0.18; this.plateTarget.setScalar(this.plateDark ? 0 : 1); }
  applyPlate(dt) { this.haloMat.color.lerp(this.plateTarget, dt === 0 ? 1 : Math.min(1, dt * 3)); }
  // Reads a 6×6 block of the freshly rendered frame at the lane ahead. Non-blocking: readPixels goes into a pixel-pack buffer and
  // pollBackground() collects it once the GPU fence signals, so the pipeline never stalls. Skipped when anything sits on the sample spot.
  measureBackground(renderer, camera) {
    const x = 11; for (const g of this.active) if (Math.abs(g.position.x - x) < 3) return;
    const gl = renderer.getContext(); if (this._fence) return; // previous read still in flight
    const size = renderer.getDrawingBufferSize(this._v2), v = this._v3.set(x, C.PICKUP_HEIGHT, 0).project(camera);
    const cx = Math.round((v.x + 1) / 2 * size.x) - 3, cy = Math.round((v.y + 1) / 2 * size.y) - 3; if (cx < 0 || cy < 0) return;
    this._pbo ??= gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._pbo); gl.bufferData(gl.PIXEL_PACK_BUFFER, this._px.byteLength, gl.STREAM_READ);
    gl.readPixels(cx, cy, 6, 6, gl.RGBA, gl.UNSIGNED_BYTE, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    this._fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  }
  pollBackground(renderer) {
    if (!this._fence) return; const gl = renderer.getContext();
    if (gl.getSyncParameter(this._fence, gl.SYNC_STATUS) !== gl.SIGNALED) return;
    gl.deleteSync(this._fence); this._fence = null;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._pbo); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this._px); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    let sum = 0; for (let i = 0; i < 36; i++) sum += 0.2126 * lin(this._px[i * 4]) + 0.7152 * lin(this._px[i * 4 + 1]) + 0.0722 * lin(this._px[i * 4 + 2]);
    this.setBackgroundLuminance(sum / 36);
  }
  // Synchronous variant for the contrast test harness.
  measureBackgroundSync(renderer, camera) {
    const gl = renderer.getContext(), size = renderer.getDrawingBufferSize(this._v2), v = this._v3.set(11, C.PICKUP_HEIGHT, 0).project(camera);
    const cx = Math.round((v.x + 1) / 2 * size.x) - 3, cy = Math.round((v.y + 1) / 2 * size.y) - 3;
    gl.readPixels(cx, cy, 6, 6, gl.RGBA, gl.UNSIGNED_BYTE, this._px); let sum = 0;
    for (let i = 0; i < 36; i++) sum += 0.2126 * lin(this._px[i * 4]) + 0.7152 * lin(this._px[i * 4 + 1]) + 0.0722 * lin(this._px[i * 4 + 2]);
    this.setBackgroundLuminance(sum / 36);
  }
  // Journey: no spawns while a gateway is on the lane.
  hold(v, exitX) { this.holding = v; if (!v && exitX !== undefined) { this.spawner.last = { x: exitX, mult: 1, action: 'run' }; this.spawner.cooldown = 0.3; } }
  reset() {
    for (const g of this.active) { g.visible = false; this.pools[g.userData.type].push(g); }
    this.active.length = 0; this.spawner.reset(); this.magnet = false; this.powerActive = false;
  }
  setDifficulty(mode) { this.hitboxScale = C.HITBOX_SCALE[mode]; }

  spawn(type) {
    const g = this.pools[type].pop(); if (!g) return null;
    const u = g.userData; u.t = 0; u.passed = false; u.hit = false; u.phase = 0; u.assisted = false;
    g.position.set(C.SPAWN_X, 0, 0); g.visible = true;
    if (type === 'pickup') this.beamMat.opacity = 0;
    if (type === 'power') { const kinds = Object.keys(this.powerKinds), k = kinds[(this.spawner.rng() * kinds.length) | 0], K = this.powerKinds[k]; u.kind = k; const core = g.getObjectByName('core'); core.material.emissive.setHex(K.color); core.material.color.setHex(K.color); core.getObjectByName('icon').material.map = K.tex; core.getObjectByName('icon').material.needsUpdate = true; }
    this.active.push(g); return g;
  }

  // Fills ev: { passed: n, hit: obstacle|null, pickup: bool, hiss: bool, erupt: bool, beam: bool (a pickup's beam just switched on) }
  update(dt, speed, score, shields, ev, robotBoxes) {
    ev.passed = 0; ev.hit = null; ev.pickup = false; ev.power = null; ev.hiss = false; ev.erupt = false; ev.beam = false; (ev.passedTypes ??= []).length = 0;
    const s = this.hitboxScale; this.applyPlate(dt);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const g = this.active[i], u = g.userData, d = u.def, body = g.children[0];
      u.t += dt;
      g.position.x -= speed * (d.speedMult ?? 1) * dt;
      // Archetype animation (biome-independent: named children opt in)
      if (d.fly !== undefined) { body.position.y = d.fly + Math.sin(u.t * 5) * 0.08; body.traverse(o => { if (o.name === 'spin') o.rotation.y += dt * 40; else if (o.name === 'flap') o.rotation.x = (o.userData.base ?? 0) + Math.sin(u.t * 9) * 0.5 * (o.userData.side ?? 1); }); }
      if (d.speedMult) body.traverse(o => { if (o.name === 'roll') o.rotation.z -= speed * d.speedMult * dt / (o.userData.r ?? 0.55); });
      body.traverse(o => { if (o.name === 'flicker') o.visible = Math.sin(u.t * 17) + Math.sin(u.t * 5.3) > -0.6; });
      if (d.pickup) { body.position.y = C.PICKUP_HEIGHT + Math.sin(u.t * Math.PI * 2 * 1.2) * 0.12; body.getObjectByName('ring').rotateZ(dt * 2.4); body.getObjectByName('shell').rotation.y += dt * 1.2;
        if (!d.power) PICK.core.emissive.setHex(palette.core).lerp(WHITE, 0.5 + 0.5 * Math.sin(u.t * 6)); // white → core-colour pulse
        if (this.magnet && g.position.x < 9 && g.position.x > C.ROBOT_X) { g.position.x -= (g.position.x - C.ROBOT_X) * Math.min(1, dt * 5); body.position.y = THREE.MathUtils.lerp(body.position.y, 1.0, Math.min(1, dt * 5)); } // Magnet pulls pickups in
        const tt = timeToPlayer(g.position.x, speed), on = tt <= C.PICKUP_BEAM_LEAD; if (on && !u.beamOn) ev.beam = true; u.beamOn = on;
        this.beamMat.opacity = THREE.MathUtils.lerp(this.beamMat.opacity, on && tt > 0 ? 0.55 : 0, Math.min(1, dt * 4)); }
      let dangerous = !d.pickup;
      if (d.telegraph) { // warn HAZARD_TELEGRAPH s before erupting at ~0.9 s away; stay up until passed
        const tt = timeToPlayer(g.position.x, speed), plume = body.getObjectByName('plume');
        const phase = tt <= 0.9 ? 2 : tt <= 0.9 + C.HAZARD_TELEGRAPH ? 1 : 0;
        if (phase === 1 && u.phase !== 1) ev.hiss = true; if (phase === 2 && u.phase !== 2) ev.erupt = true; u.phase = phase;
        if (plume) { plume.visible = phase === 2; if (phase === 2) { plume.scale.y = Math.min(1, plume.scale.y + dt * 6); plume.rotation.y += dt * 3; } else plume.scale.y = 0.05; }
        dangerous = phase === 2;
      }
      for (const m of u.dbg) { m.visible = C.DEBUG_HITBOXES; if (m.visible) m.scale.set(s, s, 1); }
      // Collision (x/y AABB; depth is cosmetic)
      if (!u.hit && !u.passed && (dangerous || d.pickup)) {
        for (const b of d.boxes) {
          const bx = g.position.x + b[0], by = b[1], bw = b[2] * s, bh = b[3] * s;
          for (const r of robotBoxes) if (Math.abs(bx - r.cx) < (bw + r.w) / 2 && Math.abs(by - r.cy) < (bh + r.h) / 2) {
            if (d.power) { ev.power = u.kind; u.passed = true; g.visible = false; } else if (d.pickup) { ev.pickup = true; u.passed = true; g.visible = false; } else { ev.hit = g; u.hit = true; }
            break;
          }
          if (u.hit || u.passed) break;
        }
      }
      if (!u.passed && !u.hit && !d.pickup && g.position.x + d.halfW < C.ROBOT_X - 0.6) { u.passed = true; ev.passed++; ev.passedTypes.push(d.arch); }
      if (g.position.x < C.DESPAWN_X || (d.pickup && u.passed)) { g.visible = false; this.active.splice(i, 1); this.pools[u.type].push(g); }
    }
    if (this.holding) { this.spawner.cooldown = Math.max(this.spawner.cooldown, 0.5); if (this.spawner.last) this.spawner.last.x -= speed * this.spawner.last.mult * dt; return; }
    const type = this.spawner.tick(dt, speed, score, shields < C.SHIELDS_MAX && this.pools.pickup.length > 0, this.pools.power.length > 0 && !this.powerActive);
    if (type) this.spawn(type);
  }
}
