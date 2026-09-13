import * as THREE from 'three';
import { CONFIG as C } from './config.js';
import { DEFS, canSpawn, gapTime, unlockedTypes, checkClearable, leadTime, REQUIRED_LEAD, MIN_GAP_TIME } from './spawn.js';

// Startup assertions: geometry and lead time must be provably fair, not eyeballed.
{
  const bad = checkClearable(); console.assert(bad.length === 0, 'Unclearable obstacles:', bad);
  for (const cap of Object.values(C.SPEED_CAP)) for (const [n, d] of Object.entries(DEFS))
    console.assert(leadTime(cap, d.speedMult ?? 1) >= REQUIRED_LEAD, `Lead time too short for ${n} at ${cap} u/s`);
}

const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
const cyl = (rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 14) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };
const cone = (r, h, mat, x, y, z = 0, seg = 7) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };

// Thick dark outline so silhouettes read against any sky, including night. Back-face scaled clone.
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x1a1020, side: THREE.BackSide });
function addOutline(group) {
  group.traverse(m => {
    if (!m.isMesh || m.userData.noOutline) return;
    const o = new THREE.Mesh(m.geometry, outlineMat); o.scale.setScalar(1.06); o.userData.noOutline = true; o.userData.outline = true; m.add(o);
  });
}

// Each builder returns a Group whose origin is on the ground at the obstacle's centre.
const BUILD = {
  rock_small: M => { const g = new THREE.Group(); g.add(cone(0.55, 1.1, M.rock, 0, 0.5, 0, 6), cone(0.3, 0.7, M.rock, 0.35, 0.3, 0.2, 5)); return g; },
  rock_tall: M => { const g = new THREE.Group(); g.add(cone(0.6, 1.9, M.rock, 0, 0.9, 0, 6), cone(0.35, 1.0, M.rock, -0.4, 0.45, 0.25, 5)); return g; },
  rock_cluster: M => { const g = new THREE.Group(); g.add(cone(0.5, 0.9, M.rock, -1.1, 0.4, 0, 6), cone(0.6, 1.4, M.rock, 0, 0.65, 0, 6), cone(0.5, 0.9, M.rock, 1.1, 0.4, 0.1, 5)); return g; },
  barrel: M => { const g = new THREE.Group(); const b = new THREE.Group(); b.add(cyl(0.45, 0.45, 1.3, M.barrel, 0, 0.65, 0, 16), cyl(0.47, 0.47, 0.08, M.barrelRim, 0, 0.3, 0, 16), cyl(0.47, 0.47, 0.08, M.barrelRim, 0, 1.0, 0, 16)); b.name = 'body'; g.add(b); return g; },
  fence: M => { const g = new THREE.Group(); for (const x of [-1.1, 0, 1.1]) g.add(box(0.16, 1.5, 0.16, M.wood, x, 0.75, 0)); g.add(box(2.6, 0.14, 0.08, M.wood, 0, 1.2, 0.1), box(2.6, 0.14, 0.08, M.wood, 0, 0.6, 0.1)); const b = box(0.9, 0.12, 0.08, M.wood, -0.6, 0.35, 0.12); b.rotation.z = 0.5; g.add(b); return g; },
  drone: (M, y) => { const g = new THREE.Group(); const body = new THREE.Group(); body.name = 'body'; body.position.y = y;
    body.add(box(0.9, 0.45, 0.6, M.drone), box(0.4, 0.2, 0.3, M.droneDark, -0.55, -0.05, 0), box(0.4, 0.2, 0.3, M.droneDark, 0.55, -0.05, 0));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), M.droneEye); eye.position.set(0, 0, 0.32); eye.userData.noOutline = true; body.add(eye);
    for (const x of [-0.55, 0.55]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.12), M.rotor); r.position.set(x, 0.12, 0); r.name = 'rotor'; r.userData.noOutline = true; body.add(r); }
    g.add(body); return g; },
  vent: M => { const g = new THREE.Group(); g.add(cyl(0.5, 0.6, 0.35, M.vent, 0, 0.17, 0, 12), cyl(0.3, 0.3, 0.12, M.droneDark, 0, 0.4, 0, 12));
    const steam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.45, 2.2, 10, 1, true), M.steam); steam.position.y = 1.4; steam.name = 'steam'; steam.userData.noOutline = true; steam.visible = false; g.add(steam); return g; },
  wheel: M => { const g = new THREE.Group(); const w = new THREE.Group(); w.name = 'body'; w.position.y = 0.7; w.rotation.x = Math.PI / 2;
    w.add(cyl(0.7, 0.7, 0.35, M.tyre, 0, 0, 0, 18), cyl(0.5, 0.5, 0.4, M.rim, 0, 0, 0, 8)); for (let i = 0; i < 4; i++) { const s = box(0.9, 0.08, 0.06, M.barrelRim); s.rotation.y = i * Math.PI / 4; w.add(s); } g.add(w); return g; },
  battery: M => { const g = new THREE.Group(); const b = new THREE.Group(); b.name = 'body'; b.position.y = 1.3;
    const body = box(0.45, 0.8, 0.45, M.battery); body.userData.noOutline = true; const cap = box(0.2, 0.12, 0.2, M.barrelRim, 0, 0.46, 0); const bolt = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.4), M.batteryBolt); bolt.position.z = 0.23; bolt.userData.noOutline = true;
    b.add(body, cap, bolt); g.add(b); return g; },
};
BUILD.drone_low = M => BUILD.drone(M, DEFS.drone_low.fly);
BUILD.drone_mid = M => BUILD.drone(M, DEFS.drone_mid.fly);
BUILD.drone_tall = M => { const g = BUILD.drone(M, DEFS.drone_tall.fly); const cage = box(0.5, 1.5, 0.5, M.droneDark, 0, DEFS.drone_tall.fly - 0.15, 0); g.add(cage); return g; }; // hanging cargo makes it too tall to hop

