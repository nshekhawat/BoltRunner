import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { CONFIG as C } from './config.js';
import { makeSharedMaterials } from './textures.js';
import { BIOMES, BIOME_IDS, buildBiome, buildBiomeSync, disposeBiome, disposeBiomeChunked } from './biomes/index.js';
import { Select } from './select.js';
import { Journey } from './journey.js';
import { World } from './world.js';
import { Particles } from './fx.js';
import { Game } from './game.js';
import { hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { store, save } from './store.js';
import { contrastTest } from './debug.js';
import { Settings } from './settings.js';
import { HC } from './textures.js';
import { setPalette } from './obstacles.js';
import { PALETTES } from './palettes.js';

const loadBar = document.getElementById('loadbar'), loadText = document.getElementById('loadtext');
const progress = (pct, text) => { loadBar.style.width = pct + '%'; loadText.textContent = text; return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); };

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, C.MAX_PIXEL_RATIO));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(C.FOV_BASE, 1, 0.1, 400);

await progress(10, 'Polishing the robot…');
const shared = makeSharedMaterials();
const world = new World(scene, shared, camera);
const game = new Game(scene, shared);
const params = new URLSearchParams(location.search); world.phaseOffset = +(params.get('phase') ?? 0); // debug: ?phase=2 starts two phases in
await progress(35, 'Painting the world…');
let biome = null;
// Swap the whole environment. Everything the old biome owned is disposed; renderer.info.memory must return to the same numbers.
function applyBiome(next, prebuilt = null, deferDispose = false) {
  const old = biome; world.setBiome(next, !old); const oldGeos = game.setBiome(next, prebuilt); biome = next;
  if (old) { const gen = disposeBiomeChunked(old, oldGeos); if (deferDispose) { const step = () => { if (!gen.next().done) idle(step); }; idle(step); } else for (const _ of gen); }
  renderer.toneMappingExposure = next.def.lighting.exposure; // per-biome exposure; bloom threshold set below (High-Contrast overrides it)
  hud.biome(next.def); audio.setBiome(next.def.audio); if (!HC.desat.value) bloom.threshold = next.def.lighting.bloomThreshold; return next;
}
const switchBiome = id => applyBiome(buildBiomeSync(BIOMES[id], shared)); // synchronous (startup, debug)
// Chunked build on idle time: one generator step per idle callback so the frame never stalls. Resolves with the built instance.
const idle = fn => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 120 }) : setTimeout(fn, 0));
function prepareBiome(id, onProgress) {
  return new Promise(res => { const gen = buildBiome(BIOMES[id], shared); let n = 0; const step = () => { const r = gen.next(); onProgress?.(Math.min(1, ++n / 9)); if (r.done) res(r.value); else idle(step); }; idle(step); });
}
const fx = new Particles(scene, shared.textures.dot);
const audio = new AudioEngine();
await progress(70, 'Bouncing light around…');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();
await progress(85, 'Checking your graphics…');
// Quality tier: URL override > saved choice > GPU heuristic refined by a 1-second FPS probe.
function guessTier() {
  const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  if (/swiftshader|llvmpipe|software/i.test(gpu)) return 'low';
  if (/intel|mali|adreno|powervr/i.test(gpu) && devicePixelRatio > 1.5) return 'medium';
  return 'high';
}
async function probeFps(tier) {
  setQuality(tier); let frames = 0; const t0 = performance.now();
  while (performance.now() - t0 < 1000) { await new Promise(r => requestAnimationFrame(r)); composer.render(); frames++; }
  return frames * 1000 / (performance.now() - t0);
}

