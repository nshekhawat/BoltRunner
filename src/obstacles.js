// Pooled obstacle meshes + collision. Physics (hitboxes, timing) is the archetype table in spawn.js and never changes per biome;
// a biome only supplies makeMesh() per archetype, auto-fitted to the archetype box here. The health pickup's recognition layer
// (core, ring, halo, beam) is built here and is identical everywhere; the biome adds a decorative shell around it.
import * as THREE from 'three';
import { CONFIG as C } from './config.js';
import { DEFS, Spawner, checkClearable, leadTime, REQUIRED_LEAD, timeToPlayer } from './spawn.js';
import { ARCHETYPES } from './biomes/schema.js';

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

// ---- Health pickup: invariant recognition layer -----------------------------------------------
const PICK = {
  core: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3, roughness: 0.2 }),
  ring: new THREE.MeshStandardMaterial({ color: 0x9ffcff, emissive: 0x40e8ff, emissiveIntensity: 2.2, roughness: 0.3, metalness: 0.4 }),
  coreGeo: new THREE.SphereGeometry(0.3, 20, 14), ringGeo: new THREE.TorusGeometry(0.52, 0.055, 10, 36), beamGeo: new THREE.PlaneGeometry(0.7, 60),
};
const complement = hex => { const c = new THREE.Color(hex), h = {}; c.getHSL(h); return c.setHSL((h.h + 0.5) % 1, Math.max(0.8, h.s), 0.62); };

