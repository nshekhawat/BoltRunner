// Overgrown temple ruins: mossy flagstones, stone idols, god-rays through the canopy, fireflies, drifting leaves, a distant waterfall.
const PH = { hemiI: 0.5, env: 0.4, cloud: 0xe8f0d0 };
function tree(ctx, M, h, i) { const { prim: P } = ctx, g = P.group(); g.add(P.cyl(0.35, 0.6, h, M.bark, 0, h / 2, 0, 8)); for (let k = 0; k < 3; k++) g.add(P.sphere(2.2 + (i + k) % 2, M.canopy[(i + k) % 2], (k - 1) * 1.6, h + 0.5 + k * 0.4, (k % 2) * 1.2, 10)); return g; }
function pillar(ctx, M, h, broken) { const { prim: P } = ctx, g = P.group(); g.add(P.box(1.1, 0.4, 1.1, M.stone, 0, 0.2, 0), P.cyl(0.38, 0.42, h, M.stone, 0, 0.4 + h / 2, 0, 10)); if (!broken) g.add(P.box(1.2, 0.35, 1.2, M.stone, 0, 0.4 + h + 0.17, 0)); g.add(P.sphere(0.5, M.moss, 0.3, 0.4 + h * 0.6, 0.35, 8)); return g; }
export default {
  id: 'jungle', displayName: 'Temple Jungle', tagline: 'Mossy ruins, fireflies and golden light',
  palette: { sky: 0x9fd0b0, fog: 0x86a888, ground: 0x4a6a3a, accent: 0xffc040, rim: 0xfff0b0, obstacleTints: [0xffffff, 0xe8f0d8, 0xd8e8c8] },
  lighting: { keyColor: 0xfff0c0, keyIntensity: 1.6, hemiSky: 0x80c080, hemiGround: 0x203020, fogDensity: 0.0095, exposure: 1.0, bloomThreshold: 1.3 },
  startPhase: 1,
  dayNight: [ // misty dawn, bright noon with god-rays, golden dusk, blue-green night full of fireflies
    { ...PH, top: 0x6a90a8, horizon: 0xd0e0c0, fog: 0xa8c0a8, sun: 0xffe0c0, sunI: 1.1, hemiSky: 0xa0c0b0, hemiGround: 0x304030, elev: 0.18, stars: 0, shafts: 0.6, eyeLight: 2, trail: 1.0 },
    { ...PH, top: 0x3f8fb8, horizon: 0xc8e8b8, fog: 0x88b088, sun: 0xfff4d0, sunI: 1.7, hemiSky: 0x90d090, hemiGround: 0x203820, hemiI: 0.55, elev: 0.75, stars: 0, shafts: 1.0, eyeLight: 0, trail: 0.8 },
    { ...PH, top: 0x4a3a6a, horizon: 0xf0a860, fog: 0x8a7860, sun: 0xffb860, sunI: 1.3, hemiSky: 0xa08070, hemiGround: 0x302818, elev: 0.1, stars: 0.2, shafts: 0.8, eyeLight: 3, trail: 1.1, cloud: 0xffc890 },
    { ...PH, top: 0x040c12, horizon: 0x10302a, fog: 0x0c1c18, sun: 0x8fb8c0, sunI: 0.4, hemiSky: 0x204838, hemiGround: 0x081008, hemiI: 0.35, env: 0.12, elev: -0.3, stars: 0.9, shafts: 0, eyeLight: 7, trail: 1.6, cloud: 0x102820 },
  ],

  *makeMaterials(ctx) {
    const { S, std, tex: T } = ctx, { canvasTexture, heightToNormal, makeNoiseTexture, clamp255, mix } = T;
    const mossN = makeNoiseTexture(S, { scale: 5, octaves: 4, seed: 51 }), grain = makeNoiseTexture(S, { scale: 40, octaves: 2, seed: 52 });
    const stoneMap = canvasTexture(S, (x, y) => { const i = y * S + x, m = mossN[i] > 0.55 ? (mossN[i] - 0.55) * 2.2 : 0, g = grain[i]; return [clamp255(mix(120 + g * 30, 60, m)), clamp255(mix(118 + g * 30, 110, m)), clamp255(mix(105 + g * 25, 40, m))]; });
    const stoneNormal = heightToNormal(mossN.map((v, i) => v * 0.5 + grain[i] * 0.5), S, 2.0); yield;
    const barkN = makeNoiseTexture(S, { scale: 3, octaves: 4, seed: 53, stretchY: 10 });
    const barkMap = canvasTexture(S, (x, y) => { const h = barkN[y * S + x]; return [clamp255(mix(60, 110, h)), clamp255(mix(40, 75, h)), clamp255(mix(25, 45, h))]; });
    const barkNormal = heightToNormal(barkN, S, 2.5); yield;
    const leafN = makeNoiseTexture(S, { scale: 12, octaves: 3, seed: 54 });
    const canopyMap = canvasTexture(S, (x, y) => { const h = leafN[y * S + x]; return [clamp255(mix(20, 70, h)), clamp255(mix(70, 140, h)), clamp255(mix(20, 50, h))]; }); yield;
    const fall = canvasTexture(64, (x, y, u, v) => { const streak = 0.6 + 0.4 * Math.sin(u * 40 + v * 3); return [230, 240, 255, clamp255(streak * 210 * (0.6 + 0.4 * Math.sin(v * 12)))]; });
    return {
      stone: std({ map: stoneMap, normalMap: stoneNormal, roughness: 0.95 }), moss: std({ color: 0x4f8a2a, roughness: 1 }),
      bark: std({ map: barkMap, normalMap: barkNormal, roughness: 0.9 }), canopy: [std({ map: canopyMap, roughness: 0.9 }), std({ map: canopyMap, color: 0xa0d080, roughness: 0.9 })],
      hill: [0x2a5a3a, 0x224a34, 0x1c3c2c].map(c => std({ color: c, roughness: 1 })),
      water: std({ map: fall, color: 0xdff4ff, emissive: 0x88b0c0, emissiveIntensity: 0.3, transparent: true, opacity: 0.85, roughness: 0.3 }),
      fern: std({ color: 0x3f8a3a, roughness: 0.9, side: 2 }),
      log: std({ map: barkMap, normalMap: barkNormal, roughness: 0.9 }),
      idol: std({ map: stoneMap, normalMap: stoneNormal, color: 0xb0a890, roughness: 0.9 }), idolEye: std({ color: 0xffc040, emissive: 0xffa020, emissiveIntensity: 1.5 }),
      parrot: [0xff3030, 0x30a0ff, 0xffd020].map(c => std({ color: c, roughness: 0.7 })), beak: std({ color: 0x303030, roughness: 0.6 }),
      shroom: std({ color: 0xe0d0a0, roughness: 0.8 }), shroomCap: std({ color: 0xd04060, roughness: 0.7 }), spores: ctx.basic({ color: 0xb0ff80, transparent: true, opacity: 0.5, depthWrite: false }),
      boulder: std({ map: stoneMap, normalMap: stoneNormal, color: 0x9a9080, roughness: 1 }),
      crystal: std({ color: 0x80ffd0, emissive: 0x30c090, emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.1 }),
      vine: std({ color: 0x60ff60, emissive: 0x30c030, emissiveIntensity: 1.2, roughness: 0.6 }), firefly: std({ color: 0xffffa0, emissive: 0xffff60, emissiveIntensity: 3 }),
    };
  },

  ground: { // mossy flagstones with roots crossing the joints
    scrollDetail: 2, material: { roughness: 1, metalness: 0, normalScale: { x: 0.8, y: 0.8 } },
    makeTexture(ctx) { const { S, tex: T } = ctx, moss = T.makeNoiseTexture(S, { scale: 4, octaves: 4, seed: 61 }), g = T.makeNoiseTexture(S, { scale: 32, octaves: 2, seed: 62 });
      return T.canvasTexture(S, (x, y) => { const i = y * S + x, joint = (x % 64) < 4 || (y % 64) < 4, m = moss[i] > 0.5 ? (moss[i] - 0.5) * 2 : 0, gr = g[i] * 30; if (joint) return [40 + gr, 60 + gr, 30]; return [T.clamp255(T.mix(105 + gr, 45, m)), T.clamp255(T.mix(102 + gr, 105, m)), T.clamp255(T.mix(82 + gr, 35, m))]; }); },
    makeNormal(ctx) { const { S, tex: T } = ctx, g = T.makeNoiseTexture(S, { scale: 32, octaves: 2, seed: 62 }); return T.heightToNormal(g.map((v, i) => { const x = i % S, y = (i / S) | 0; return ((x % 64) < 4 || (y % 64) < 4) ? 0.2 : 0.6 + v * 0.3; }), S, 2.2); },
  },
  lane: { width: 2.2, makeTexture: ctx => ctx.tex.canvasTexture(128, (x, y, u, v) => { const root = Math.abs(v - 0.5 - 0.25 * Math.sin(u * 12)) < 0.035; return root ? [70, 45, 25, 150] : [0, 0, 0, 0]; }) },

  parallax: [
    { speedFactor: 0.3, y: 0, z: -30, len: 200, makeLayer(ctx, M) { const { prim: P } = ctx, g = P.group(), rnd = ctx.rnd(11); let x = 0, i = 0; // ruined temple colonnade
      while (x < 190) { const p = pillar(ctx, M, 3 + rnd() * 4, rnd() < 0.4); p.position.x = x; g.add(p); if (i % 4 === 0) { const w = P.box(6 + rnd() * 6, 1.5 + rnd() * 2, 1.2, M.stone, x + 4, 1, 0); g.add(w); } x += 5 + rnd() * 9; i++; } return g; } },
    { speedFactor: 0.15, y: 0, z: -62, len: 220, makeLayer(ctx, M) { const { prim: P } = ctx, g = P.group(), rnd = ctx.rnd(12); let x = 0, i = 0; // big trees and one waterfall
      while (x < 210) { const t = tree(ctx, M, 8 + rnd() * 6, i); t.position.x = x; g.add(t); x += 7 + rnd() * 8; i++; }
      const cliff = P.box(14, 22, 6, M.hill[1], 100, 11, -6); g.add(cliff); const fall = P.plane(3.5, 20, M.water, 100, 11, -2.9); fall.name = 'fall'; g.add(fall); g.add(P.sphere(3, M.water, 100, 0.5, -2, 10)); return g; },
      update: (L, dt) => { for (const m of [L.a, L.b]) { const f = m.getObjectByName('fall'); f.material.map.offset.y -= dt * 0.8; } } },
    { speedFactor: 0.07, y: 0, z: -115, len: 260, makeLayer(ctx, M) { const { prim: P } = ctx, g = P.group(), rnd = ctx.rnd(13); let x = 0, i = 0; while (x < 250) { g.add(P.sphere(14 + rnd() * 10, M.hill[i % 3], x, -4 + rnd() * 6, 0, 12)); x += 16 + rnd() * 12; i++; } return g; } },
  ],
  props: [
    { count: 8, every: [8, 22], z: [-9, -3.2], scale: [0.6, 1.3], make: (ctx, M, i) => { const { prim: P } = ctx, g = P.group(); for (let k = 0; k < 6; k++) { const f = P.cone(0.16, 1.5, M.fern, 0, 0, 0, 4); f.geometry.translate(0, 0.75, 0); f.rotation.set(0.7, k * 1.05 + i, 0, 'YXZ'); g.add(f); } return g; } }, // fern clump: fronds leaning outward
    { count: 4, every: [24, 60], z: [-12, -5], make: (ctx, M, i) => pillar(ctx, M, 1.5 + (i % 3), true) },
    { count: 3, every: [30, 80], z: [-8, -4], make: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.box(1.6, 1.2, 1.2, M.stone, 0, 0.6, 0), P.box(1.0, 0.4, 0.8, M.stone, 0.2, 1.4, 0), P.sphere(0.7, M.moss, -0.4, 1.3, 0.3, 8)); return g; } }, // fallen block
  ],
  particles: {
    ambient: [
      { count: 60, color: 0xffff80, size: 0.16, opacity: 0.9, additive: true, vel: [-0.3, 0.2, 0], sway: 1.2, scroll: 0.7, blink: { rate: 2.1, phase: 0 }, area: { x: [-10, 36], y: [0.5, 5], z: [-12, -1.5] } },
      { count: 60, color: 0xd0ff70, size: 0.16, opacity: 0.9, additive: true, vel: [-0.2, 0.1, 0], sway: 1.2, scroll: 0.7, blink: { rate: 1.7, phase: 2.1 }, area: { x: [-10, 36], y: [0.5, 5], z: [-12, -1.5] } },
      { count: 60, color: 0xffe0a0, size: 0.16, opacity: 0.9, additive: true, vel: [-0.4, 0.3, 0], sway: 1.2, scroll: 0.7, blink: { rate: 2.6, phase: 4.2 }, area: { x: [-10, 36], y: [0.5, 5], z: [-12, -1.5] } },
      { count: 90, color: 0x90c050, size: 0.22, opacity: 0.8, vel: [-1.2, -0.9, 0], sway: 1.6, scroll: 0.6, area: { x: [-10, 40], y: [0, 12], z: [-14, -1.5] } }, // drifting leaves
    ],
    impact: { colors: [0x8fd060, 0xffc040, 0x604020], n: 40, speed: 9, gravity: -30, life: 0.7 },
    trail: { colors: [0x4a6a3a, 0x8fa060] },
  },
  obstacles: { // mossy log · stone idol · fallen trunk · parrot flock · spore geyser · rolling boulder
    small: { impact: 'wood', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.cyl(0.45, 0.45, 1.1, M.log, 0, 0.45, 0, 12).rotateX(Math.PI / 2), P.sphere(0.3, M.moss, 0.1, 0.7, 0, 8)); return g; } },
    tall: { impact: 'stone', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.box(0.8, 0.3, 0.8, M.idol, 0, 0.15, 0), P.box(0.62, 1.1, 0.6, M.idol, 0, 0.85, 0), P.box(0.75, 0.5, 0.7, M.idol, 0, 1.65, 0), P.box(0.4, 0.1, 0.2, M.idol, 0, 1.55, 0.4));
      for (const x of [-0.18, 0.18]) g.add(P.sphere(0.08, M.idolEye, x, 1.72, 0.36, 8)); g.add(P.sphere(0.28, M.moss, -0.12, 1.62, 0.1, 8)); return g; } },
    wide: { impact: 'wood', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.cyl(0.5, 0.55, 2.4, M.log, 0, 0.6, 0, 12).rotateZ(Math.PI / 2), P.cyl(0.14, 0.18, 0.6, M.log, 0.6, 0.85, 0.1, 8).rotateZ(-0.5), P.sphere(0.35, M.moss, -0.5, 0.85, 0.2, 8), P.box(0.6, 0.2, 0.9, M.log, -1.0, 0.1, 0)); return g; } },
    flyer: { impact: 'flap', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(); [[0, 0, 0, 0], [-0.18, 0.22, -0.3, 1], [0.16, -0.2, 0.3, 2]].forEach(([x, y, z, c]) => { const b = P.group(); b.position.set(x, y, z);
        b.add(P.sphere(0.16, M.parrot[c], 0, 0, 0, 10), P.sphere(0.1, M.parrot[(c + 1) % 3], -0.18, 0.08, 0, 8), P.cone(0.04, 0.12, M.beak, -0.3, 0.08, 0, 6).rotateZ(Math.PI / 2), P.box(0.2, 0.03, 0.1, M.parrot[(c + 2) % 3], 0.24, 0, 0));
        for (const side of [-1, 1]) { const w = P.box(0.22, 0.03, 0.3, M.parrot[(c + 1) % 3], 0, 0.05, 0); w.geometry.translate(0, 0, side * 0.2); w.name = 'flap'; w.userData.side = side; w.userData.base = -side * 0.6; b.add(w); } g.add(b); }); return g; } },
    hazard: { impact: 'thud', makeMesh: (ctx, M) => { const { prim: P, THREE } = ctx, g = P.group(); [[-0.35, 0.3], [0.2, 0.42], [0.45, 0.22]].forEach(([x, h]) => g.add(P.cyl(0.08, 0.1, h, M.shroom, x, h / 2, 0, 8), P.sphere(0.2, M.shroomCap, x, h, 0, 8)));
      const plume = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 1.55, 10, 1, true), M.spores); plume.position.y = 1.22; plume.name = 'plume'; plume.userData.noOutline = true; g.add(plume); return g; } },
    chaser: { impact: 'stone', makeMesh: (ctx, M) => { const { prim: P, THREE } = ctx, g = P.group(), r = P.group(); r.name = 'roll'; r.position.y = 0.55; const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), M.boulder); b.castShadow = true; r.add(b); g.add(r); return g; } },
  },
  pickup: { makePickupShell: (ctx, M) => { const { prim: P, THREE } = ctx, g = P.group(); // crystal petals around the core, wrapped in a glowing vine; fireflies orbit it
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), M.crystal); c.scale.set(0.5, 1.6, 0.5); c.position.set(Math.cos(i * 1.57) * 0.76, 0, Math.sin(i * 1.57) * 0.76); c.rotation.z = Math.cos(i * 1.57) * 0.4; c.rotation.x = -Math.sin(i * 1.57) * 0.4; c.userData.noOutline = true; g.add(c); }
    for (const tilt of [0.3, -0.3]) { const vine = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.03, 6, 32), M.vine); vine.lookAt(ctx.viewDir); vine.rotateX(tilt); vine.userData.noOutline = true; g.add(vine); } // glowing vine loops, facing the camera
    for (let i = 0; i < 3; i++) { const f = P.sphere(0.045, M.firefly, Math.cos(i * 2.1) * 0.85, Math.sin(i * 1.3) * 0.4, Math.sin(i * 2.1) * 0.85, 6); f.userData.noOutline = true; g.add(f); } return g; } },
  audio: { musicPreset: 'jungle', ambientBed: 'jungle', impactTimbre: 'wood', footstepTimbre: 'soft' },
  robotAccent: { emissive: 0x7dff7a, trailColor: 0x9dff8a },
};