// ---- Post-processing ---------------------------------------------------------
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.45, 1.15); // threshold above any lit albedo: only emissives bloom
const vignette = new ShaderPass(VignetteShader); vignette.uniforms.offset.value = 0.6; vignette.uniforms.darkness.value = 1.0; // darkness 1 = mix toward black at the corners only; lower values grey out the whole frame
const smaa = new SMAAPass(); const output = new OutputPass();
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(output); composer.addPass(vignette); composer.addPass(smaa);
switchBiome(params.get('biome') in BIOMES ? params.get('biome') : 'desert');
const TIERS = ['high', 'medium', 'low'], motion = { shake: true, reduce: false }; let camDist = 1; // motion: settings (screen shake / reduce motion)
let quality = 'high', autoQuality = true;
export function setQuality(q, persist = false) {
  quality = q; hud.quality(q, autoQuality);
  bloom.enabled = q === 'high'; renderer.shadowMap.enabled = q !== 'low';
  world.sun.castShadow = q !== 'low'; world.sun.shadow.mapSize.setScalar(q === 'high' ? 2048 : 1024); if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  fx.budget = (q === 'low' ? 0.4 : 1) * (motion.reduce ? 0.5 : 1); for (const s of world.shafts) s.visible = q !== 'low';
  renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'low' ? 1 : C.MAX_PIXEL_RATIO)); resize();
}

// ---- Camera -------------------------------------------------------------------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), camTarget = new THREE.Vector3(...C.CAMERA_POS), lookTarget = new THREE.Vector3(...C.CAMERA_LOOK);
camPos.copy(camTarget); camLook.copy(lookTarget); let shake = 0;
export function applyFov(base) {
  const a = camera.aspect; // keep the horizontal field of view constant on narrow (portrait) screens
  camera.fov = a >= C.MIN_ASPECT_FOV ? base : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * C.MIN_ASPECT_FOV / a));
  camera.updateProjectionMatrix();
}
let orbitT = 0;
function updateCamera(dt) {
  const p = game.player, norm = Math.min(1, Math.max(0, (game.speed - C.SPEED_START) / (C.SPEED_CAP.normal - C.SPEED_START)));
  const narrow = Math.max(0, 1 - camera.aspect); // portrait: pull the framing toward the robot so it is not cut off at the left edge
  if (game.state === 'SELECT') { orbitT += dt * 0.22; camTarget.set(Math.cos(orbitT) * 6.5, 2.0 + narrow, Math.sin(orbitT) * 6.5); lookTarget.set(0, 0.2 - narrow * 0.6, 0); } // select screen: slow orbit around the idle robot
  else { camTarget.set((C.CAMERA_POS[0] + narrow * 3) * camDist, (C.CAMERA_POS[1] + p.y * 0.25) * camDist, (C.CAMERA_POS[2] + narrow * 2) * camDist); lookTarget.set(C.CAMERA_LOOK[0] - narrow * 4, C.CAMERA_LOOK[1] + p.y * 0.35, C.CAMERA_LOOK[2]); }
  const k = 1 - Math.exp(-C.CAMERA_SPRING * dt);
  camPos.lerp(camTarget, k); camLook.lerp(lookTarget, k);
  shake = Math.max(0, shake - dt);
  const sh = shake > 0 && motion.shake && !motion.reduce ? C.SHAKE_AMOUNT * (shake / C.SHAKE_TIME) : 0;
  camera.position.set(camPos.x + (Math.random() - 0.5) * sh, camPos.y + (Math.random() - 0.5) * sh, camPos.z);
  camera.lookAt(camLook);
  applyFov(C.FOV_BASE + (motion.reduce ? 0 : C.FOV_PUSH * norm));
}

// ---- Effects hooks ----------------------------------------------------------------
const CONFETTI = [0xff5c8a, 0x40e8ff, 0xffe27a, 0x7dff7a, 0xc07dff];
game.on('hit', o => { const P = biome.def.particles.impact; shake = C.SHAKE_TIME; fx.emit(0.2, 1.1, 0.3, P.n, P.colors, P.speed, P.gravity, P.life); audio.shieldLost(); audio.impact(biome.def.obstacles[o.userData.def.arch].impact); })
    .on('milestone', () => { fx.emit(0, 1.5, 0.2, 60, CONFETTI, 7, -12, 1.4); audio.milestone(); })
    .on('pickup', () => { fx.emit(0, 1.4, 0.3, 30, [0xffffff, 0x40e8ff], 5, -6, 0.9); audio.pickup(); })
    .on('land', () => { fx.emit(0, 0.05, 0.2, 8, biome.def.particles.trail.colors, 3, -8, 0.5, 0.4); audio.land(biome.def.audio.footstepTimbre); })
    .on('erupt', () => { const v = game.obstacles.active.find(o => o.userData.def.telegraph && o.userData.phase === 2); if (v) fx.emit(v.position.x, 0.5, 0, 30, [0xffffff, 0xe0f0ff], 4, 3, 1.2, 0.3); audio.erupt(); })
    .on('tutorial', () => audio.pickup())
    .on('jump', () => audio.jump()).on('duck', () => audio.duck()).on('step', s => audio.step(s, biome.def.audio.footstepTimbre)).on('hiss', () => audio.hiss())
    .on('countdown', i => audio.countdown(i)).on('click', () => audio.uiClick()).on('newbest', () => audio.newBest())
    .on('state', s => { if (s === 'PLAYING') audio.startMusic(); else if (s === 'CRASHED' || s === 'MENU') audio.stopMusic(); console.log('state', s); })
    .on('crashed', s => console.log('crashed', JSON.stringify(s)));