export class Obstacles {
  constructor(scene, shared, rng = Math.random) {
    this.scene = scene; this.shared = shared; this.spawner = new Spawner(rng); this.pools = {}; this.active = []; this.biome = null; this.fit = {};
    this.hitboxScale = C.HITBOX_SCALE.kid;
    this.dbgMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
    this.outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a1020, side: THREE.BackSide });
    this.haloMat = new THREE.SpriteMaterial({ map: shared.textures.dot, color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85, fog: false });
    this.beamMat = new THREE.MeshBasicMaterial({ map: shared.textures.streak, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false, side: THREE.DoubleSide });
    this.pickups = [0, 1].map(() => this.buildPickup());
    for (const g of this.pickups) { g.visible = false; scene.add(g); }
    this.reset();
  }

  buildPickup() {
    const g = new THREE.Group(), body = new THREE.Group(); body.name = 'body'; body.position.y = C.PICKUP_HEIGHT; g.add(body);
    const core = new THREE.Mesh(PICK.coreGeo, PICK.core); core.name = 'core'; core.userData.keep = true; body.add(core);
    const ring = new THREE.Mesh(PICK.ringGeo, PICK.ring); ring.name = 'ring'; ring.userData.keep = true; ring.rotation.x = 1.1; body.add(ring);
    const halo = new THREE.Sprite(this.haloMat); halo.scale.setScalar(2.2); halo.name = 'halo'; body.add(halo);
    const beam = new THREE.Mesh(PICK.beamGeo, this.beamMat); beam.name = 'beam'; beam.userData.keep = true; beam.position.y = 30; beam.rotation.y = 0.5; g.add(beam);
    const shell = new THREE.Group(); shell.name = 'shell'; body.add(shell);
    const dbg = new THREE.Mesh(new THREE.BoxGeometry(DEFS.pickup.boxes[0][2], DEFS.pickup.boxes[0][3], 1), this.dbgMat); dbg.position.y = C.PICKUP_HEIGHT; dbg.visible = false; g.add(dbg);
    g.userData = { type: 'pickup', def: DEFS.pickup, t: 0, passed: false, hit: false, dbg: [dbg] };
    return g;
  }

  // Build one obstacle group from the biome's makeMesh, scaled to the archetype box. Warns when the art needs more than 15% scaling.
  build(type, inst) {
    const d = DEFS[type], mk = inst.def.obstacles[d.arch].makeMesh, g = new THREE.Group(), body = new THREE.Group(); body.name = 'body';
    const mesh = mk(inst.ctx, inst.M, type); body.add(mesh); g.add(body);
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

  // Swap every pooled mesh for the new biome's art. Old geometries are freed; materials belong to the old biome instance.
  setBiome(inst) {
    for (const list of Object.values(this.pools)) for (const g of list) { disposeTree(g); this.scene.remove(g); }
    for (const g of this.active) if (g.userData.type !== 'pickup') { disposeTree(g); this.scene.remove(g); }
    this.active = this.active.filter(g => g.userData.type === 'pickup'); this.pools = {};
    this.biome = inst; this.outlineMat.color.setHex(inst.def.palette.rim); this.haloMat.color.copy(complement(inst.def.palette.sky)); this.beamMat.color.copy(this.haloMat.color);
    for (const type of Object.keys(DEFS)) {
      if (DEFS[type].pickup) continue; this.pools[type] = [];
      for (let i = 0; i < C.POOL_PER_TYPE; i++) { const g = this.build(type, inst); g.visible = false; this.scene.add(g); this.pools[type].push(g); }
    }
    for (const p of this.pickups) { const shell = p.getObjectByName('shell'); disposeTree(shell); shell.clear(); const s = inst.def.pickup.makePickupShell(inst.ctx, inst.M); addOutline(s, this.outlineMat); shell.add(s); }
    this.pools.pickup = this.pickups.filter(p => !p.visible);
  }
  reset() {
    for (const g of this.active) { g.visible = false; this.pools[g.userData.type].push(g); }
    this.active.length = 0; this.spawner.reset();
  }
  setDifficulty(mode) { this.hitboxScale = C.HITBOX_SCALE[mode]; }

  spawn(type) {
    const g = this.pools[type].pop(); if (!g) return null;
    const u = g.userData; u.t = 0; u.passed = false; u.hit = false; u.phase = 0;
    g.position.set(C.SPAWN_X, 0, 0); g.visible = true;
    if (type === 'pickup') this.beamMat.opacity = 0;
    this.active.push(g); return g;
  }

  // Fills ev: { passed: n, hit: obstacle|null, pickup: bool, hiss: bool, erupt: bool, beam: bool (a pickup's beam just switched on) }
  update(dt, speed, score, shields, ev, robotBoxes) {
    ev.passed = 0; ev.hit = null; ev.pickup = false; ev.hiss = false; ev.erupt = false; ev.beam = false;
    const s = this.hitboxScale;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const g = this.active[i], u = g.userData, d = u.def, body = g.children[0];
      u.t += dt;
      g.position.x -= speed * (d.speedMult ?? 1) * dt;
      // Archetype animation (biome-independent: named children opt in)
      if (d.fly !== undefined) { body.position.y = d.fly + Math.sin(u.t * 5) * 0.08; body.traverse(o => { if (o.name === 'spin') o.rotation.y += dt * 40; else if (o.name === 'flap') o.rotation.x = (o.userData.base ?? 0) + Math.sin(u.t * 9) * 0.5 * (o.userData.side ?? 1); }); }
      if (d.speedMult) { const r = body.getObjectByName('roll'); if (r) r.rotation.z -= speed * d.speedMult * dt / 0.55; }
      if (d.pickup) { body.position.y = C.PICKUP_HEIGHT + Math.sin(u.t * Math.PI * 2 * 1.2) * 0.12; body.getObjectByName('ring').rotation.z += dt * 2.4; body.getObjectByName('shell').rotation.y += dt * 1.2;
        PICK.core.emissive.setHSL(0.5, 1, 0.75 + 0.25 * Math.sin(u.t * 6)); // white → cyan pulse
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
            if (d.pickup) { ev.pickup = true; u.passed = true; g.visible = false; } else { ev.hit = g; u.hit = true; }
            break;
          }
          if (u.hit || u.passed) break;
        }
      }
      if (!u.passed && !u.hit && !d.pickup && g.position.x + d.halfW < C.ROBOT_X - 0.6) { u.passed = true; ev.passed++; }
      if (g.position.x < C.DESPAWN_X || (d.pickup && u.passed)) { g.visible = false; this.active.splice(i, 1); this.pools[u.type].push(g); }
    }
    const type = this.spawner.tick(dt, speed, score, shields < C.SHIELDS_MAX && this.pools.pickup.length > 0);
    if (type) this.spawn(type);
  }
}
