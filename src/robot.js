// Procedural robot: chunky, friendly, ~1.8 u tall. Hierarchy of Groups, no bones, sine-driven animation.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIG as C } from './config.js';
import { DUCK_HEIGHT } from './spawn.js';

const rbox = (w, h, d, mat, x = 0, y = 0, z = 0, r = 0.06) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const sphere = (r, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const TRAIL_N = 28;

export class Robot {
  constructor(mats) {
    const M = mats, g = this.group = new THREE.Group();
    this.rig = new THREE.Group(); g.add(this.rig); // scaled for duck/squash, rotated for lean
    g.rotation.y = Math.PI / 2 - C.ROBOT_TURN; // faces +x (travel) turned slightly toward the camera
    // Legs (hip at y 0.72, upper 0.36, lower 0.3, foot 0.08)
    this.legs = [-0.2, 0.2].map(x => {
      const hip = new THREE.Group(); hip.position.set(x, 0.72, 0);
      hip.add(rbox(0.24, 0.38, 0.24, M.robotDark, 0, -0.17, 0));
      const knee = new THREE.Group(); knee.position.y = -0.36; knee.add(rbox(0.22, 0.32, 0.22, M.robotMetal, 0, -0.14, 0));
      const foot = rbox(0.28, 0.12, 0.42, M.robotAccent, 0, -0.32, 0.06, 0.05); knee.add(foot);
      hip.add(knee); hip.userData.knee = knee; hip.userData.foot = foot; this.rig.add(hip); return hip;
    });
    // Torso
    this.torso = new THREE.Group(); this.torso.position.y = 0.72; this.rig.add(this.torso);
    this.torso.add(rbox(0.72, 0.68, 0.52, M.robotMetal, 0, 0.36, 0, 0.12));
    this.torso.add(rbox(0.5, 0.3, 0.06, M.robotAccent, 0, 0.4, 0.26, 0.03));
    this.chest = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), M.robotEye); this.chest.position.set(0, 0.4, 0.295); this.torso.add(this.chest);
    // Arms
    this.arms = [-0.42, 0.42].map(x => {
      const sh = new THREE.Group(); sh.position.set(x, 0.62, 0); sh.add(sphere(0.1, M.robotDark));
      sh.add(rbox(0.16, 0.3, 0.16, M.robotMetal, 0, -0.17, 0));
      const el = new THREE.Group(); el.position.y = -0.32; el.add(rbox(0.14, 0.26, 0.14, M.robotAccent, 0, -0.12, 0), sphere(0.09, M.robotDark, 0, -0.28, 0));
      sh.add(el); sh.userData.elbow = el; this.torso.add(sh); return sh;
    });
    // Head
    this.head = new THREE.Group(); this.head.position.y = 0.74; this.torso.add(this.head);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.robotMetal); dome.position.y = 0.12; dome.castShadow = true;
    this.head.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.24, 24), M.robotMetal), dome, rbox(0.62, 0.1, 0.62, M.robotDark, 0, -0.1, 0, 0.04));
    this.eyes = [-0.12, 0.12].map(x => { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 16), M.robotEye); e.rotation.x = Math.PI / 2; e.position.set(x, 0.05, 0.29); this.head.add(e); return e; });
    this.antenna = new THREE.Group(); this.antenna.position.y = 0.4; this.head.add(this.antenna);
    this.antenna.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), M.robotDark).translateY(0.15));
    this.ball = sphere(0.06, M.robotEye, 0, 0.32, 0); this.antenna.add(this.ball);
    // Foot trail: additive ribbon of the last TRAIL_N foot positions, alpha fading along its length.
    const geo = new THREE.BufferGeometry();
    this.trailPos = new Float32Array(TRAIL_N * 2 * 3); this.trailCol = new Float32Array(TRAIL_N * 2 * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 4));
    const idx = []; for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(idx);
    this.trail = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.trail.frustumCulled = false; this.trailPts = Array.from({ length: TRAIL_N }, () => ({ x: 0, y: 0.06 })); this.trailColor = new THREE.Color(0x40e8ff); this.trailBright = 1;
    this._boxes = [{}, {}, {}]; this.time = 0; this.phase = 0; this.blink = 2; this.blinkT = 0; this.glance = 0; this.squash = 0; this.stumble = 0; this.wasGrounded = true; this.prevSin = 0;
    this._tmp = new THREE.Vector3();
  }

  boxes(y, ducking, scale) {
    const b = this._boxes, x = C.ROBOT_X;
    if (ducking) { Object.assign(b[0], { cx: x, cy: y + 0.55, w: 0.9 * scale, h: 0.45 * scale }); Object.assign(b[1], { cx: x, cy: y + 0.2, w: 0.7 * scale, h: 0.4 * scale }); Object.assign(b[2], { cx: x, cy: y + DUCK_HEIGHT - 0.15, w: 0.6 * scale, h: 0.3 * scale }); }
    else { Object.assign(b[0], { cx: x, cy: y + 1.06, w: 0.72 * scale, h: 0.68 * scale }); Object.assign(b[1], { cx: x, cy: y + 0.36, w: 0.5 * scale, h: 0.72 * scale }); Object.assign(b[2], { cx: x, cy: y + 1.62, w: 0.6 * scale, h: 0.42 * scale }); }
    return b;
  }

  // s: { mode: idle|run|jump|duck|stumble, y, vy, speed, hitFlash, grounded }. Returns true on a footstep.
  update(dt, s) {
    this.time += dt; let step = false;
    const norm = Math.min(1, (s.speed - C.SPEED_START) / (C.SPEED_CAP.normal - C.SPEED_START));
    const rig = this.rig, torso = this.torso, head = this.head;
    this.group.position.y = s.y;
    if (s.grounded && !this.wasGrounded) this.squash = 0.12; this.wasGrounded = s.grounded;
    this.squash = Math.max(0, this.squash - dt); this.stumble = Math.max(0, this.stumble - dt);
    if (s.hitFlash > 0 && this.stumble === 0 && s.mode !== 'stumble' && !this._stumbled) { this.stumble = 0.35; }
    this._stumbled = s.hitFlash > 0;
    let sy = 1, sx = 1, lean = 0, bob = 0;
    if (s.mode === 'run' || s.mode === 'duck') {
      const rate = 2.2 + s.speed * 0.08; this.phase += dt * rate * Math.PI * 2;
      const sn = Math.sin(this.phase), cs = Math.cos(this.phase);
      if ((this.prevSin > 0) !== (sn > 0)) step = true; this.prevSin = sn;
      this.legs.forEach((hip, i) => { const k = i ? -1 : 1; hip.rotation.x = sn * k * 0.85; hip.userData.knee.rotation.x = Math.max(0, cs * k) * 1.3 + 0.15; });
      this.arms.forEach((sh, i) => { const k = i ? 1 : -1; sh.rotation.x = sn * k * 0.7; sh.rotation.z = 0; sh.userData.elbow.rotation.x = -0.9; });
      bob = Math.abs(cs) * 0.07; lean = 0.1 + 0.28 * norm;
      this.antenna.rotation.x = -(0.3 + 0.2 * norm + sn * 0.08);
      if (s.mode === 'duck') { sy = 0.55; sx = 1.15; lean += 0.25; }
    } else if (s.mode === 'jump') {
      const tuck = Math.min(1, s.airtime * 8);
      this.legs.forEach((hip, i) => { hip.rotation.x = THREE.MathUtils.lerp(hip.rotation.x, -0.9 - i * 0.2, tuck * 0.3); hip.userData.knee.rotation.x = THREE.MathUtils.lerp(hip.userData.knee.rotation.x, 1.5, tuck * 0.3); });
      this.arms.forEach((sh, i) => { const k = i ? 1 : -1; sh.rotation.x = THREE.MathUtils.lerp(sh.rotation.x, -0.4, 0.2); sh.rotation.z = THREE.MathUtils.lerp(sh.rotation.z, k * 1.4, 0.2); sh.userData.elbow.rotation.x = -0.3; });
      lean = 0.12 + Math.max(-0.25, Math.min(0.35, s.vy * 0.015)); this.antenna.rotation.x = -(0.6 + Math.max(-0.3, s.vy * 0.03));
    } else if (s.mode === 'stumble') {
      lean = THREE.MathUtils.lerp(rig.rotation.x, 1.35, dt * 4); sy = THREE.MathUtils.lerp(rig.scale.y, 0.9, dt * 3);
      this.legs.forEach(h => { h.rotation.x = THREE.MathUtils.lerp(h.rotation.x, -0.4, dt * 4); h.userData.knee.rotation.x = 0.4; });
      this.arms.forEach((sh, i) => { sh.rotation.x = THREE.MathUtils.lerp(sh.rotation.x, -1.2, dt * 4); sh.rotation.z = (i ? 1 : -1) * 0.6; });
      this.antenna.rotation.x = THREE.MathUtils.lerp(this.antenna.rotation.x, 0.6, dt * 3);
    } else { // idle: breathe, blink, glance at camera
      this.phase = 0; this.legs.forEach(h => { h.rotation.x = 0; h.userData.knee.rotation.x = 0.05; });
      this.arms.forEach(sh => { sh.rotation.x = 0; sh.rotation.z = 0; sh.userData.elbow.rotation.x = -0.25 + Math.sin(this.time * 2) * 0.05; });
      sy = 1 + Math.sin(this.time * 2) * 0.015; bob = 0; lean = 0; this.antenna.rotation.x = Math.sin(this.time * 1.5) * 0.15;
      this.glance = (Math.sin(this.time * 0.5) > 0.7) ? THREE.MathUtils.lerp(this.glance, 0.7, dt * 4) : THREE.MathUtils.lerp(this.glance, 0, dt * 4);
    }
    if (this.stumble > 0) { lean += Math.sin(this.stumble * 40) * 0.25; bob -= 0.05; }
    if (this.squash > 0) { const q = this.squash / 0.12; sy *= 1 - 0.22 * q; sx *= 1 + 0.15 * q; }
    rig.scale.set(sx, sy, sx); rig.rotation.x = lean; torso.position.y = 0.72 + bob;
    head.rotation.y = s.mode === 'idle' ? -this.glance : THREE.MathUtils.lerp(head.rotation.y, 0, dt * 6); // glance toward the camera
    head.rotation.x = s.mode === 'run' ? -0.05 : 0;
    this.ball.position.z = Math.sin(-this.antenna.rotation.x) * 0.1;
    // Blink (also while running: robots blink too)
    this.blink -= dt; if (this.blink <= 0) { this.blinkT = 0.14; this.blink = 2.5 + Math.random() * 3; }
    this.blinkT = Math.max(0, this.blinkT - dt); const eyeS = this.blinkT > 0 ? 0.15 : 1; this.eyes.forEach(e => e.scale.set(1, 1, eyeS));
    // Hit flash: red-orange emissive strobe
    const flashing = s.hitFlash > 0 && Math.floor(s.hitFlash * 24) % 2 === 0;
    const M = this.torso.children[0].material; M.emissive.setHex(flashing ? 0xff5a1a : 0x000000); M.emissiveIntensity = flashing ? 1.2 : 0;
    this.updateTrail(dt, s);
    return step;
  }

  updateTrail(dt, s) {
    const pts = this.trailPts, moving = s.speed > 0.5;
    for (const p of pts) p.x -= s.speed * dt;
    // Push the current back-foot position at the head of the ribbon.
    const foot = this.legs[0].userData.foot; foot.getWorldPosition(this._tmp);
    pts.pop(); pts.unshift({ x: this._tmp.x, y: Math.max(0.05, this._tmp.y) });
    const col = this.trailColor, on = (moving ? 1 : 0) * this.trailBright;
    for (let i = 0; i < TRAIL_N; i++) {
      const a = (1 - i / TRAIL_N) ** 2 * on * 0.55, w = 0.03 + 0.07 * (i / TRAIL_N), p = pts[i], o = i * 6, c = i * 8;
      this.trailPos[o] = p.x; this.trailPos[o + 1] = p.y + w; this.trailPos[o + 2] = 0; this.trailPos[o + 3] = p.x; this.trailPos[o + 4] = Math.max(0.02, p.y - w); this.trailPos[o + 5] = 0;
      for (const k of [0, 4]) { this.trailCol[c + k] = col.r; this.trailCol[c + k + 1] = col.g; this.trailCol[c + k + 2] = col.b; this.trailCol[c + k + 3] = a; }
    }
    this.trail.geometry.attributes.position.needsUpdate = true; this.trail.geometry.attributes.color.needsUpdate = true;
  }
}