// Browsers block audio until a gesture: keep the loading card up as a "tap to start" screen until then.
const loading = document.getElementById('loading');
function firstGesture(e) {
  e.stopImmediatePropagation(); audio.unlock(); game.ready = true; loading.classList.add('done'); game.setState('MENU'); hud.muted(audio.muted);
  removeEventListener('keydown', firstGesture, true); removeEventListener('pointerdown', firstGesture, true);
}

function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; applyFov(C.FOV_BASE); }
addEventListener('resize', resize); resize();
// ---- Journey ---------------------------------------------------------------------------------------------------
const journey = new Journey(scene, shared);
// Shader programs differ between on-screen and render-target output (tone mapping lives in the shader), so compile under the target the tier renders to.
const parallelCompile = !!renderer.getContext().getExtension('KHR_parallel_shader_compile');
async function compileFor(obj) { renderer.setRenderTarget(quality === 'low' ? null : composer.readBuffer); try { parallelCompile ? await renderer.compileAsync(obj, camera, scene) : renderer.compile(obj, camera, scene); } finally { renderer.setRenderTarget(null); } }
journey.gate.visible = true; await compileFor(journey.gate); journey.gate.visible = false; // no shader compile on the first gateway
// Everything the swap needs, built on idle time: biome instance, obstacle pools, and compiled shaders. The swap itself is then a few scene ops.
async function preparePending(id) {
  const inst = await prepareBiome(id);
  const pools = await new Promise(res => { const gen = game.obstacles.buildPools(inst); const step = () => { const r = gen.next(); r.done ? res(r.value) : idle(step); }; step(); });
  const tmp = new THREE.Group(); const groups = [inst.root, ...Object.values(pools.pools).flat(), ...pools.shells];
  for (const g of groups) { g.visible = true; tmp.add(g); }
  await compileFor(tmp);
  for (const g of groups) { tmp.remove(g); if (g !== inst.root) g.visible = false; }
  return { inst, pools };
}
const journeyHooks = {
  prepare: preparePending,
  swap: p => { applyBiome(p.inst, p.pools, true); hud.message(p.inst.def.displayName, 1.6, false, true); },
  discard: p => { if (p.pools) for (const g of Object.values(p.pools.pools).flat()) g.traverse(o => o.geometry?.dispose()); if (p.inst) disposeBiome(p.inst); },
  hold: (v, exitX) => game.obstacles.hold(v, exitX), last: () => game.obstacles.spawner.last, accent: id => BIOMES[id].palette.accent,
};
game.on('state', s => { if (s === 'PLAYING' && game.prevState === 'COUNTDOWN') { if (game.journey) { journey.begin(biome.def.id); world.startPhaseOverride = biome.def.startPhase; } else journey.end(journeyHooks); } else if (s === 'CRASHED' || s === 'MENU' || s === 'SELECT') { journey.end(journeyHooks); world.startPhaseOverride = null; } });

