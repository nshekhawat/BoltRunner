// Generic environment engine: lights, sky dome, clouds, light shafts, day/night blending, scrolling.
// Everything biome-specific (ground, parallax, props, ambient particles, presets) comes from a biome instance via setBiome().
import * as THREE from 'three';
import { CONFIG as C } from './config.js';
import { PHASE } from './biomes/schema.js';
import { HC, injectHC } from './textures.js';

const COLOR_KEYS = ['top', 'horizon', 'fog', 'sun', 'hemiSky', 'hemiGround', 'cloud'], NUM_KEYS = [...Object.keys(PHASE).filter(k => !COLOR_KEYS.includes(k)), 'aurora']; // aurora is optional in presets (default 0)
const toState = p => { const s = {}; for (const k of COLOR_KEYS) s[k] = new THREE.Color(p[k]); for (const k of NUM_KEYS) s[k] = p[k] ?? 0; return s; }; // also clones a state

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FRAG = `uniform vec3 top, horizon, sunColor, sunDir; uniform float stars, aurora, time, uDesat; varying vec3 vDir;
void main(){
  float h = clamp(vDir.y, 0.0, 1.0); vec3 col = mix(horizon, top, pow(h, 0.55));
  float s = max(dot(vDir, sunDir), 0.0); col += sunColor * (pow(s, 700.0) * 3.0 + pow(s, 6.0) * 0.18);
  vec3 moonDir = normalize(vec3(-sunDir.x, -sunDir.y * 0.6 + 0.5, sunDir.z)); float m = max(dot(vDir, moonDir), 0.0);
  col += vec3(0.9, 0.92, 1.0) * (pow(m, 1200.0) * 2.5 + pow(m, 40.0) * 0.08) * stars;
  vec3 f = floor(vDir * 160.0); float r = fract(sin(dot(f, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  col += vec3(step(0.993, r) * stars * smoothstep(0.02, 0.25, vDir.y) * 0.9);
  if (aurora > 0.0) { // curtains: two drifting sine bands, green fading to violet, only high in the sky
    float band = sin(vDir.x * 7.0 + time * 0.25 + sin(vDir.z * 5.0 + time * 0.17) * 1.8) * 0.5 + 0.5;
    float band2 = sin(vDir.x * 4.0 - time * 0.19 + vDir.z * 3.0) * 0.5 + 0.5;
    float a = smoothstep(0.03, 0.18, vDir.y) * smoothstep(0.95, 0.5, vDir.y) * (pow(band, 4.0) * 0.7 + pow(band2, 6.0) * 0.5);
    col += mix(vec3(0.2, 1.0, 0.55), vec3(0.65, 0.3, 1.0), 0.5 + 0.5 * sin(vDir.x * 3.0 + time * 0.1)) * a * aurora * 1.3;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114))), uDesat);
}`;