export class Obstacles {
  constructor(scene, mats, rng = Math.random) {
    this.scene = scene; this.rng = rng; this.pools = {}; this.active = [];
    this.hitboxScale = C.HITBOX_SCALE.kid;
    const dbgMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
    for (const type of Object.keys(DEFS)) {
      this.pools[type] = [];
      for (let i = 0; i < (DEFS[type].pickup ? 2 : C.POOL_PER_TYPE); i++) {
        const g = BUILD[type](mats); addOutline(g);
        g.userData = { type, def: DEFS[type], t: 0, passed: false, hit: false, tip: 0, dbg: [] };
        for (const b of DEFS[type].boxes) { const d = new THREE.Mesh(new THREE.BoxGeometry(b[2], b[3], 1), dbgMat); d.position.set(b[0], b[1], 0); d.visible = false; g.add(d); g.userData.dbg.push(d); }
        g.visible = false; scene.add(g); this.pools[type].push(g);
      }
    }
    this.reset();
  }
  reset() {
    for (const g of this.active) { g.visible = false; this.pools[g.userData.type].push(g); }
    this.active.length = 0; this.cooldown = 1.2; this.sinceBattery = 0; this.lastIntro = -1; this.count = 0; this.recent = [];
  }
  setDifficulty(mode) { this.hitboxScale = C.HITBOX_SCALE[mode]; }

  spawn(type) {
    const g = this.pools[type].pop(); if (!g) return null;
    const u = g.userData; u.t = 0; u.passed = false; u.hit = false; u.tip = 0;
    g.position.set(C.SPAWN_X, 0, 0); g.rotation.set(0, 0, 0); g.visible = true;
    if (type === 'barrel') g.getObjectByName('body').rotation.set(0, 0, 0);
    if (type === 'vent') g.getObjectByName('steam').visible = false;
    this.active.push(g); return g;
  }