// ---- Select screen ---------------------------------------------------------------------------------------------
let highlightToken = 0;
const select = new Select({
  onHighlight(card) { // build the highlighted biome behind the card's progress bar; a later highlight cancels this one
    const id = card.id === 'journey' ? BIOME_IDS[0] : card.id === 'surprise' ? BIOME_IDS[(Math.random() * BIOME_IDS.length) | 0] : card.id;
    if (biome?.def.id === id) { select.progress(1); return; }
    const token = ++highlightToken; select.progress(0);
    prepareBiome(id, p => { if (token === highlightToken) select.progress(p); }).then(inst => { if (token === highlightToken) { applyBiome(inst); select.progress(1); } else disposeBiome(inst); });
  },
  async onPick(card) {
    if (card.id === 'surprise' || card.id === 'journey') game.runKey = card.id; else game.runKey = card.id;
    store.biome = card.id; save();
    const want = card.id === 'journey' ? BIOME_IDS[0] : card.id === 'surprise' ? biome.def.id : card.id;
    if (biome?.def.id !== want) applyBiome(await prepareBiome(want));
    game.journey = card.id === 'journey'; game.startRun(); audio.uiClick();
  },
  onBack() { game.setState('MENU'); audio.uiClick(); },
});
game.select = select; select.i = Math.max(0, CARDS_INDEX(store.biome));
function CARDS_INDEX(id) { return [...BIOME_IDS, 'surprise', 'journey'].indexOf(id); }
game.on('state', s => { select.show(s === 'SELECT', store); hud.show(s !== 'SELECT'); if (s === 'SELECT') orbitT = Math.PI * 0.35; });

// ---- Settings ------------------------------------------------------------------------------------------------------
let settingsFrom = null;
async function autoTier() { let tier = guessTier(); if (tier !== 'low') { const fps = await probeFps(tier); if (fps < 30) tier = 'low'; else if (fps < 50 && tier === 'high') tier = 'medium'; } autoQuality = true; setQuality(tier); }
const settings = new Settings({
  apply(key, v, initial, S) {
    switch (key) {
      case 'difficulty': game.setMode(v); break;
      case 'jumpAssist': game.jumpAssist = v; break;
      case 'startSpeed': game.startSpeed = v; break;
      case 'quality': if (initial) break; if (v === 'auto') autoTier(); else { autoQuality = false; setQuality(v); } break;
      case 'highContrast': HC.desat.value = v ? 0.6 : 0; HC.sat.value = v ? 0.6 : 0; document.body.classList.toggle('hc', v); bloom.threshold = v ? 3 : biome.def.lighting.bloomThreshold; break; // bloom off for scenery: only the pickup core exceeds 3
      case 'reduceMotion': motion.reduce = v; fx.budget = (quality === 'low' ? 0.4 : 1) * (v ? 0.5 : 1); break;
      case 'screenShake': motion.shake = v; break;
      case 'palette': setPalette(v); document.documentElement.style.setProperty('--heart', PALETTES[v].heart); document.documentElement.style.setProperty('--accent', PALETTES[v].accent); break;
      case 'showFps': hud.el.fps.hidden = !v; break;
      case 'cameraDistance': camDist = v; break;
      case 'mute': audio.setMuted(v); hud.muted(v); break;
      case 'music': case 'sfx': audio.setVolumes(S.s.music, S.s.sfx); break;
      case 'ambience': audio.setAmbience(v); break;
      case 'jumpKey': case 'duckKey': game.setKeys(S.s.jumpKey, S.s.duckKey); break;
      case 'touchLayout': document.body.classList.toggle('hand-left', v === 'left'); document.body.classList.toggle('hand-right', v !== 'left'); break;
      case 'holdSensitivity': C.JUMP_MIN_HEIGHT = { short: 0.6, normal: 1.0, long: 1.6 }[v] ?? 1.0; break;
      case 'sessionMinutes': game.sessionLimit = v * 60; break;
    }
  },
  close() { settings.show(false); audio.uiClick(); },
  reset() { if (confirm('Reset ALL progress? Records, unlocks and settings will be cleared.')) { try { localStorage.removeItem(C.STORAGE_KEY); } catch { /* blocked storage */ } location.reload(); } },
});
game.settings = settings;
const openSettings = () => { settingsFrom = game.state; if (game.state === 'PLAYING' || game.state === 'COUNTDOWN') game.pause(); settings.show(true); audio.uiClick(); };
document.getElementById('settingsbtn').onclick = openSettings; document.getElementById('pausesettings').onclick = openSettings;
game.on('modeChanged', m => settings.set('difficulty', m));
game.on('closeSettings', () => settings.hooks.close());
game.on('break', () => { document.getElementById('break').hidden = false; audio.milestone(); });
document.getElementById('breakbtn').onclick = () => { document.getElementById('break').hidden = true; game.onBreak = false; game.resume(); audio.uiClick(); };
game.on('mute', () => settings.set('mute', !settings.s.mute)); // M key / speaker icon route through settings so it persists there
{
  const urlQ = params.get('q');
  if (urlQ && TIERS.includes(urlQ)) { autoQuality = false; setQuality(urlQ); }
  else if (settings.s.quality !== 'auto') { autoQuality = false; setQuality(settings.s.quality); }
  else await autoTier();
}
hud.el.quality.onclick = () => { // Auto → High → Medium → Low → Auto
  const i = autoQuality ? -1 : TIERS.indexOf(quality); const next = i + 1;
  settings.set('quality', next >= TIERS.length ? 'auto' : TIERS[next]); audio.uiClick();
};
await progress(100, 'Tap or press SPACE to start');
hud.show(true); loading.classList.add('ready');
addEventListener('keydown', firstGesture, true); addEventListener('pointerdown', firstGesture, true);

