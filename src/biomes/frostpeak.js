// Frozen mountain pass: packed snow with ice patches, pine trees, peaks, falling snow, aurora at night, breath fog.
const PH = { hemiI: 0.55, env: 0.5, shafts: 0, cloud: 0xffffff };
function pine(ctx, M, h, i) { const { prim: P } = ctx, g = P.group(); g.add(P.cyl(0.15, 0.25, h * 0.35, M.bark, 0, h * 0.17, 0, 6)); for (let k = 0; k < 3; k++) { const r = (1.1 - k * 0.25) * (0.8 + (i % 3) * 0.15); g.add(P.cone(r, h * 0.35, M.pine, 0, h * (0.35 + k * 0.22), 0, 8), P.cone(r * 0.75, h * 0.12, M.snow, 0, h * (0.35 + k * 0.22) + h * 0.16, 0, 8)); } return g; }
export default {
  id: 'frostpeak', displayName: 'Frost Peak', tagline: 'Snow, ice and the northern lights',
  palette: { sky: 0xa8d0f0, fog: 0xdce8f4, ground: 0xf0f4f8, accent: 0x40c0ff, rim: 0x1a2a50, obstacleTints: [0xffffff, 0xe8f4ff, 0xd8ecff] },
  lighting: { keyColor: 0xf0f6ff, keyIntensity: 1.8, hemiSky: 0xc0e0ff, hemiGround: 0x8090a0, fogDensity: 0.012, exposure: 1.0, bloomThreshold: 1.4 },
  startPhase: 1,
  dayNight: [ // pink dawn, bright noon, lavender dusk, deep-blue aurora night
    { ...PH, top: 0x7080b8, horizon: 0xf8c8c0, fog: 0xe0d0d8, sun: 0xffd0b8, sunI: 1.3, hemiSky: 0xc0c8f0, hemiGround: 0x907888, elev: 0.14, stars: 0.1, eyeLight: 2, trail: 1.0, cloud: 0xffe0d8 },
    { ...PH, top: 0x2f78d0, horizon: 0xb8d8f0, fog: 0xdce8f4, sun: 0xfff8f0, sunI: 1.9, hemiSky: 0xc0e0ff, hemiGround: 0x8090a0, hemiI: 0.6, env: 0.6, elev: 0.7, stars: 0, eyeLight: 0, trail: 0.8 },
    { ...PH, top: 0x3a3070, horizon: 0xe0a0c0, fog: 0xb0a0c0, sun: 0xffb8d0, sunI: 1.2, hemiSky: 0x9080c0, hemiGround: 0x605070, elev: 0.1, stars: 0.3, eyeLight: 4, trail: 1.1, cloud: 0xf0c0d8 },
    { ...PH, top: 0x030616, horizon: 0x1a2c5a, fog: 0x1a2440, sun: 0xa0b8ff, sunI: 0.5, hemiSky: 0x304880, hemiGround: 0x101828, hemiI: 0.4, env: 0.2, elev: -0.3, stars: 1, eyeLight: 6, trail: 1.6, aurora: 1, cloud: 0x203050 },
  ],

  *makeMaterials(ctx) {
    const { S, std, tex: T } = ctx, { canvasTexture, heightToNormal, makeNoiseTexture, clamp255, mix } = T;
    const rockN = makeNoiseTexture(S, { scale: 5, octaves: 5, seed: 71 });
    const rockMap = canvasTexture(S, (x, y) => { const h = rockN[y * S + x], snowy = h > 0.6; return snowy ? [235, 242, 250] : [clamp255(mix(70, 120, h)), clamp255(mix(75, 125, h)), clamp255(mix(85, 135, h))]; });
    const rockNormal = heightToNormal(rockN, S, 3); yield;
    const iceN = makeNoiseTexture(S, { scale: 6, octaves: 3, seed: 72 });
    const iceMap = canvasTexture(S, (x, y) => { const h = iceN[y * S + x], crack = Math.abs(h - 0.5) < 0.012 ? 0.6 : 1; return [clamp255(170 * crack), clamp255(mix(210, 235, h) * crack), clamp255(255 * crack)]; }); yield;
    return {
      rock: std({ map: rockMap, normalMap: rockNormal, roughness: 0.95 }), snow: std({ color: 0xf4f8ff, roughness: 0.9 }), snowDrift: std({ color: 0xe8f0fa, roughness: 1 }),
      pine: std({ color: 0x1e4a34, roughness: 0.95 }), bark: std({ color: 0x4a3626, roughness: 0.9 }),
      peak: [0xf0f6ff, 0xd8e4f4, 0xb8c8e0].map(c => std({ color: c, roughness: 1 })),
      ice: std({ map: iceMap, color: 0xcfe8ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }),
      iceSolid: std({ map: iceMap, color: 0xb8dcff, roughness: 0.2 }),
      icicle: std({ color: 0xd0ecff, roughness: 0.1, transparent: true, opacity: 0.9 }),
      car: std({ color: 0xd03030, roughness: 0.5, metalness: 0.3 }), glass: std({ color: 0x80a0c0, roughness: 0.2, metalness: 0.2 }), tyre: std({ color: 0x202024, roughness: 0.9 }),
      owl: std({ color: 0xf8f8ff, roughness: 0.9 }), owlDark: std({ color: 0x8890a0, roughness: 0.9 }), owlEye: std({ color: 0xffd040, emissive: 0xffb000, emissiveIntensity: 1.2 }),
      plume: ctx.basic({ color: 0xe0f4ff, transparent: true, opacity: 0.55, depthWrite: false }),
      iceRing: std({ color: 0xc0ecff, emissive: 0x3090d0, emissiveIntensity: 0.7, roughness: 0.2, transparent: true, opacity: 0.85 }),
      frost: std({ color: 0xffffff, emissive: 0x80c0ff, emissiveIntensity: 0.4, roughness: 0.3 }),
      glow: std({ color: 0xc0f0ff, emissive: 0x60d0ff, emissiveIntensity: 2, roughness: 0.3 }),
    };
  },

  ground: { // packed snow with smooth blue ice patches
    scrollDetail: 1, material: { roughness: 1, metalness: 0.05, envMapIntensity: 1.2, normalScale: { x: 0.5, y: 0.5 } },
    makeTexture(ctx) { const { S, tex: T } = ctx, g = T.makeNoiseTexture(S, { scale: 32, octaves: 3, seed: 81 }), ice = T.makeNoiseTexture(S, { scale: 3, octaves: 3, seed: 82 });
      return T.canvasTexture(S, (x, y) => { const i = y * S + x, k = ice[i] > 0.6 ? 1 : 0, v = 225 + g[i] * 30; return k ? [170 + g[i] * 20, 210 + g[i] * 20, 245] : [v, v + 3, v + 8]; }); },
    makeNormal(ctx) { const { S, tex: T } = ctx, g = T.makeNoiseTexture(S, { scale: 32, octaves: 3, seed: 81 }), ice = T.makeNoiseTexture(S, { scale: 3, octaves: 3, seed: 82 }); return T.heightToNormal(g.map((v, i) => ice[i] > 0.6 ? 0.5 : v), S, 1.4); },
    makeRoughness(ctx) { const { S, tex: T } = ctx, ice = T.makeNoiseTexture(S, { scale: 3, octaves: 3, seed: 82 }); return T.canvasTexture(S, (x, y) => { const v = ice[y * S + x] > 0.6 ? 30 : 230; return [v, v, v]; }, { srgb: false }); },
  },
  lane: { width: 1.8, makeTexture: ctx => ctx.tex.canvasTexture(128, (x, y, u, v) => { const track = Math.abs(v - 0.3) < 0.05 || Math.abs(v - 0.7) < 0.05; return track ? [150, 180, 210, 110] : [0, 0, 0, 0]; }) },

  parallax: [
    { speedFactor: 0.3, y: 0, z: -34, len: 200, makeLayer(ctx, M) { const { prim: P } = ctx, g = P.group(), rnd = ctx.rnd(21); let x = 0, i = 0; // pines and drifts
      while (x < 190) { const t = pine(ctx, M, 4 + rnd() * 5, i); t.position.x = x; g.add(t); if (i % 3 === 0) g.add(P.sphere(3 + rnd() * 3, M.snowDrift, x + 3, -1.5, 2, 10)); x += 4 + rnd() * 7; i++; } return g; } },
    { speedFactor: 0.15, y: 0, z: -70, len: 220, makeLayer(ctx, M) { const { THREE } = ctx, g = new THREE.Group(), rnd = ctx.rnd(22); let x = 0; // snowy cliffs
      while (x < 210) { const w = 14 + rnd() * 20, h = 8 + rnd() * 14, top = w * 0.5; const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(w - (w - top) / 2, h); s.lineTo((w - top) / 2, h); s.lineTo(0, 0);
        const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 8, bevelEnabled: false }), M.rock); m.position.x = x; g.add(m); const cap = new THREE.Mesh(new THREE.BoxGeometry(top + 1, 1.2, 9), M.snow); cap.position.set(x + w / 2, h + 0.4, 4); g.add(cap); x += w + rnd() * 6; } return g; } },
    { speedFactor: 0.07, y: 0, z: -125, len: 260, makeLayer(ctx, M) { const { prim: P } = ctx, g = P.group(), rnd = ctx.rnd(23); let x = 0, i = 0; while (x < 250) { const h = 30 + rnd() * 35; g.add(P.cone(12 + rnd() * 8, h, M.peak[i % 3], x, h / 2 - 2, 0, 5)); x += 14 + rnd() * 12; i++; } return g; } },
  ],
  props: [
    { count: 6, every: [12, 28], z: [-11, -3.5], scale: [0.7, 1.3], make: (ctx, M, i) => pine(ctx, M, 2.5 + (i % 3), i) },
    { count: 4, every: [22, 60], z: [-10, -4], scale: [0.6, 1.4], make: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.sphere(0.8, M.rock, 0, 0.4, 0, 8), P.sphere(0.55, M.snow, 0.1, 0.95, 0, 8)); return g; } },
    { count: 3, every: [30, 90], z: [-7, -3.5], make: (ctx, M, i) => { const { prim: P } = ctx, g = P.group(); for (let k = 0; k < 4; k++) { const c = P.cone(0.18, 0.9 + (k % 2) * 0.5, M.glow, (k - 1.5) * 0.3, 0.45, (k % 2) * 0.2, 5); c.rotation.z = (k - 1.5) * 0.25; g.add(c); } return g; } }, // ice crystal cluster
  ],
  particles: {
    ambient: [
      { count: 320, color: 0xffffff, size: 0.2, opacity: 0.9, vel: [-1.2, -2.4, 0], sway: 0.7, scroll: 0.6, area: { x: [-12, 44], y: [0, 14], z: [-14, -1.5] } }, // snow
      { count: 120, color: 0xe0f0ff, size: 0.08, opacity: 0.6, vel: [-3, -1.2, 0], sway: 1.5, scroll: 0.8, area: { x: [-12, 44], y: [0, 6], z: [-10, -1.5] } }, // wind-blown spindrift
    ],
    impact: { colors: [0xffffff, 0xa0e0ff, 0x60c0ff], n: 40, speed: 9, gravity: -30, life: 0.7 },
    trail: { colors: [0xffffff, 0xd0ecff] },
    breath: { colors: [0xffffff, 0xe0f0ff], every: 1.6 },
  },
  obstacles: { // ice chunk · icicle spike · snow-buried car · snowy owl · cracking ice plume · snowball
    small: { impact: 'ice', makeMesh: (ctx, M) => { const { prim: P, THREE } = ctx, g = P.group(); const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), M.ice); c.position.y = 0.5; c.castShadow = true; g.add(c); g.add(P.sphere(0.22, M.snow, 0.1, 0.9, 0, 8)); return g; } },
    tall: { impact: 'ice', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.cone(0.4, 1.9, M.icicle, 0, 0.95, 0, 7), P.cone(0.2, 1.0, M.icicle, 0.25, 0.5, 0.1, 6), P.cone(0.16, 0.8, M.icicle, -0.25, 0.4, -0.05, 6)); return g; } },
    wide: { impact: 'metal', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.box(2.3, 0.55, 1.1, M.car, 0, 0.4, 0), P.box(1.2, 0.4, 1.0, M.glass, -0.1, 0.85, 0), P.box(2.4, 0.3, 1.2, M.snowDrift, 0, 0.15, 0)); const mound = P.sphere(0.9, M.snow, 0.1, 0.85, 0, 10); mound.scale.y = 0.4; g.add(mound);
      for (const [x, z] of [[-0.8, 0.5], [0.8, 0.5]]) g.add(P.cyl(0.24, 0.24, 0.2, M.tyre, x, 0.24, z, 10).rotateX(Math.PI / 2)); return g; } },
    flyer: { impact: 'flap', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.sphere(0.27, M.owl, 0.05, -0.05, 0, 12), P.sphere(0.2, M.owl, -0.22, 0.2, 0, 10), P.box(0.3, 0.05, 0.22, M.owlDark, 0.36, -0.05, 0));
      for (const x of [-0.3, -0.14]) g.add(P.sphere(0.05, M.owlEye, x, 0.24, 0.15, 6)); g.add(P.cone(0.04, 0.1, M.owlDark, -0.3, 0.16, 0.15, 5).rotateX(Math.PI / 2));
      for (const side of [-1, 1]) { const w = P.box(0.36, 0.04, 0.5, M.owlDark, 0, 0.05, 0); w.geometry.translate(0, 0, side * 0.35); w.name = 'flap'; w.userData.side = side; w.userData.base = -side * 0.7; w.rotation.x = -side * 0.7; g.add(w); } return g; } },
    hazard: { impact: 'ice', makeMesh: (ctx, M) => { const { prim: P, THREE } = ctx, g = P.group(); g.add(P.cyl(0.6, 0.6, 0.1, M.iceSolid, 0, 0.05, 0, 12));
      const plume = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.55, 1.9, 10, 1, true), M.plume); plume.position.y = 1.05; plume.name = 'plume'; plume.userData.noOutline = true; g.add(plume); return g; } },
    chaser: { impact: 'thud', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(), r = P.group(); r.name = 'roll'; r.position.y = 0.55; r.add(P.sphere(0.55, M.snow, 0, 0, 0, 14), P.sphere(0.2, M.snowDrift, 0.3, 0.3, 0.3, 6), P.sphere(0.15, M.snowDrift, -0.35, -0.2, 0.3, 6)); g.add(r); return g; } },
  },
  pickup: { makePickupShell: (ctx, M) => { const { prim: P, THREE } = ctx, g = P.group(); // open ice cage with frost crystals; snow spirals in
    for (const tilt of [0.25, -0.25]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.035, 6, 32), M.iceRing); ring.lookAt(ctx.viewDir); ring.rotateX(tilt); ring.userData.noOutline = true; g.add(ring); } // open ice cage: rings face the camera, nothing crosses the core
    for (let i = 0; i < 6; i++) { const c = P.cone(0.06, 0.3, M.frost, 0, 0, 0, 5); c.position.set(Math.cos(i * 1.05) * 0.78, Math.sin(i * 2.3) * 0.3, Math.sin(i * 1.05) * 0.78); c.lookAt(c.position.clone().multiplyScalar(3)); c.rotateX(Math.PI / 2); c.userData.noOutline = true; g.add(c); }
    for (let i = 0; i < 3; i++) { const s = P.sphere(0.05, M.snow, Math.cos(i * 2.1) * 0.9, i * 0.25 - 0.25, Math.sin(i * 2.1) * 0.9, 6); s.userData.noOutline = true; g.add(s); } return g; } },
  audio: { musicPreset: 'frost', impactTimbre: 'ice', footstepTimbre: 'crunch' },
  robotAccent: { emissive: 0x80e0ff, trailColor: 0xb0f0ff },
};