  pickType(score) {
    const types = unlockedTypes(score);
    // Freshly unlocked types are favoured so each new obstacle gets introduced clearly; recent repeats are damped.
    const w = types.map(t => { const d = DEFS[t]; let x = 1; if (score - d.intro < 120 && d.intro > 0) x = 4; if (this.recent.includes(t)) x *= 0.35; if (t === 'rock_cluster' && score < 200) x *= 0.4; return x; });
    let r = this.rng() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < types.length; i++) { r -= w[i]; if (r <= 0) return types[i]; }
    return types[types.length - 1];
  }

  // Returns events: { passed: n, hit: obstacle|null, pickup: bool, clang: bool, hiss: bool, erupt: bool }
  update(dt, speed, score, shields, ev, robotBoxes) {
    ev.passed = 0; ev.hit = null; ev.pickup = false; ev.clang = false; ev.hiss = false; ev.erupt = false;
    const s = this.hitboxScale;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const g = this.active[i], u = g.userData, d = u.def;
      u.t += dt;
      g.position.x -= speed * (d.speedMult ?? 1) * dt;
      // Per-type animation
      if (d.fly !== undefined) { const b = g.getObjectByName('body'); b.position.y = d.fly + Math.sin(u.t * 5) * 0.08; for (const r of b.children) if (r.name === 'rotor') r.rotation.y += dt * 40; }
      if (u.type === 'wheel') g.getObjectByName('body').rotation.z -= speed * d.speedMult * dt / 0.7;
      if (u.type === 'battery') { const b = g.getObjectByName('body'); b.position.y = 1.3 + Math.sin(u.t * 3) * 0.12; b.rotation.y += dt * 2; }
      if (u.type === 'barrel' && u.tip > 0) { u.tip += dt; const b = g.getObjectByName('body'); b.rotation.z = Math.min(1.45, u.tip * 5) * (u.tip < 0.3 ? 1 : 1); b.position.x = Math.min(0.55, u.tip * 2); }
      let dangerous = !d.pickup;
      if (u.type === 'vent') { // telegraph: hiss when ~1.5 s away, erupt when ~0.9 s away, stay up until passed
        const tt = (g.position.x - C.ROBOT_X) / speed; const steam = g.getObjectByName('steam');
        const phase = tt <= 0.9 ? 2 : tt <= 0.9 + C.VENT_TELEGRAPH ? 1 : 0;
        if (phase === 1 && u.phase !== 1) ev.hiss = true; if (phase === 2 && u.phase !== 2) ev.erupt = true; u.phase = phase;
        steam.visible = phase === 2; if (phase === 2) { steam.scale.y = Math.min(1, steam.scale.y + dt * 6); steam.rotation.y += dt * 3; } else steam.scale.y = 0.05;
        dangerous = phase === 2;
      }
      if (C.DEBUG_HITBOXES) for (const m of u.dbg) { m.visible = true; m.scale.set(s, s, 1); } else for (const m of u.dbg) m.visible = false;
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
      const halfW = Math.max(...d.boxes.map(b => b[0] + b[2] / 2));
      if (!u.passed && !u.hit && !d.pickup && g.position.x + halfW < C.ROBOT_X - 0.6) { u.passed = true; ev.passed++; if (u.type === 'barrel') { u.tip = 0.001; ev.clang = true; } }
      if (g.position.x < C.DESPAWN_X || (d.pickup && u.passed)) { g.visible = false; this.active.splice(i, 1); this.pools[u.type].push(g); }
    }
    // Spawning
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      const last = this.lastSpawned && this.lastSpawned.visible ? this.lastSpawned : null;
      const prev = last ? { x: last.position.x, mult: last.userData.def.speedMult ?? 1, action: last.userData.def.action } : null;
      let type = (this.sinceBattery >= C.BATTERY_EVERY && shields < C.SHIELDS_MAX && this.pools.battery.length) ? 'battery' : this.pickType(score);
      if (canSpawn(type, prev, speed)) {
        const g = this.spawn(type);
        if (g) {
          this.lastSpawned = g; this.count++;
          if (type === 'battery') this.sinceBattery = 0; else { this.sinceBattery++; this.recent.push(type); if (this.recent.length > 2) this.recent.shift(); }
          this.cooldown = gapTime(this.rng(), speed) - MIN_GAP_TIME; // canSpawn enforces the minimum; this is the random extra
        }
      }
    }
  }
}