let last = performance.now(), frames = 0, fpsT = 0, lowFpsT = 0, breathT = 0, bgT = 0, cpuMs = 0;
renderer.setAnimationLoop(now => {
  const raw = (now - last) / 1000, dt = Math.min(raw, C.MAX_DT); last = now; journey.frame(raw, cpuMs); const cpu0 = performance.now();
  const paused = game.state === 'PAUSED';
  const P = {}; let pt = performance.now(); const mark = k => { const n = performance.now(); P[k] = +(n - pt).toFixed(1); pt = n; }; P.t = journey.t; P.st = journey.state;
  if (!paused) {
    game.update(dt * game.timeScale); mark('game'); // timeScale: tutorial beat / slow-mo. HUD timers inside use the same scaled clock (they are brief).
    const gdt = dt * game.timeScale;
    if (game.state === 'PLAYING') journey.update(gdt, game.score, game.speed, journeyHooks); mark('journey');
    world.update(gdt, game.speed, game.score); game.robot.trailBright = world.trailBright; mark('world');
    fx.update(gdt, game.speed); updateCamera(dt);
    const br = biome.def.particles.breath; if (br && game.state === 'PLAYING') { breathT += dt; if (breathT > br.every) { breathT = 0; fx.emit(0.4, game.player.y + 1.55, 0.3, 5, br.colors, 0.8, 0.6, 0.9, 0.3); } }
    audio.setMood(Math.min(1, Math.max(0, (game.speed - C.SPEED_START) / (C.SPEED_CAP.normal - C.SPEED_START))), world.cur.stars);
  }
  frames++; fpsT += raw; if (fpsT >= 0.5) { const fps = frames / fpsT, mem = renderer.info.memory; hud.fps(`${Math.round(fps)} FPS · ${quality} · geo ${mem.geometries} tex ${mem.textures} · ${biome.def.id}/${world.phaseName}`); frames = 0; fpsT = 0;
    // Auto-downgrade: sustained low FPS during play drops one tier (never while paused or on the first seconds after a switch).
    if (autoQuality && game.state === 'PLAYING' && fps < C.FPS_DOWNGRADE_BELOW) { lowFpsT += 0.5; if (lowFpsT >= C.FPS_DOWNGRADE_AFTER && quality !== 'low') { setQuality(TIERS[TIERS.indexOf(quality) + 1]); hud.message('Quality → ' + quality, 1.2); lowFpsT = -3; } } else lowFpsT = Math.max(0, lowFpsT);
  }
  mark('misc'); if (quality === 'low') renderer.render(scene, camera); else composer.render(); mark('render');
  bgT += raw; if (bgT > 1.5 && !paused) { bgT = 0; game.obstacles.measureBackground(renderer, camera); } game.obstacles.pollBackground(renderer); // pickup contrast plate follows the real background (async readback)
  cpuMs = performance.now() - cpu0; if (cpuMs > 12 && journey.active) (window.__slow ??= []).push({ ...P, cpu: +cpuMs.toFixed(1), score: game.score });
});
window.bolt = { game, world, renderer, scene, camera, journey, setQuality, switchBiome, get biome() { return biome; }, contrastTest: o => contrastTest(window.bolt, o) }; // debug handle
console.log('three', THREE.REVISION);
