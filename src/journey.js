// Journey mode: a new biome every DAY_CYCLE_POINTS. The next biome is built on idle time during the current segment; the robot then
// runs through a gateway of light (a tube enclosing camera and lane for ~1.5 s) and the world swaps while the view is enclosed.
import * as THREE from 'three';
import { CONFIG as C } from './config.js';
import { BIOME_IDS } from './biomes/registry.js';
import { canSpawn } from './spawn.js';

const PREP_LEAD = 0.55;   // fraction of a segment before the switch at which the next biome starts building
const GATE_SECONDS = 1.5; // time the camera spends inside the gateway
const R = 15;             // tube radius: encloses camera (z ≈ 9.5) and lane

export class Journey {
  constructor(scene, shared) {
    this.scene = scene; this.active = false; this.state = 'idle'; this.frameMax = 0; this.overruns = 0;
    this.colorA = new THREE.Color(); this.colorB = new THREE.Color();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 1, 32, 1, false), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, color: 0xffffff })); // capped: fully encloses camera + lane
    tube.rotation.z = Math.PI / 2;
    const streakTex = shared.textures.streak.clone(); streakTex.repeat.set(24, 1); streakTex.needsUpdate = true;
    const streaks = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.3, R - 0.3, 1, 32, 1, true), new THREE.MeshBasicMaterial({ map: streakTex, side: THREE.BackSide, fog: false, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    streaks.rotation.z = Math.PI / 2; this.streakTex = streakTex;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 2 * R), new THREE.MeshBasicMaterial({ color: 0x101020, fog: false })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02;
    const ringGeo = new THREE.TorusGeometry(R - 0.5, 0.6, 8, 40), ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    this.rings = [-0.5, 0.5].map(k => { const m = new THREE.Mesh(ringGeo, ringMat); m.rotation.y = Math.PI / 2; m.userData.k = k; return m; });
    this.gate = new THREE.Group(); this.gate.add(tube, streaks, floor, ...this.rings); this.gate.position.set(0, 4, 2); this.gate.visible = false; this.tube = tube; this.floor = floor;
    scene.add(this.gate);
  }
  begin(startId) { this.active = true; this.transitionsDone = 0; this.idx = BIOME_IDS.indexOf(startId); this.nextAt = C.DAY_CYCLE_POINTS; this.pending = null; this.state = 'run'; this.frameMax = 0; this.overruns = 0; }
  end(hooks) { this.active = false; this.gate.visible = false; if (this.state !== 'run' && this.state !== 'idle') hooks?.hold(false); this.state = 'idle'; if (this.pending?.inst) hooks?.discard(this.pending); this.pending = null; }
  get nextId() { return BIOME_IDS[(this.idx + 1) % BIOME_IDS.length]; }

  // hooks: prepare(id) → Promise<pending>, swap(pending), discard(pending), hold(bool, exitX), accent(id) → hex
  update(dt, score, speed, hooks) {
    if (!this.active) return;
    if (this.state === 'run') {
      if (!this.pending && score >= this.nextAt - C.DAY_CYCLE_POINTS * PREP_LEAD) { const p = { building: true }; this.pending = p; hooks.prepare(this.nextId).then(r => { Object.assign(p, r); p.building = false; }); }
      // Spawn the gateway so its centre reaches the camera as the score crosses nextAt; respect the gap after the last obstacle.
      const len = Math.max(20, speed * GATE_SECONDS), lead = C.SPAWN_X + len / 2;
      if (score >= this.nextAt - lead * C.POINTS_PER_UNIT && canSpawn('small', hooks.last(), speed)) {
        this.len = len; this.gate.scale.x = len; this.gate.position.x = C.SPAWN_X + len / 2; this.gate.visible = true; this.state = 'gate'; this.swapped = false; this.t = 0;
        this.colorA.setHex(hooks.accent(BIOME_IDS[this.idx])); this.colorB.setHex(hooks.accent(this.nextId)); hooks.hold(true);
        this.rings.forEach(r => r.position.x = r.userData.k); // ring at each mouth (scaled with the group)
      }
    } else if (this.state === 'gate') {
      this.t += dt; this.gate.position.x -= speed * dt; this.streakTex.offset.x -= dt * 1.5;
      const camX = -3.5, entrance = this.gate.position.x - this.len / 2, exit = this.gate.position.x + this.len / 2;
      const inside = THREE.MathUtils.clamp((camX - entrance) / this.len, 0, 1);
      this.tube.material.color.lerpColors(this.colorA, this.colorB, inside).multiplyScalar(0.5 + 0.5 * Math.sin(inside * Math.PI)); // brightest mid-tunnel
      this.rings[0].material.color.copy(this.tube.material.color);
      if (!this.swapped && inside >= 0.45 && this.pending && !this.pending.building) { const t0 = performance.now(); hooks.swap(this.pending); this.swapMs = +(performance.now() - t0).toFixed(1); this.pending = null; this.swapped = true; this.transitionsDone = (this.transitionsDone ?? 0) + 1; this.idx = (this.idx + 1) % BIOME_IDS.length; this.nextAt += C.DAY_CYCLE_POINTS; }
      if (exit < C.ROBOT_X - 2) { this.gate.visible = false; this.state = 'run'; hooks.hold(false, exit); if (!this.swapped) this.nextAt = score + 200; } // build was too slow: try again shortly
    }
  }
  // Frame-time assertion during the transition (called every frame with the raw dt).
  frame(rawDt, cpuMs) { if (this.state !== 'gate') return; const ms = rawDt * 1000; this.frameMax = Math.max(this.frameMax, ms); if (ms > 20) { this.overruns++; (this.log ??= []).push({ ms: +ms.toFixed(1), cpu: +cpuMs.toFixed(1), t: +this.t.toFixed(2), swapped: this.swapped, swapMs: this.swapMs }); console.assert(false, `Journey transition frame took ${ms.toFixed(1)} ms (> 20 ms)`); } }
}
