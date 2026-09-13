// Ground, parallax mesas, sky dome, clouds, light shafts, dust, and the day/night cycle.
import * as THREE from 'three';
import { CONFIG as C } from './config.js';

const PHASES = [
  { name: 'day',    top: 0x1e5fc8, horizon: 0x8fbde8, fog: 0xd2c0a4, sun: 0xfff0d0, sunI: 2.0, hemiSky: 0xbfdfff, hemiGround: 0xc9915a, hemiI: 0.55, env: 0.6, elev: 0.8,  stars: 0,   shafts: 0.45, eyeLight: 0,  trail: 0.8, cloud: 0xffffff },
  { name: 'sunset', top: 0x3a2f7a, horizon: 0xf08a50, fog: 0xd89468, sun: 0xffb070, sunI: 1.6, hemiSky: 0x9070c0, hemiGround: 0xa06040, hemiI: 0.45, env: 0.45, elev: 0.12, stars: 0.2, shafts: 0.7,  eyeLight: 2,  trail: 1.0, cloud: 0xffb890 },
  { name: 'night',  top: 0x050818, horizon: 0x18244e, fog: 0x121a36, sun: 0x8fa8ff, sunI: 0.5, hemiSky: 0x2a3a70, hemiGround: 0x101020, hemiI: 0.3, env: 0.12, elev: -0.35, stars: 1, shafts: 0,   eyeLight: 14, trail: 1.6, cloud: 0x1e2a50 },
  { name: 'dawn',   top: 0x6a76b8, horizon: 0xf0b890, fog: 0xd8b49c, sun: 0xffd0a0, sunI: 1.5, hemiSky: 0xb0b8ff, hemiGround: 0xa07050, hemiI: 0.45, env: 0.45, elev: 0.15, stars: 0.1, shafts: 0.9,  eyeLight: 3,  trail: 1.0, cloud: 0xffd0b8 },
];
const COLOR_KEYS = ['top', 'horizon', 'fog', 'sun', 'hemiSky', 'hemiGround', 'cloud'], NUM_KEYS = ['sunI', 'hemiI', 'env', 'elev', 'stars', 'shafts', 'eyeLight', 'trail'];
const toState = p => { const s = {}; for (const k of COLOR_KEYS) s[k] = new THREE.Color(p[k]); for (const k of NUM_KEYS) s[k] = p[k]; return s; };

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FRAG = `uniform vec3 top, horizon, sunColor, sunDir; uniform float stars; varying vec3 vDir;
void main(){
  float h = clamp(vDir.y, 0.0, 1.0); vec3 col = mix(horizon, top, pow(h, 0.55));
  float s = max(dot(vDir, sunDir), 0.0); col += sunColor * (pow(s, 700.0) * 3.0 + pow(s, 6.0) * 0.18);
  vec3 moonDir = normalize(vec3(-sunDir.x, -sunDir.y * 0.6 + 0.5, sunDir.z)); float m = max(dot(vDir, moonDir), 0.0);
  col += vec3(0.9, 0.92, 1.0) * (pow(m, 1200.0) * 2.5 + pow(m, 40.0) * 0.08) * stars;
  vec3 f = floor(vDir * 160.0); float r = fract(sin(dot(f, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  col += vec3(step(0.993, r) * stars * smoothstep(0.02, 0.25, vDir.y) * 0.9);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class World {
  constructor(scene, mats, camera) {
    this.scene = scene; this.camera = camera; this.T = mats.textures; this.speed = 0;
    scene.fog = new THREE.Fog(0xd8c9a8, 60, 170);
    // Lights
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.6); this.sun.position.set(12, 18, 10); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.02;
    Object.assign(this.sun.shadow.camera, { left: -12, right: 40, top: 14, bottom: -6, near: 1, far: 80 });
    this.hemi = new THREE.HemisphereLight(0xbfdfff, 0xc9915a, 1.0);
    this.eyeLight = new THREE.PointLight(0x40e8ff, 0, 18, 1.5); this.eyeLight.position.set(0.3, 1.7, 0.5);
    scene.add(this.sun, this.sun.target, this.hemi, this.eyeLight);
    // Sky dome
    this.skyU = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, stars: { value: 0 } };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(240, 32, 16), new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }));
    scene.add(this.sky);
    // Ground + tyre tracks
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 120), mats.ground); this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true; scene.add(this.ground);
    this.tracks = new THREE.Mesh(new THREE.PlaneGeometry(400, 1.6), mats.tracks); this.tracks.rotation.x = -Math.PI / 2; this.tracks.position.set(0, 0.012, 0.25); scene.add(this.tracks);
    // Parallax mesas: three layers, each two copies of a strip so it wraps seamlessly.
    this.layers = [[-42, 0.3, 0.7], [-75, 0.15, 1.4], [-120, 0.07, 2.4]].map(([z, par, hs], i) => {
      const strip = this.makeMesaStrip(mats.mesa[i], 180, hs, i * 17 + 3);
      const a = strip, b = strip.clone(); a.position.set(-20, 0, z); b.position.set(160, 0, z); scene.add(a, b);
      return { a, b, par, len: 180 };
    });
    // Clouds
    this.clouds = []; const cg = new THREE.PlaneGeometry(34, 13); this.cloudMat = new THREE.MeshBasicMaterial({ map: this.T.cloud, transparent: true, depthWrite: false, opacity: 0.85, fog: true });
    for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(cg, this.cloudMat); m.position.set(-100 + i * 26 + (i % 3) * 7, 24 + (i % 4) * 5, -80 - (i % 3) * 18); m.scale.setScalar(0.8 + (i % 3) * 0.3); scene.add(m); this.clouds.push(m); }
    // Light shafts: cheap additive planes
    this.shafts = []; const sg = new THREE.PlaneGeometry(7, 46);
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: this.T.shaft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.2, fog: false })); m.position.set(-30 + i * 24, 18, -22 - (i % 2) * 8); m.rotation.z = 0.32; scene.add(m); this.shafts.push(m); }
    // Dust motes
    this.dustN = 160; const dp = new Float32Array(this.dustN * 3); this.dustSeed = new Float32Array(this.dustN);
    for (let i = 0; i < this.dustN; i++) { dp[i * 3] = -10 + Math.random() * 40; dp[i * 3 + 1] = Math.random() * 8; dp[i * 3 + 2] = -8 + Math.random() * 16; this.dustSeed[i] = Math.random() * 6.28; }
    const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ map: this.T.dot, size: 0.09, transparent: true, opacity: 0.5, depthWrite: false, color: 0xfff2d0 })); this.dust.frustumCulled = false; scene.add(this.dust);
    // Day/night state
    this.phase = 0; this.phaseOffset = 0; this.cur = toState(PHASES[0]); this.from = toState(PHASES[0]); this.to = toState(PHASES[0]); this.blend = 1; this.time = 0;
    this.applyState();
  }

  makeMesaStrip(mat, len, hs, seed) {
    const g = new THREE.Group(); let x = 0, s = seed;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    while (x < len - 10) {
      const w = 10 + rnd() * 22, h = (4 + rnd() * 9) * hs, top = w * (0.4 + rnd() * 0.3);
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(w, 0); shape.lineTo(w - (w - top) / 2, h); shape.lineTo((w - top) / 2, h); shape.lineTo(0, 0);
      const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 6 + hs * 4, bevelEnabled: false }), mat); m.position.set(x, 0, 0); m.receiveShadow = false; g.add(m);
      x += w + rnd() * 8;
    }
    return g;
  }

  setPhase(i) {
    i = ((i % PHASES.length) + PHASES.length) % PHASES.length; if (i === this.phase) return;
    this.phase = i; for (const k of COLOR_KEYS) this.from[k].copy(this.cur[k]); for (const k of NUM_KEYS) this.from[k] = this.cur[k];
    this.to = toState(PHASES[i]); this.blend = 0;
  }
  get phaseName() { return PHASES[this.phase].name; }

  applyState() {
    const s = this.cur, u = this.skyU;
    u.top.value.copy(s.top); u.horizon.value.copy(s.horizon); u.sunColor.value.copy(s.sun); u.stars.value = s.stars;
    u.sunDir.value.set(0.55, Math.sin(s.elev), -Math.cos(s.elev) * 0.6).normalize();
    this.scene.fog.color.copy(s.fog); this.scene.background = null;
    this.sun.color.copy(s.sun); this.sun.intensity = s.sunI; this.hemi.color.copy(s.hemiSky); this.hemi.groundColor.copy(s.hemiGround); this.hemi.intensity = s.hemiI;
    this.scene.environmentIntensity = s.env; this.eyeLight.intensity = s.eyeLight;
    for (const m of this.shafts) m.material.opacity = 0.22 * s.shafts;
    this.cloudMat.color.copy(s.cloud);
    this.trailBright = s.trail;
  }

  // score drives the day cycle; speed drives scrolling.
  update(dt, speed, score) {
    this.time += dt; this.speed = speed;
    this.setPhase(Math.floor(score / C.DAY_CYCLE_POINTS) + this.phaseOffset);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / C.DAY_LERP_TIME); const t = this.blend * this.blend * (3 - 2 * this.blend);
      for (const k of COLOR_KEYS) this.cur[k].lerpColors(this.from[k], this.to[k], t); for (const k of NUM_KEYS) this.cur[k] = THREE.MathUtils.lerp(this.from[k], this.to[k], t);
      this.applyState();
    }
    const T = this.T; const dx = speed * dt;
    T.sandMap.offset.x += dx / 10; T.sandRough.offset.x = T.sandNormal.offset.x = T.sandMap.offset.x; T.tracks.offset.x += dx / 10;
    for (const L of this.layers) for (const m of [L.a, L.b]) { m.position.x -= dx * L.par; if (m.position.x < -20 - L.len) m.position.x += 2 * L.len; }
    for (const c of this.clouds) { c.position.x -= (dx * 0.05 + dt * 0.6); if (c.position.x < -140) c.position.x += 260; }
    for (const s of this.shafts) { s.position.x -= dx * 0.5; if (s.position.x < -50) s.position.x += 120; }
    const p = this.dust.geometry.attributes.position.array;
    for (let i = 0; i < this.dustN; i++) { p[i * 3] -= dx * 0.9 + dt * 0.4; p[i * 3 + 1] += Math.sin(this.time * 1.3 + this.dustSeed[i]) * dt * 0.3; if (p[i * 3] < -12) p[i * 3] += 42; }
    this.dust.geometry.attributes.position.needsUpdate = true;
    this.sky.position.copy(this.camera.position);
  }
}