export class World {
  constructor(scene, shared, camera) {
    this.scene = scene; this.camera = camera; this.T = shared.textures; this.speed = 0; this.biome = null;
    scene.fog = new THREE.FogExp2(0xd8c9a8, 0.0075);
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.6); this.sun.position.set(12, 18, 10); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.02;
    Object.assign(this.sun.shadow.camera, { left: -12, right: 40, top: 14, bottom: -6, near: 1, far: 80 });
    this.hemi = new THREE.HemisphereLight(0xbfdfff, 0xc9915a, 1.0);
    this.eyeLight = new THREE.PointLight(0x40e8ff, 0, 18, 1.5); this.eyeLight.position.set(0.3, 1.7, 0.5);
    scene.add(this.sun, this.sun.target, this.hemi, this.eyeLight);
    // Shadow sentinel. three's shared depth material copies `map` from each caster but only refreshes its uniform when the caster HAS a map,
    // so after a biome switch the first map-less caster re-uploads the previous biome's (already disposed) texture: one leaked GL texture
    // per switch. A permanent, invisible caster with a permanent map, rendered first, keeps that uniform pointing at something alive.
    this.sentinel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshStandardMaterial({ map: this.T.metalMap })); this.sentinel.castShadow = true; this.sentinel.position.set(0, -2, 0); this.sentinel.matrixAutoUpdate = false; this.sentinel.updateMatrix();
    scene.add(this.sentinel); scene.children.unshift(scene.children.pop());
    this.skyU = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, stars: { value: 0 }, aurora: { value: 0 }, time: { value: 0 }, uDesat: HC.desat };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(240, 32, 16), new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }));
    scene.add(this.sky);
    // Clouds: one InstancedMesh (one draw call for all nine); x scrolls per instance in a typed array.
    const N_CLOUD = 9; this.cloudMat = injectHC(new THREE.MeshBasicMaterial({ map: this.T.cloud, transparent: true, depthWrite: false, opacity: 0.85, fog: true }));
    this.clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(34, 13), this.cloudMat, N_CLOUD); this.clouds.frustumCulled = false; this.cloudX = new Float32Array(N_CLOUD); this.cloudY = new Float32Array(N_CLOUD); this.cloudZ = new Float32Array(N_CLOUD); this.cloudS = new Float32Array(N_CLOUD);
    for (let i = 0; i < N_CLOUD; i++) { this.cloudX[i] = -100 + i * 26 + (i % 3) * 7; this.cloudY[i] = 24 + (i % 4) * 5; this.cloudZ[i] = -80 - (i % 3) * 18; this.cloudS[i] = 0.8 + (i % 3) * 0.3; }
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this.placeClouds(); scene.add(this.clouds);
    this.shafts = []; const sg = new THREE.PlaneGeometry(7, 46);
    for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: this.T.shaft, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.2, fog: false })); m.position.set(-30 + i * 24, 18, -22 - (i % 2) * 8); m.rotation.z = 0.32; scene.add(m); this.shafts.push(m); }
    this.phase = -1; this.phaseOffset = 0; this.blend = 1; this.time = 0; this.cur = null; this.from = null; this.to = null; this.trailBright = 1;
  }

  // Attach a built biome instance. The previous one is detached (caller disposes it). Lighting blends toward the new presets.
  setBiome(inst, immediate = false) {
    if (this.biome) this.biome.root.removeFromParent();
    this.biome = inst; this.scene.add(inst.root);
    this.scene.fog.density = inst.def.lighting.fogDensity;
    const i = this.phaseIndex(); this.phase = i;
    const target = toState(inst.def.dayNight[i]);
    if (!this.cur || immediate) { this.cur = target; this.from = toState(target); this.to = toState(target); this.blend = 1; this.applyState(); }
    else { this.from = toState(this.cur); this.to = target; this.blend = 0; }
  }
  placeClouds() { const M = this.clouds; for (let i = 0; i < this.cloudX.length; i++) { this._v.set(this.cloudX[i], this.cloudY[i], this.cloudZ[i]); this._s.setScalar(this.cloudS[i]); this._m4.compose(this._v, this._q, this._s); M.setMatrixAt(i, this._m4); } M.instanceMatrix.needsUpdate = true; }
  phaseIndex() { return (((this.cycle ?? 0) + this.phaseOffset + (this.startPhaseOverride ?? this.biome.def.startPhase)) % 4 + 4) % 4; } // Journey pins the start phase so time of day flows across seams
  jumpToPhase(i) { this.phase = i; this.cur = toState(this.biome.def.dayNight[i]); this.from = toState(this.cur); this.to = toState(this.cur); this.blend = 1; this.applyState(); } // debug: no blend
  get phaseName() { return ['dawn', 'noon', 'dusk', 'night'][this.phase]; }

  setPhase(i) {
    if (i === this.phase) return;
    this.phase = i; this.from = toState(this.cur); this.to = toState(this.biome.def.dayNight[i]); this.blend = 0;
  }

  applyState() {
    const s = this.cur, u = this.skyU;
    u.top.value.copy(s.top); u.horizon.value.copy(s.horizon); u.sunColor.value.copy(s.sun); u.stars.value = s.stars; u.aurora.value = s.aurora;
    u.sunDir.value.set(0.55, Math.sin(s.elev), -Math.cos(s.elev) * 0.6).normalize();
    this.scene.fog.color.copy(s.fog); this.scene.background = null;
    this.sun.color.copy(s.sun); this.sun.intensity = s.sunI; this.hemi.color.copy(s.hemiSky); this.hemi.groundColor.copy(s.hemiGround); this.hemi.intensity = s.hemiI;
    this.scene.environmentIntensity = s.env; this.eyeLight.intensity = s.eyeLight;
    for (const m of this.shafts) { m.material.opacity = 0.22 * s.shafts; m.visible = this.shaftsAllowed !== false && s.shafts > 0.02; } // invisible when off: five large additive quads of pure overdraw otherwise
    this.cloudMat.color.copy(s.cloud);
    this.trailBright = s.trail;
  }

  // score drives the day cycle; speed drives scrolling.
  update(dt, speed, score) {
    this.time += dt; this.speed = speed; const B = this.biome; if (!B) return;
    this.cycle = 0; // lighting stays at the world's start phase (Journey blends to the next world's when it swaps)
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / C.DAY_LERP_TIME); const t = this.blend * this.blend * (3 - 2 * this.blend);
      for (const k of COLOR_KEYS) this.cur[k].lerpColors(this.from[k], this.to[k], t); for (const k of NUM_KEYS) this.cur[k] = THREE.MathUtils.lerp(this.from[k], this.to[k], t);
      this.applyState();
    }
    const dx = speed * dt, gm = B.groundMat;
    gm.map.offset.x += dx / 10 * B.def.ground.scrollDetail; gm.normalMap.offset.x = gm.map.offset.x; if (gm.roughnessMap) gm.roughnessMap.offset.x = gm.map.offset.x;
    B.laneMat.map.offset.x += dx / 10;
    for (let i = 0; i < B.layers.length; i++) { const L = B.layers[i], m = L.a; m.position.x -= dx * L.par; if (m.position.x < -20 - L.len) m.position.x += L.len; if (L.def.update) L.def.update(L, dt, this.time); }
    for (let i = 0; i < B.props.length; i++) { const P = B.props[i], b = P.band; b.position.x -= dx; if (b.position.x < -20 - P.len) b.position.x += P.len; if (P.def.update) for (let k = 0; k < P.items.length; k++) P.def.update(P.items[k], dt, this.time); }
    for (const A of B.ambient) {
      const p = A.pos, s = A.spec, ax = s.area.x, ay = s.area.y, az = s.area.z, v = s.vel, sway = s.sway ?? 0, wx = ax[1] - ax[0], wy = ay[1] - ay[0];
      for (let i = 0; i < A.n; i++) {
        p[i * 3] += (v[0] - speed * (s.scroll ?? 0.9)) * dt + Math.sin(this.time * 1.1 + A.seed[i]) * sway * dt; p[i * 3 + 1] += v[1] * dt + Math.sin(this.time * 1.3 + A.seed[i]) * sway * dt; p[i * 3 + 2] += v[2] * dt;
        if (p[i * 3] < ax[0]) p[i * 3] += wx; else if (p[i * 3] > ax[1]) p[i * 3] -= wx;
        if (p[i * 3 + 1] < ay[0]) p[i * 3 + 1] += wy; else if (p[i * 3 + 1] > ay[1]) p[i * 3 + 1] -= wy;
      }
      if (s.blink) A.pts.material.opacity = (s.opacity ?? 0.6) * (0.35 + 0.65 * Math.max(0, Math.sin(this.time * s.blink.rate + s.blink.phase)));
      A.pts.geometry.attributes.position.needsUpdate = true;
    }
    { const X = this.cloudX, d = dx * 0.05 + dt * 0.6; for (let i = 0; i < X.length; i++) { X[i] -= d; if (X[i] < -140) X[i] += 260; } this.placeClouds(); }
    if (this.shafts[0].visible) for (const s of this.shafts) { s.position.x -= dx * 0.5; if (s.position.x < -50) s.position.x += 120; }
    this.sky.position.copy(this.camera.position); this.skyU.time.value = this.time;
  }
}
