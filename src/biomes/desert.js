// Desert canyon: the v1 world. Sand, terracotta mesas, warm sun, dust motes.
const PH = { hemiI: 0.45, env: 0.45 };
// Cactus exactly w wide and h tall (so it fits its archetype box without scaling) with `arms` side arms. Origin on the ground.
function cactus(ctx, M, w, h, arms) {
  const { prim: P } = ctx, g = P.group(), r = arms ? w * 0.22 : w * 0.5 * 0.92, ar = r * 0.7;
  g.add(P.cyl(r, r * 1.05, h - r, M.cactus, 0, (h - r) / 2, 0, 10), P.sphere(r, M.cactus, 0, h - r, 0, 10));
  for (let i = 0; i < arms; i++) { const s = i % 2 ? 1 : -1, ay = h * (0.42 + i * 0.16), ax = s * (w / 2 - ar); g.add(P.cyl(ar, ar, Math.abs(ax), M.cactus, ax / 2, ay, 0, 8).rotateZ(Math.PI / 2), P.cyl(ar, ar, h * 0.25, M.cactus, ax, ay + h * 0.125, 0, 8), P.sphere(ar, M.cactus, ax, ay + h * 0.25, 0, 8)); }
  if (arms === 0) g.add(P.sphere(r * 0.4, M.flower, 0, h - r * 0.15, 0, 8));
  return g;
}
export default {
  id: 'desert', displayName: 'Sunset Canyon', tagline: 'Dust, mesas and a big orange sun',
  palette: { sky: 0x8fbde8, fog: 0xd2c0a4, ground: 0xd8a878, accent: 0xff8a3d, rim: 0x1a1020, obstacleTints: [0xffffff, 0xf0d8c8, 0xd8c0b0] },
  lighting: { keyColor: 0xfff0d0, keyIntensity: 2.0, hemiSky: 0xbfdfff, hemiGround: 0xc9915a, fogDensity: 0.0075, exposure: 1.0, bloomThreshold: 1.15 },
  startPhase: 0,
  dayNight: [ // dawn, noon, dusk, night
    { ...PH, top: 0x6a76b8, horizon: 0xf0b890, fog: 0xd8b49c, sun: 0xffd0a0, sunI: 1.5, hemiSky: 0xb0b8ff, hemiGround: 0xa07050, elev: 0.15, stars: 0.1, shafts: 0.9,  eyeLight: 3,  trail: 1.0, cloud: 0xffd0b8 },
    { ...PH, top: 0x1e5fc8, horizon: 0x8fbde8, fog: 0xd2c0a4, sun: 0xfff0d0, sunI: 2.0, hemiSky: 0xbfdfff, hemiGround: 0xc9915a, hemiI: 0.55, env: 0.6, elev: 0.8, stars: 0, shafts: 0.45, eyeLight: 0, trail: 0.8, cloud: 0xffffff },
    { ...PH, top: 0x3a2f7a, horizon: 0xf08a50, fog: 0xd89468, sun: 0xffb070, sunI: 1.6, hemiSky: 0x9070c0, hemiGround: 0xa06040, elev: 0.12, stars: 0.2, shafts: 0.7,  eyeLight: 2,  trail: 1.0, cloud: 0xffb890 },
    { ...PH, top: 0x050818, horizon: 0x18244e, fog: 0x121a36, sun: 0x8fa8ff, sunI: 0.5, hemiSky: 0x2a3a70, hemiGround: 0x101020, hemiI: 0.3, env: 0.12, elev: -0.35, stars: 1, shafts: 0, eyeLight: 8, trail: 1.6, cloud: 0x1e2a50 },
  ],

  *makeMaterials(ctx) {
    const { S, std, tex: T, shared } = ctx, { canvasTexture, heightToNormal, makeNoiseTexture, clamp255, mix, smooth } = T, ST = shared.textures;
    const V2 = (x, y) => new ctx.THREE.Vector2(x, y);
    const rockH = makeNoiseTexture(S, { scale: 5, octaves: 5, seed: 21 });
    const rockMap = canvasTexture(S, (x, y) => { const h = rockH[y * S + x], k = Math.pow(h, 1.4); return [clamp255(mix(95, 190, k)), clamp255(mix(52, 115, k)), clamp255(mix(40, 85, k))]; });
    const rockNormal = heightToNormal(rockH, S, 3.5); yield;
    const ribs = makeNoiseTexture(S, { scale: 24, octaves: 2, seed: 61, stretchY: 0.08 });
    const cactusMap = canvasTexture(S, (x, y) => { const r = ribs[y * S + x], k = 0.5 + 0.5 * Math.sin(x / S * Math.PI * 24); return [clamp255(mix(60, 95, k) + r * 20), clamp255(mix(120, 165, k) + r * 20), clamp255(mix(55, 80, k))]; }); yield;
    return {
      rock: std({ map: rockMap, normalMap: rockNormal, roughness: 0.95, metalness: 0 }),
      cactus: std({ map: cactusMap, roughness: 0.8 }), spine: std({ color: 0xf5f0d0, roughness: 0.9 }), flower: std({ color: 0xff6aa0, emissive: 0x802040, emissiveIntensity: 0.3 }),
      feather: std({ color: 0x3a2a24, roughness: 0.9 }), skin: std({ color: 0xd86a50, roughness: 0.7 }), beak: std({ color: 0xf0d080, roughness: 0.6 }),
      vent: std({ map: ST.metalMap, roughnessMap: ST.metalRough, normalMap: ST.metalNormal, color: 0x8a8f98, roughness: 1, metalness: 0.9 }),
      dark: std({ color: 0x3b3f4a, roughness: 0.5, metalness: 0.6 }),
      steam: ctx.basic({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
      weed: std({ color: 0xc8a060, wireframe: true, roughness: 1 }), weedCore: std({ color: 0xa88048, transparent: true, opacity: 0.55, roughness: 1 }),
      dust: ctx.basic({ color: 0xe8d0a0, transparent: true, opacity: 0.35, depthWrite: false, side: 2 }),
      brass: std({ map: ST.metalMap, roughnessMap: ST.metalRough, color: 0xd8a040, roughness: 0.6, metalness: 1 }),
      mesa: [0xd08a60, 0xc47a58, 0xb06a50].map(c => { const m = T.clone(rockMap); m.repeat.set(0.08, 0.08); const n = T.clone(rockNormal); n.repeat.set(0.08, 0.08); return std({ color: c, map: m, normalMap: n, normalScale: V2(0.5, 0.5), roughness: 1 }); }),
    };
  },

  ground: {
    scrollDetail: 1, material: { roughness: 1, metalness: 0 },
    makeTexture(ctx) { const { S, tex: T } = ctx, sandH = T.makeNoiseTexture(S, { scale: 6, octaves: 5, seed: 3 }), grain = T.makeNoiseTexture(S, { scale: 64, octaves: 2, seed: 11 });
      return T.canvasTexture(S, (x, y) => { const i = y * S + x, h = sandH[i], g = grain[i]; return [T.clamp255(T.mix(212, 230, h) - g * 14), T.clamp255(T.mix(165, 185, h) - g * 14), T.clamp255(T.mix(110, 130, h) - g * 12)]; }); },
    makeNormal(ctx) { const { S, tex: T } = ctx, sandH = T.makeNoiseTexture(S, { scale: 6, octaves: 5, seed: 3 }), grain = T.makeNoiseTexture(S, { scale: 64, octaves: 2, seed: 11 });
      return T.heightToNormal(sandH.map((v, i) => v * 0.6 + grain[i] * 0.4), S, 1.6); },
  },
  lane: { width: 1.6, makeTexture: ctx => ctx.tex.canvasTexture(128, (x, y, u, v) => { const inLane = (Math.abs(v - 0.3) < 0.07 || Math.abs(v - 0.7) < 0.07), tread = (x % 16) < 9; return [40, 25, 15, inLane && tread ? 90 : 0]; }) },

  // Three mesa strips: silhouettes of trapezoids extruded, each strip wraps seamlessly at `len`.
  parallax: [[-42, 0.3, 0.7], [-75, 0.15, 1.4], [-120, 0.07, 2.4]].map(([z, speedFactor, hs], i) => ({
    speedFactor, y: 0, z, len: 180,
    makeLayer(ctx, M) {
      const { THREE } = ctx, g = new THREE.Group(), rnd = ctx.rnd(i * 17 + 3); let x = 0;
      while (x < 170) {
        const w = 10 + rnd() * 22, h = (4 + rnd() * 9) * hs, top = w * (0.4 + rnd() * 0.3);
        const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(w, 0); shape.lineTo(w - (w - top) / 2, h); shape.lineTo((w - top) / 2, h); shape.lineTo(0, 0);
        const m = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 6 + hs * 4, bevelEnabled: false }), M.mesa[i]); m.position.x = x; g.add(m);
        x += w + rnd() * 8;
      }
      return g;
    },
  })),
  props: [
    { count: 6, every: [14, 30], z: [-13, -4], scale: [0.7, 1.3], make: (ctx, M, i) => cactus(ctx, M, 0.8, 1.4 + (i % 3) * 0.4, i % 3) },
    { count: 5, every: [18, 40], z: [-12, -5], scale: [0.6, 1.4], make: (ctx, M, i) => { const g = ctx.prim.group(); g.add(ctx.prim.cone(0.7, 1.0, M.rock, 0, 0.45, 0, 6), ctx.prim.cone(0.4, 0.6, M.rock, 0.5 + (i % 2) * 0.2, 0.25, 0.3, 5)); return g; } },
    { count: 2, every: [60, 140], z: [-30, -18], make: (ctx, M) => { const { THREE } = ctx, g = ctx.prim.group(); const m = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.25, 7, 10, 1, true), M.dust); m.position.y = 3.5; g.add(m); return g; }, update: (g, dt) => { g.rotation.y += dt * 4; } }, // dust devil
  ],
  particles: {
    ambient: [{ count: 160, color: 0xfff2d0, size: 0.09, opacity: 0.5, vel: [-0.4, 0, 0], sway: 0.3, area: { x: [-10, 30], y: [0, 8], z: [-8, 8] } }],
    impact: { colors: [0xffd060, 0xff8a30, 0xfff0a0], n: 40, speed: 9, gravity: -30, life: 0.7 },
    trail: { colors: [0xe8d0a0, 0xd0b080] },
  },
  obstacles: { // small cactus · tall saguaro · cluster of 3 · vulture · steam vent · tumbleweed
    small: { impact: 'thud', makeMesh: (ctx, M) => cactus(ctx, M, 0.9, 1.0, 0) },
    tall: { impact: 'thud', makeMesh: (ctx, M) => cactus(ctx, M, 0.8, 1.9, 2) },
    wide: { impact: 'thud', makeMesh: (ctx, M) => { const g = ctx.prim.group(); [[-0.85, 0.9, 0], [0, 1.2, 1], [0.85, 0.85, 0]].forEach(([x, h, arms]) => { const c = cactus(ctx, M, 0.7, h, arms); c.position.x = x; g.add(c); }); return g; } },
    flyer: { impact: 'flap', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(); // vulture flying toward the robot (head at -x), wings flap in ±z
      g.add(P.sphere(0.27, M.feather, 0.05, 0, 0, 12), P.sphere(0.12, M.skin, -0.3, 0.12, 0, 10), P.cone(0.05, 0.16, M.beak, -0.44, 0.1, 0, 6).rotateZ(Math.PI / 2), P.box(0.3, 0.05, 0.22, M.feather, 0.36, 0.02, 0));
      for (const side of [-1, 1]) { const w = P.box(0.34, 0.04, 0.5, M.feather, 0, 0.1, 0); w.geometry.translate(0, 0, side * 0.35); w.name = 'flap'; w.userData.side = side; w.userData.base = -side * 0.75; w.rotation.x = -side * 0.75; g.add(w); }
      return g; } },
    hazard: { impact: 'steam', makeMesh: (ctx, M) => { const { prim: P, THREE } = ctx, g = P.group(); g.add(P.cyl(0.55, 0.65, 0.35, M.vent, 0, 0.17, 0, 12), P.cyl(0.3, 0.3, 0.12, M.dark, 0, 0.4, 0, 12));
      const steam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.5, 1.6, 10, 1, true), M.steam); steam.position.y = 1.25; steam.name = 'plume'; steam.userData.noOutline = true; g.add(steam); return g; } },
    chaser: { impact: 'rustle', makeMesh: (ctx, M) => { const { prim: P, THREE } = ctx, g = P.group(), r = P.group(); r.name = 'roll'; r.position.y = 0.55;
      for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 - i * 0.08, 1), M.weed); m.rotation.set(i, i * 2, 0); m.userData.noOutline = true; r.add(m); }
      const core = P.sphere(0.4, M.weedCore, 0, 0, 0, 10); r.add(core); g.add(r); return g; } },
  },
  pickup: { makePickupShell: (ctx, M) => { const { prim: P } = ctx, g = P.group(); // brass battery cell with cooling fins; core stays visible through the glass
    for (const a of [0, 1, 2, 3]) { const f = P.box(0.06, 0.55, 0.3, M.brass, 0, 0, 0); f.rotation.y = a * Math.PI / 4; f.geometry.translate(0, 0, 0.62); g.add(f); }
    g.add(P.cyl(0.14, 0.14, 0.12, M.brass, 0, 0.66, 0, 10), P.cyl(0.14, 0.14, 0.12, M.brass, 0, -0.66, 0, 10)); return g; } },
  audio: { musicPreset: 'desert', impactTimbre: 'stone', footstepTimbre: 'sand' },
  robotAccent: { emissive: 0x30e0ff, trailColor: 0x40e8ff },
};
