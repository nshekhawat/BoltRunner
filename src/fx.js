// One pooled point-sprite particle system for sparks, confetti and steam. Zero allocation per frame.
import * as THREE from 'three';

export class Particles {
  constructor(scene, dotTexture, max = 400) {
    this.max = max; this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.grav = new Float32Array(max); this.head = 0;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ map: dotTexture, size: 0.22, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false; scene.add(this.points);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -100;
    this._c = new THREE.Color(); this.budget = 1; this.live = 0; // budget scales particle counts per quality tier
  }
  // Emit n particles at (x,y,z). colors: array of hex. speed: max initial speed. gravity: u/s². life: s.
  emit(x, y, z, n, colors, speed, gravity, life = 0.8, spread = 1) {
    n = Math.round(n * this.budget);
    for (let k = 0; k < n; k++) {
      const i = this.head; this.head = (this.head + 1) % this.max;
      const th = Math.random() * Math.PI * 2, ph = (Math.random() - 0.5) * Math.PI * spread, sp = speed * (0.4 + Math.random() * 0.6);
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(th) * Math.cos(ph) * sp; this.vel[i * 3 + 1] = Math.abs(Math.sin(ph)) * sp + speed * 0.3; this.vel[i * 3 + 2] = Math.sin(th) * Math.cos(ph) * sp;
      this._c.setHex(colors[(Math.random() * colors.length) | 0]); this.col[i * 3] = this._c.r; this.col[i * 3 + 1] = this._c.g; this.col[i * 3 + 2] = this._c.b;
      this.life[i] = life * (0.6 + Math.random() * 0.4); this.grav[i] = gravity;
    }
  }
  update(dt, scroll) {
    const p = this.pos, v = this.vel, c = this.col; let live = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue; live++;
      this.life[i] -= dt; if (this.life[i] <= 0) { p[i * 3 + 1] = -100; continue; }
      v[i * 3 + 1] += this.grav[i] * dt;
      p[i * 3] += (v[i * 3] - scroll) * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0.02) { p[i * 3 + 1] = 0.02; v[i * 3 + 1] *= -0.3; }
      const f = Math.min(1, this.life[i] * 3); c[i * 3] *= f > 0.99 ? 1 : 0.94; c[i * 3 + 1] *= f > 0.99 ? 1 : 0.94; c[i * 3 + 2] *= f > 0.99 ? 1 : 0.94;
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true; this.live = live;
  }
}
