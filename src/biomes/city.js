// Neon city at night: wet asphalt with puddle reflections, lit windows, traffic lights, rain, steam grates.
const PH = { hemiI: 0.5, env: 0.5, shafts: 0, cloud: 0x2a2a44 };
const WIN = 0xffe0a0, NEON = [0xff3fb0, 0x40f0ff, 0xffd23f, 0x7dff7a];
// Building block with a window grid texture on its faces. Origin at the ground.
function building(ctx, M, w, h, d, i) { const { prim: P } = ctx, g = P.group(); g.add(P.box(w, h, d, M.windows[i % M.windows.length], 0, h / 2, 0)); if (i % 3 === 0) g.add(P.box(w * 0.4, 1.2, d * 0.4, M.concrete, 0, h + 0.6, 0)); return g; }
export default {
  id: 'city', displayName: 'Neon City', tagline: 'Rain, neon and puddles that glow',
  palette: { sky: 0x141a3a, fog: 0x1a2040, ground: 0x2a2c33, accent: 0xff3fb0, rim: 0x40f0ff, obstacleTints: [0xffffff, 0xe0f0ff, 0xffe0f0] },
  lighting: { keyColor: 0x9fb8ff, keyIntensity: 0.8, hemiSky: 0x4050a0, hemiGround: 0x201830, fogDensity: 0.011, exposure: 1.1, bloomThreshold: 1.6 },
  startPhase: 3,
  dayNight: [ // dawn (grey-blue), noon (overcast), dusk (purple), night (deep blue, neon rules)
    { ...PH, top: 0x3a4a78, horizon: 0xc09090, fog: 0x585070, sun: 0xffd0b0, sunI: 1.0, hemiSky: 0x8090c0, hemiGround: 0x403040, elev: 0.1, stars: 0.1, eyeLight: 3, trail: 1.0 },
    { ...PH, top: 0x6a7898, horizon: 0xb0b8c8, fog: 0x8a90a0, sun: 0xe8ecf4, sunI: 1.3, hemiSky: 0xb0b8d0, hemiGround: 0x505060, hemiI: 0.6, elev: 0.7, stars: 0, eyeLight: 1, trail: 0.8, cloud: 0xc8ccd8 },
    { ...PH, top: 0x261a4e, horizon: 0xd0507a, fog: 0x3a2050, sun: 0xffa0c0, sunI: 0.9, hemiSky: 0x6040a0, hemiGround: 0x301838, elev: 0.08, stars: 0.3, eyeLight: 6, trail: 1.3 },
    { ...PH, top: 0x05071a, horizon: 0x1c2a5a, fog: 0x121a34, sun: 0x9fb8ff, sunI: 0.55, hemiSky: 0x3040a0, hemiGround: 0x180c28, hemiI: 0.4, env: 0.35, elev: -0.3, stars: 0.8, eyeLight: 7, trail: 1.6 },
  ],

  *makeMaterials(ctx) {
    const { S, std, tex: T, shared } = ctx, { canvasTexture, makeNoiseTexture, clamp255, mix } = T, ST = shared.textures;
    // Window grids: dark facade with a random subset of lit windows (three variants so towers differ).
    const windows = [0, 1, 2].map(v => { const rnd = ctx.rnd(90 + v * 31); const lit = Array.from({ length: 64 * 64 }, () => rnd() < 0.45);
      const map = canvasTexture(S, (x, y) => { const cx = x % 32, cy = y % 24, on = lit[((y / 24) | 0) * 64 + ((x / 32) | 0)]; const inWin = cx > 6 && cx < 26 && cy > 4 && cy < 18; if (inWin && on) return [255, 224, 160]; return inWin ? [30, 34, 50] : [46 + v * 6, 48 + v * 6, 60 + v * 6]; });
      const em = canvasTexture(S, (x, y) => { const cx = x % 32, cy = y % 24, on = lit[((y / 24) | 0) * 64 + ((x / 32) | 0)]; return (cx > 6 && cx < 26 && cy > 4 && cy < 18 && on) ? [255, 210, 140] : [0, 0, 0]; });
      map.repeat.set(2, 6); em.repeat.set(2, 6); return std({ map, emissiveMap: em, emissive: WIN, emissiveIntensity: 1.2, roughness: 0.8 }); }); yield;
    const rust = makeNoiseTexture(S, { scale: 6, octaves: 3, seed: 23 });
    const drumMap = canvasTexture(S, (x, y) => { const r = rust[y * S + x], band = (y % 64) < 6 ? 0.7 : 1; return [clamp255(mix(230, 120, r * r) * band), clamp255(mix(190, 80, r * r) * band), clamp255(mix(40, 30, r) * band)]; }); yield;
    const grate = canvasTexture(64, (x, y) => ((x % 8) < 3 || (y % 8) < 3) ? [40, 42, 48] : [12, 12, 16]);
    return {
      windows, concrete: std({ color: 0x5a5e6c, roughness: 0.95 }), asphaltDark: std({ color: 0x1c1e26, roughness: 0.7, metalness: 0.2 }),
      neon: NEON.map(c => std({ color: c, emissive: c, emissiveIntensity: 3, roughness: 0.4 })),
      pole: std({ map: ST.metalMap, roughnessMap: ST.metalRough, color: 0x6a6e78, roughness: 1, metalness: 0.8 }),
      lamp: std({ color: 0xfff4d0, emissive: 0xffe8b0, emissiveIntensity: 2.5 }),
      cone: std({ color: 0xff6a1a, roughness: 0.6 }), coneBand: std({ color: 0xf8f8f8, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.25 }),
      hydrant: std({ color: 0xe0202a, roughness: 0.55, metalness: 0.2 }), postbox: std({ color: 0x2050d0, roughness: 0.6, metalness: 0.2 }),
      drum: std({ map: drumMap, roughness: 0.7, metalness: 0.3 }),
      drone: std({ color: 0xf0f0f0, roughness: 0.5, metalness: 0.3 }), droneDark: std({ color: 0x2a2e3a, roughness: 0.5, metalness: 0.6 }), rotor: std({ color: 0x222222, transparent: true, opacity: 0.6 }),
      grate: std({ map: grate, roughness: 0.9, metalness: 0.4 }), steam: ctx.basic({ color: 0xe8f0ff, transparent: true, opacity: 0.5, depthWrite: false }),
      trolley: std({ map: ST.metalMap, roughnessMap: ST.metalRough, color: 0xc0c4cc, roughness: 1, metalness: 0.9, wireframe: true }), trolleyBody: std({ color: 0xc0c4cc, transparent: true, opacity: 0.35, roughness: 0.5, metalness: 0.8 }),
      wheel: std({ color: 0x202020, roughness: 0.8 }),
      light: { red: std({ color: 0xff2020, emissive: 0xff2020, emissiveIntensity: 2 }), amber: std({ color: 0xffb020, emissive: 0xffb020, emissiveIntensity: 2 }), green: std({ color: 0x20ff60, emissive: 0x20ff60, emissiveIntensity: 2 }), off: std({ color: 0x202020, roughness: 0.6 }) },
      neonFrame: std({ color: 0xff3fb0, emissive: 0xff3fb0, emissiveIntensity: 1.6, roughness: 0.4 }),
      trace: ctx.basic({ color: 0x40f0ff, transparent: true, opacity: 0.9, blending: 2 }),
      puddleLight: ctx.basic({ color: 0xff3fb0, transparent: true, opacity: 0.25, depthWrite: false, blending: 2 }),
    };
  },

  ground: { // wet asphalt: dark grain, puddles are smooth (dark in the roughness map) so they reflect the environment
    scrollDetail: 1, material: { roughness: 1, metalness: 0.25, envMapIntensity: 1.4, normalScale: { x: 0.35, y: 0.35 } },
    makeTexture(ctx) { const { S, tex: T } = ctx, g = T.makeNoiseTexture(S, { scale: 48, octaves: 2, seed: 7 }), pud = T.makeNoiseTexture(S, { scale: 3, octaves: 3, seed: 8 });
      return T.canvasTexture(S, (x, y) => { const i = y * S + x, k = pud[i] > 0.58 ? 0.55 : 1, v = (34 + g[i] * 22) * k; return [v, v + 1, v + 5]; }); },
    makeNormal(ctx) { const { S, tex: T } = ctx; return T.heightToNormal(T.makeNoiseTexture(S, { scale: 48, octaves: 2, seed: 7 }), S, 0.8); },
    makeRoughness(ctx) { const { S, tex: T } = ctx, pud = T.makeNoiseTexture(S, { scale: 3, octaves: 3, seed: 8 }); return T.canvasTexture(S, (x, y) => { const v = pud[y * S + x] > 0.58 ? 25 : 200; return [v, v, v]; }, { srgb: false }); },
  },
  lane: { width: 3.2, makeTexture: ctx => ctx.tex.canvasTexture(128, (x, y, u, v) => { const centre = Math.abs(v - 0.5) < 0.03 && (x % 32) < 18, edge = Math.abs(v - 0.06) < 0.02 || Math.abs(v - 0.94) < 0.02; return centre ? [255, 210, 60, 170] : edge ? [230, 230, 230, 120] : [0, 0, 0, 0]; }) },

  parallax: [
    { speedFactor: 0.32, y: 0, z: -34, len: 200, makeLayer(ctx, M) { const { prim: P } = ctx, g = P.group(), rnd = ctx.rnd(5); let x = 0, i = 0; // storefronts with neon signs
      while (x < 190) { const w = 8 + rnd() * 10, h = 7 + rnd() * 8; const b = building(ctx, M, w, h, 10, i); b.position.x = x; g.add(b);
        const sign = P.box(w * 0.5, 1.2, 0.3, M.neon[i % 4], 0, 3.5 + rnd() * 2, 5.2); sign.userData.noOutline = true; b.add(sign); x += w + 1 + rnd() * 3; i++; } return g; } },
    { speedFactor: 0.16, y: 0, z: -70, len: 220, makeLayer(ctx, M) { const g = ctx.prim.group(), rnd = ctx.rnd(6); let x = 0, i = 0; while (x < 210) { const w = 10 + rnd() * 14, h = 14 + rnd() * 16; const b = building(ctx, M, w, h, 12, i + 1); b.position.x = x; g.add(b); x += w + rnd() * 6; i++; } return g; } },
    { speedFactor: 0.07, y: 0, z: -125, len: 260, makeLayer(ctx, M) { const g = ctx.prim.group(), rnd = ctx.rnd(7); let x = 0, i = 0; while (x < 250) { const w = 14 + rnd() * 18, h = 30 + rnd() * 40; const b = building(ctx, M, w, h, 16, i + 2); b.position.x = x; g.add(b); x += w + rnd() * 10; i++; } return g; } },
  ],
  props: [
    { count: 6, every: [16, 26], z: [-4.5, -3.5], make: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.cyl(0.08, 0.1, 5, M.pole, 0, 2.5, 0, 8), P.box(1.2, 0.12, 0.2, M.pole, 0.55, 5, 0), P.box(0.5, 0.14, 0.3, M.lamp, 1.1, 4.94, 0)); return g; } }, // street lamp
    { count: 3, every: [40, 80], z: [-6, -4.5], make: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.cyl(0.07, 0.09, 3.6, M.pole, 0, 1.8, 0, 8), P.box(0.4, 1.1, 0.35, M.droneDark, 0, 3.9, 0)); g.userData.lights = M.light;
        ['red', 'amber', 'green'].forEach((c, i) => { const l = P.sphere(0.11, M.light.off, 0, 4.25 - i * 0.35, 0.18, 8); l.name = c; l.userData.noOutline = true; g.add(l); }); return g; },
      update: (g, dt, t) => { const k = Math.floor((t + g.position.x * 0.01) / 2.2) % 3; ['red', 'amber', 'green'].forEach((c, i) => { g.getObjectByName(c).material = i === k ? g.userData.lights[c] : g.userData.lights.off; }); } }, // traffic light cycling
    { count: 3, every: [30, 70], z: [-3.2, -2.2], make: (ctx, M) => { const { prim: P, THREE } = ctx, g = P.group(); g.add(P.box(1.2, 0.06, 0.8, M.grate, 0, 0.03, 0)); const s = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 1.6, 8, 1, true), M.steam); s.position.y = 0.85; s.name = 'puff'; g.add(s); return g; },
      update: (g, dt, t) => { const p = g.getObjectByName('puff'); p.scale.y = 0.6 + 0.4 * Math.sin(t * 2 + g.position.x * 0.1); p.rotation.y += dt; } }, // steam grate
  ],
  particles: {
    ambient: [{ count: 260, color: 0xa8c0ff, size: 0.45, opacity: 0.28, texture: 'streak', vel: [-2, -16, 0], scroll: 0.5, area: { x: [-12, 44], y: [0, 16], z: [-14, -1.5] } }], // rain streaks, behind the lane
    impact: { colors: [0x40f0ff, 0xff3fb0, 0xffffff], n: 40, speed: 9, gravity: -30, life: 0.7 },
    trail: { colors: [0x8fb0ff, 0xc0d8ff] },
  },
  obstacles: { // traffic cone · hydrant + post box · oil drums · delivery drone · manhole steam · runaway trolley
    small: { impact: 'plastic', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.box(0.9, 0.06, 0.9, M.cone, 0, 0.03, 0), P.cone(0.32, 0.95, M.cone, 0, 0.5, 0, 12), P.cyl(0.2, 0.25, 0.14, M.coneBand, 0, 0.62, 0, 12)); return g; } },
    tall: { impact: 'metal', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.cyl(0.24, 0.3, 0.9, M.hydrant, 0, 0.45, 0, 10), P.sphere(0.24, M.hydrant, 0, 0.9, 0, 10), P.cyl(0.1, 0.1, 0.5, M.hydrant, 0, 0.55, 0, 8).rotateX(Math.PI / 2), P.box(0.78, 0.62, 0.62, M.postbox, 0, 1.45, 0), P.cyl(0.36, 0.36, 0.22, M.postbox, 0, 1.79, 0, 12)); return g; } },
    wide: { impact: 'metal', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(); for (const x of [-0.8, 0, 0.8]) g.add(P.cyl(0.4, 0.4, 1.2, M.drum, x, 0.6, 0, 14)); return g; } },
    flyer: { impact: 'plastic', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.box(0.6, 0.34, 0.6, M.drone, 0, -0.05, 0), P.box(0.35, 0.3, 0.35, M.droneDark, 0, -0.32, 0), P.box(0.5, 0.1, 0.5, M.droneDark, 0, 0.16, 0));
      for (const [x, z] of [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]]) { g.add(P.box(0.45, 0.05, 0.05, M.droneDark, x / 2, 0.14, z / 2).rotateY(z * x > 0 ? -Math.PI / 4 : Math.PI / 4)); const r = P.cyl(0.18, 0.18, 0.03, M.rotor, x, 0.3, z, 10); r.name = 'spin'; r.userData.noOutline = true; g.add(r); }
      const eye = P.sphere(0.07, M.neon[0], 0, -0.1, 0.32, 8); eye.userData.noOutline = true; g.add(eye); return g; } },
    hazard: { impact: 'steam', makeMesh: (ctx, M) => { const { prim: P, THREE } = ctx, g = P.group(); g.add(P.cyl(0.6, 0.6, 0.12, M.grate, 0, 0.06, 0, 16), P.cyl(0.42, 0.42, 0.04, M.asphaltDark, 0, 0.14, 0, 16));
      const steam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.55, 1.85, 10, 1, true), M.steam); steam.position.y = 1.07; steam.name = 'plume'; steam.userData.noOutline = true; g.add(steam); return g; } },
    chaser: { impact: 'metal', makeMesh: (ctx, M) => { const { prim: P } = ctx, g = P.group(); g.add(P.box(1.0, 0.6, 0.6, M.trolleyBody, 0, 0.7, 0), P.box(1.02, 0.62, 0.62, M.trolley, 0, 0.7, 0), P.box(0.05, 0.5, 0.6, M.pole, 0.5, 0.85, 0));
      for (const [x, z] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]]) { const w = P.cyl(0.11, 0.11, 0.08, M.wheel, x, 0.11, z, 10).rotateX(Math.PI / 2); w.name = 'roll'; w.userData.r = 0.11; g.add(w); }
      return g; } },
  },
  pickup: { makePickupShell: (ctx, M) => { const { prim: P } = ctx, g = P.group(); // open neon frame around the core; a flickering circuit trace; a puddle of light beneath
    const e = 0.5, t = 0.05; for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { g.add(P.box(2 * e, t, t, M.neonFrame, 0, a * e, b * e), P.box(t, 2 * e, t, M.neonFrame, a * e, 0, b * e), P.box(t, t, 2 * e, M.neonFrame, a * e, b * e, 0)); }
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) g.add(P.box(0.12, 0.12, 0.12, M.droneDark, x * e, y * e, z * e));
    const trace = P.plane(0.5, 0.08, M.trace, 0, -0.3, e + 0.01); trace.name = 'flicker'; trace.userData.noOutline = true; g.add(trace);
    const pool = P.plane(1.6, 1.6, M.puddleLight, 0, -1.15, 0); pool.rotation.x = -Math.PI / 2; pool.userData.noOutline = true; g.add(pool); return g; } },
  audio: { musicPreset: 'city', impactTimbre: 'metal', footstepTimbre: 'wet' },
  robotAccent: { emissive: 0xff40c0, trailColor: 0xff60d0 },
};
