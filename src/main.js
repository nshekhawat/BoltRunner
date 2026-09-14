import { BENCH } from './seed.js'; // must come first: seeds Math.random in benchmark mode
import * as THREE from 'three';
import { Perf } from './perf.js';
import { Bench } from './bench.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { CONFIG as C } from './config.js';
import { makeSharedMaterials } from './textures.js';
import { BIOMES, BIOME_IDS, buildBiome, buildBiomeSync, disposeBiome, disposeBiomeChunked, NOISE_LISTS } from './biomes/index.js';
import { prefetch as prefetchNoise } from './noise.js';
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
import { PAINTS, TOPPERS, TRAILS, UNLOCKS, unlocked, nextUnlock, labelOf } from './cosmetics.js';
import { STYLES } from './robot.js';
import { STICKERS, earned } from './stickers.js';

const loadBar = document.getElementById('loadbar'), loadText = document.getElementById('loadtext');
const progress = (pct, text) => { loadBar.style.width = pct + '%'; loadText.textContent = text; return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); };

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); // antialias covers the Low tier (direct render)
renderer.setPixelRatio(Math.min(devicePixelRatio, C.MAX_PIXEL_RATIO));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const perf = new Perf(renderer);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(C.FOV_BASE, 1, 0.1, 400);

await progress(10, 'Polishing the robot…');
const shared = makeSharedMaterials();
const world = new World(scene, shared, camera);
const game = new Game(scene, shared);
const params = new URLSearchParams(location.search);
await progress(35, 'Painting the world…');
let biome = null, bgOnce = false;
const TIERS = ['high', 'medium', 'low']; let camDist = 1, quality = 'high', autoQuality = true;
// Swap the whole environment. Everything the old biome owned is disposed; renderer.info.memory must return to the same numbers.
function applyBiome(next, prebuilt = null, deferDispose = false) {
  const old = biome; world.setBiome(next, !old); const oldGeos = game.setBiome(next, prebuilt); biome = next; bgOnce = true;
  if (!prebuilt) warmUp(); // sync path (startup, select screen, debug): compile + first-draw every program now, not on the first obstacle of the run
  if (old) { const gen = disposeBiomeChunked(old, oldGeos); if (deferDispose) { const step = () => { if (!gen.next().done) idle(step); }; idle(step); } else for (const _ of gen); }
  renderer.toneMappingExposure = next.def.lighting.exposure; // per-biome exposure; bloom threshold set below (High-Contrast overrides it)
  hud.biome(next.def); audio.setBiome(next.def.audio); if (!HC.desat.value) bloom.threshold = next.def.lighting.bloomThreshold; return next;
}
const switchBiome = id => { const inst = applyBiome(buildBiomeSync(BIOMES[id], shared)); rememberNoise(id); return inst; }; // synchronous (startup, debug)
// Chunked build on idle time: one generator step per idle callback so the frame never stalls. Resolves with the built instance.
const idle = fn => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 120 }) : setTimeout(fn, 0));
// The noise fields the build needs (learned on the biome's first build, persisted) are computed in a Worker first, so every idle step is a few ms.
async function prepareBiome(id, onProgress) {
  await prefetchNoise(NOISE_LISTS[id] ?? store.noise[id]);
  return new Promise(res => { const gen = buildBiome(BIOMES[id], shared); let n = 0; const step = () => { const r = gen.next(); onProgress?.(Math.min(1, ++n / 12)); if (r.done) { rememberNoise(id); res(r.value); } else idle(step); }; idle(step); });
}
function rememberNoise(id) { const l = NOISE_LISTS[id]; if (l && JSON.stringify(store.noise[id]) !== JSON.stringify(l)) { store.noise[id] = l; save(); } }
const fx = new Particles(scene, shared.textures.dot);
const journey = new Journey(scene, shared);
const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), new THREE.MeshStandardMaterial({ color: 0x8fd0ff, emissive: 0x3080ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.28, roughness: 0.2, depthWrite: false })); bubble.visible = false; scene.add(bubble);
// Programs compile on first draw (and the GPU process links them asynchronously, so even renderer.compile() leaves a stall for the first
// real frame). Draw everything hidden once into a 4×4 target: every pooled obstacle, pickup, orb, bubble, ghost and the gateway.
const warmTarget = new THREE.WebGLRenderTarget(4, 4); const warmList = [];
function warmUp(extra = null) {
  warmList.length = 0; for (const list of Object.values(game.obstacles.pools)) for (const g of list) warmList.push(g); warmList.push(...game.obstacles.pickups, game.obstacles.power, bubble, game.ghost.group, journey.gate);
  const tmp = extra ? new THREE.Group() : null; if (tmp) { for (const g of extra) { warmList.push(g); tmp.add(g); } scene.add(tmp); }
  const vis = warmList.map(g => g.visible); for (const g of warmList) { g.visible = true; g.traverse(o => { o.userData.fc = o.frustumCulled; o.frustumCulled = false; }); }
  const t0 = performance.now();
  if (quality === 'low') { renderer.setScissorTest(true); renderer.setScissor(0, 0, 4, 4); renderer.render(scene, camera); renderer.setScissorTest(false); } // screen programs differ from render-target ones
  else { renderer.setRenderTarget(warmTarget); renderer.render(scene, camera); renderer.setRenderTarget(null); }
  warmList.forEach((g, i) => { g.visible = vis[i]; g.traverse(o => { o.frustumCulled = o.userData.fc ?? true; }); });
  if (tmp) { for (const g of extra) tmp.remove(g); scene.remove(tmp); }
  perf.note(`warm-up ${(performance.now() - t0).toFixed(1)} ms, ${renderer.info.programs.length} programs`);
}
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
// MSAA on the composer's target replaces the SMAA pass: better edges for a fraction of the cost (one resolve instead of three full-screen passes).
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }));
const renderPass = new RenderPass(scene, camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.45, 1.15); // threshold above any lit albedo: only emissives bloom
const vignette = new ShaderPass(VignetteShader); vignette.uniforms.offset.value = 0.6; vignette.uniforms.darkness.value = 1.0; // darkness 1 = mix toward black at the corners only; lower values grey out the whole frame
const output = new OutputPass();
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(output); composer.addPass(vignette);
switchBiome(params.get('biome') in BIOMES ? params.get('biome') : 'desert');
export function setQuality(q, persist = false) {
  quality = q; hud.quality(q, autoQuality);
  bloom.enabled = q === 'high'; renderer.shadowMap.enabled = q !== 'low';
  world.sun.castShadow = q !== 'low'; world.sun.shadow.mapSize.setScalar(q === 'high' ? 1024 : 512); if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  fx.budget = q === 'low' ? 0.4 : 1; world.shaftsAllowed = q !== 'low'; if (world.cur) world.applyState();
  renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'low' ? 1 : matchMedia('(pointer: coarse)').matches ? C.MOBILE_PIXEL_RATIO : C.MAX_PIXEL_RATIO)); resize();
  if (biome) warmUp(); // programs differ per tier (shadows, screen vs render target): re-warm so the first frames of a run compile nothing
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
  const py = game.renderY, norm = Math.min(1, Math.max(0, (game.speed - C.SPEED_START) / (C.SPEED_CAP.normal - C.SPEED_START)));
  const narrow = Math.max(0, 1 - camera.aspect); // portrait: pull the framing toward the robot so it is not cut off at the left edge
  if (photo) { camTarget.set(Math.cos(photoA) * 7 * camDist, photoH, Math.sin(photoA) * 7 * camDist); lookTarget.set(0, 1.0 + py * 0.5, 0); }
  else if (game.state === 'SELECT') { orbitT += dt * 0.22; camTarget.set(Math.cos(orbitT) * 6.5, 2.0 + narrow, Math.sin(orbitT) * 6.5); lookTarget.set(0, 0.2 - narrow * 0.6, 0); } // select screen: slow orbit around the idle robot
  else { camTarget.set((C.CAMERA_POS[0] + narrow * 3) * camDist, (C.CAMERA_POS[1] + py * 0.25) * camDist, (C.CAMERA_POS[2] + narrow * 2) * camDist); lookTarget.set(C.CAMERA_LOOK[0] - narrow * 4, C.CAMERA_LOOK[1] + py * 0.35, C.CAMERA_LOOK[2]); }
  const k = 1 - Math.exp(-C.CAMERA_SPRING * dt);
  camPos.lerp(camTarget, k); camLook.lerp(lookTarget, k);
  shake = Math.max(0, shake - dt);
  const sh = shake > 0 ? C.SHAKE_AMOUNT * (shake / C.SHAKE_TIME) : 0;
  camera.position.set(camPos.x + (Math.random() - 0.5) * sh, camPos.y + (Math.random() - 0.5) * sh, camPos.z);
  camera.lookAt(camLook);
  applyFov(C.FOV_BASE + C.FOV_PUSH * norm);
}

// ---- Effects hooks ----------------------------------------------------------------
const CONFETTI = [0xff5c8a, 0x40e8ff, 0xffe27a, 0x7dff7a, 0xc07dff], ROCKET_COLORS = [0xff9a3a, 0xffe27a, 0xffffff];
game.on('hit', o => { const P = biome.def.particles.impact; shake = C.SHAKE_TIME; fx.emit(0.2, 1.1, 0.3, P.n, P.colors, P.speed, P.gravity, P.life); audio.shieldLost(); audio.impact(biome.def.obstacles[o.userData.def.arch].impact); })
    .on('milestone', () => { fx.emit(0, 1.5, 0.2, 60, CONFETTI, 7, -12, 1.4); audio.milestone(); })
    .on('pickup', () => { fx.emit(0, 1.4, 0.3, 30, [0xffffff, 0x40e8ff], 5, -6, 0.9); audio.pickup(); })
    .on('land', () => { fx.emit(0, 0.05, 0.2, 8, biome.def.particles.trail.colors, 3, -8, 0.5, 0.4); audio.land(biome.def.audio.footstepTimbre); })
    .on('erupt', () => { const v = game.obstacles.active.find(o => o.userData.def.telegraph && o.userData.phase === 2); if (v) fx.emit(v.position.x, 0.5, 0, 30, [0xffffff, 0xe0f0ff], 4, 3, 1.2, 0.3); audio.erupt(); })
    .on('tutorial', () => audio.pickup())
    .on('jump', () => audio.jump()).on('step', s => audio.step(s, biome.def.audio.footstepTimbre)).on('hiss', () => audio.hiss())
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
// Shader programs differ between on-screen and render-target output (tone mapping lives in the shader), so compile under the target the tier renders to.
const parallelCompile = !!renderer.getContext().getExtension('KHR_parallel_shader_compile');
async function compileFor(obj) { renderer.setRenderTarget(quality === 'low' ? null : composer.readBuffer); try { parallelCompile ? await renderer.compileAsync(obj, camera, scene) : renderer.compile(obj, camera, scene); } finally { renderer.setRenderTarget(null); } }
journey.gate.position.x = 900; // parked far away; warmUp() draws it hidden with everything else
// Everything the swap needs, built on idle time: biome instance, obstacle pools, and compiled shaders. The swap itself is then a few scene ops.
async function preparePending(id) {
  const inst = await prepareBiome(id);
  const pools = await new Promise(res => { const gen = game.obstacles.buildPools(inst); const step = () => { const r = gen.next(); r.done ? res(r.value) : idle(step); }; step(); });
  const groups = [inst.root, ...Object.values(pools.pools).flat(), ...pools.shells];
  const tmp = new THREE.Group(); for (const g of groups) { g.visible = true; tmp.add(g); } await compileFor(tmp); for (const g of groups) tmp.remove(g); // link programs without blocking (KHR_parallel_shader_compile)…
  await new Promise(r => idle(r)); warmUp(groups); // …then draw everything once, hidden, in an idle slot: uploads + first draw, so the swap frame compiles nothing
  for (const g of groups) if (g !== inst.root) g.visible = false;
  return { inst, pools };
}
const journeyHooks = {
  prepare: preparePending,
  swap: p => { applyBiome(p.inst, p.pools, true); hud.message(p.inst.def.displayName, 1.6, false, true); },
  discard: p => { if (p.pools) for (const g of Object.values(p.pools.pools).flat()) g.traverse(o => o.geometry?.dispose()); if (p.inst) disposeBiome(p.inst); },
  hold: (v, exitX) => game.obstacles.hold(v, exitX), last: () => game.obstacles.spawner.last, accent: id => BIOMES[id].palette.accent,
};
game.on('state', s => { if (s === 'PLAYING' && game.prevState === 'COUNTDOWN') { if (game.journey) journey.begin(biome.def.id); else journey.end(journeyHooks); } else if (s === 'CRASHED' || s === 'MENU' || s === 'SELECT') journey.end(journeyHooks); });

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
      case 'startSpeed': game.startSpeed = v; break;
      case 'quality': if (initial) break; if (v === 'auto') autoTier(); else { autoQuality = false; setQuality(v); } break;
      case 'highContrast': HC.desat.value = v ? 0.6 : 0; HC.sat.value = v ? 0.6 : 0; document.body.classList.toggle('hc', v); bloom.threshold = v ? 3 : biome.def.lighting.bloomThreshold; break; // bloom off for scenery: only the pickup core exceeds 3
      case 'palette': setPalette(v); document.documentElement.style.setProperty('--heart', PALETTES[v].heart); document.documentElement.style.setProperty('--accent', PALETTES[v].accent); break;
      case 'showFps': perf.panel.hidden = !v; break;
      case 'cameraDistance': camDist = v; break;
      case 'mute': audio.setMuted(v); hud.muted(v); break;
      case 'music': case 'sfx': audio.setVolumes(S.s.music, S.s.sfx); break;
      case 'jumpKey': game.setKeys(v); break;
      case 'character': game.robot.setStyle(v); game.ghost.setStyle(v); break;
      case 'holdSensitivity': C.JUMP_MIN_HEIGHT = { short: 0.6, normal: 1.0, long: 1.6 }[v] ?? 1.0; break;
      case 'sessionMinutes': game.sessionLimit = v * 60; break;
      case 'ghost': game.ghostOn = v; break;
      case 'paint': game.robot.setPaint(unlocked('paint', v, store.lifetime.distance) ? v : 'silver'); break;
      case 'topper': game.robot.setTopper(unlocked('topper', v, store.lifetime.distance) ? v : 'ball'); break;
      case 'trail': game.robot.setTrail(unlocked('trail', v, store.lifetime.distance) ? v : 'biome'); break;
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
game.on('perf', () => perf.toggle()).on('perfinfo', () => perf.toggleInfo());
if (params.get('latency')) { perf.enableLatency(); addEventListener('keydown', e => { if (!e.repeat) perf.press(e.timeStamp); }, true); addEventListener('pointerdown', e => perf.press(e.timeStamp), true); }
{
  const urlQ = params.get('q');
  if (urlQ && TIERS.includes(urlQ)) { autoQuality = false; setQuality(urlQ); }
  else if (settings.s.quality !== 'auto') { autoQuality = false; setQuality(settings.s.quality); }
  else await autoTier();
}
// ---- My robot (cosmetics) + sticker book + photo mode ----------------------------------------------------------------
const robotCard = document.getElementById('robotcard'), robotBody = robotCard.querySelector('.body'), robotBar = document.getElementById('robotbar');
function renderRobotCard() {
  const D = store.lifetime.distance, row = (kind, items, cur) => `<div class="row"><div class="lbl">${{ character: 'Character', paint: 'Paint', topper: 'Antenna topper', trail: 'Trail' }[kind]}</div><div class="ctl">${Object.entries(items).map(([id, it]) => { const ok = unlocked(kind, id, D), u = UNLOCKS.find(x => x.kind === kind && x.id === id); return `<button class="pill ${id === cur ? 'on' : ''} ${ok ? '' : 'lock'}" data-kind="${kind}" data-id="${id}" ${ok ? '' : 'disabled'}>${ok ? '' : '🔒 '}${typeof it === 'string' ? it : it.label}${ok ? '' : ` · ${u.at.toLocaleString()} m`}</button>`; }).join('')}</div></div>`;
  robotBody.innerHTML = row('character', STYLES, settings.s.character) + row('paint', PAINTS, settings.s.paint) + row('topper', TOPPERS, settings.s.topper) + row('trail', TRAILS, settings.s.trail);
  const nx = nextUnlock(D); robotBar.querySelector('.txt').textContent = nx ? `Next unlock: ${labelOf(nx)} at ${nx.at.toLocaleString()} m (${D.toLocaleString()} m so far)` : 'Every cosmetic unlocked!'; robotBar.querySelector('.bar div').style.width = nx ? (100 * D / nx.at) + '%' : '100%';
}
robotBody.addEventListener('click', e => { const b = e.target.closest('button[data-kind]'); if (!b || b.disabled) return; settings.set(b.dataset.kind, b.dataset.id); renderRobotCard(); audio.uiClick(); });
document.getElementById('robotbtn').onclick = e => { e.stopPropagation(); renderRobotCard(); robotCard.hidden = false; audio.uiClick(); };
// Title screen: pick a character before playing.
const charRow = document.getElementById('charrow'); charRow.innerHTML = Object.entries(STYLES).map(([id, s]) => `<button class="pill" data-char="${id}">${s.label}</button>`).join('');
const renderChars = () => charRow.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.char === settings.s.character)); renderChars();
charRow.addEventListener('click', e => { const b = e.target.closest('button[data-char]'); if (!b) return; settings.set('character', b.dataset.char); renderChars(); audio.uiClick(); });
document.getElementById('robotclose').onclick = () => { robotCard.hidden = true; audio.uiClick(); };
game.on('state', s => { if (s === 'SELECT') renderRobotCard(); });
document.getElementById('statsbtn').onclick = () => { hud.stats(true, store.lifetime, store.records, earned(store.lifetime, store.records), STICKERS); audio.uiClick(); };
document.getElementById('statsclose').onclick = () => { hud.stats(false); audio.uiClick(); };
game.on('crashed', st => { if (st.newStickers?.length) setTimeout(() => hud.message('⭐ New sticker!', 2, true, true), 1800); });
// Photo mode: pause → hide the HUD, drag to orbit, save a PNG straight from the canvas.
let photo = false, photoA = 0.6, photoH = 2.4; const photoBar = document.getElementById('photo');
function setPhoto(v) { photo = v; document.body.classList.toggle('photo', v); photoBar.hidden = !v; if (v) { hud.pause(false); } else if (game.state === 'PAUSED') hud.pause(true); }
document.getElementById('photobtn').onclick = e => { e.stopPropagation(); setPhoto(true); audio.uiClick(); };
document.getElementById('photoback').onclick = e => { e.stopPropagation(); setPhoto(false); audio.uiClick(); };
document.getElementById('photosave').onclick = e => { e.stopPropagation(); if (quality === 'low') renderer.render(scene, camera); else composer.render(); canvas.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `bolt-runner-${Date.now()}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }); audio.milestone(); };
addEventListener('pointermove', e => { if (photo && e.buttons) { photoA += e.movementX * 0.01; photoH = THREE.MathUtils.clamp(photoH - e.movementY * 0.02, 0.6, 6); } });
game.on('state', () => { if (photo) setPhoto(false); });
// Shield Bubble + power-up feedback
game.on('power', k => { fx.emit(0, 1.4, 0.3, 40, [0xffffff, 0xffe27a, 0x40e8ff], 6, -6, 1); audio.newBest(); }).on('bubblePop', () => { fx.emit(0, 1.2, 0.3, 50, [0x8fd0ff, 0xffffff], 8, -10, 0.8); audio.impact('ice'); });

hud.el.quality.onclick = () => { // Auto → High → Medium → Low → Auto
  const i = autoQuality ? -1 : TIERS.indexOf(quality); const next = i + 1;
  settings.set('quality', next >= TIERS.length ? 'auto' : TIERS[next]); audio.uiClick();
};
await progress(100, 'Tap or press SPACE to start');
hud.show(true); loading.classList.add('ready');
addEventListener('keydown', firstGesture, true); addEventListener('pointerdown', firstGesture, true);

// ---- The loop: fixed 120 Hz simulation on an accumulator, render interpolated between ticks ----------------------------------------
// Real time × timeScale feeds the accumulator (slow-mo = fewer ticks per second, the tick itself never changes). The accumulator is
// clamped so a backgrounded tab catches up by at most MAX_ACCUM of simulation. Visual updates (scrolling, particles, camera) advance by
// exactly the time added to the accumulator, so they stay in lock-step with the interpolated obstacles.
const TICK = 1 / C.TICK_RATE; let acc = 0;
let last = performance.now(), frames = 0, fpsT = 0, lowFpsT = 0, breathT = 0, cpuMs = 0, moodT = 0;
renderer.setAnimationLoop(now => {
  perf.begin(now);
  const raw = (now - last) / 1000, dt = Math.min(raw, C.MAX_DT); last = now; journey.frame(raw, cpuMs); const cpu0 = performance.now();
  const paused = game.state === 'PAUSED'; let ticks = 0;
  if (!paused) {
    const adv = Math.min(raw, C.MAX_ACCUM) * game.timeScale; acc = Math.min(acc + adv, C.MAX_ACCUM);
    while (acc >= TICK) { acc -= TICK; ticks++; if (bench) bench.tick(TICK); game.tick(TICK); if (game.state === 'PLAYING') journey.tick(TICK, game.score, game.speed, journeyHooks); }
    const alpha = acc / TICK;
    game.frame(adv, alpha); journey.render(alpha, adv);
    world.update(adv, game.speed, game.score); game.robot.trailBright = world.trailBright;
    fx.update(adv, game.speed); updateCamera(dt);
    const br = biome.def.particles.breath; if (br && game.state === 'PLAYING') { breathT += dt; if (breathT > br.every) { breathT = 0; fx.emit(0.4, game.renderY + 1.55, 0.3, 5, br.colors, 0.8, 0.6, 0.9, 0.3); } }
    moodT += raw; if (moodT > 0.1) { moodT = 0; audio.setMood(Math.min(1, Math.max(0, (game.speed - C.SPEED_START) / (C.SPEED_CAP.normal - C.SPEED_START))), world.cur.stars); } // AudioParam automation ten times a second, not per frame
  }
  if (paused && photo) updateCamera(dt);
  bubble.visible = game.bubble; if (bubble.visible) { bubble.position.set(0, game.renderY + 0.95, 0); bubble.rotation.y += dt; }
  if (game.rocket && !paused) fx.emit(-0.5, game.renderY + 0.3, 0.2, 3, ROCKET_COLORS, 4, 2, 0.4, 0.3);
  if (world.phaseName === 'night' && game.state === 'PLAYING') game.sawNight = true;
  frames++; fpsT += raw; if (fpsT >= 0.5) { const fps = frames / fpsT; frames = 0; fpsT = 0;
    // Auto-downgrade: sustained low FPS during play drops one tier (never while paused or on the first seconds after a switch).
    if (autoQuality && game.state === 'PLAYING' && fps < C.FPS_DOWNGRADE_BELOW) { lowFpsT += 0.5; if (lowFpsT >= C.FPS_DOWNGRADE_AFTER && quality !== 'low') { setQuality(TIERS[TIERS.indexOf(quality) + 1]); hud.message('Quality → ' + quality, 1.2); lowFpsT = -3; } } else lowFpsT = Math.max(0, lowFpsT);
  }
  if (quality === 'low') renderer.render(scene, camera); else composer.render(); perf.flash(now);
  // Pickup contrast plate: read the real background once per pickup (when its beam telegraphs, 2 s ahead) and once after a biome change — a readback is a pipeline flush, so never on a timer.
  if (!paused && (game.needBg || bgOnce)) { game.needBg = false; bgOnce = false; game.obstacles.measureBackground(renderer, camera); } game.obstacles.pollBackground(renderer);
  cpuMs = performance.now() - cpu0;
  const pc = perf.counters; pc.ticks = ticks; pc.obstacles = game.obstacles.active.length; pc.particles = fx.live; pc.pooled = game.obstacles.pooledCount; pc.tier = quality; perf.end();
});
window.bolt = { game, world, renderer, scene, camera, journey, perf, shared, setQuality, switchBiome, get biome() { return biome; }, quality: () => quality, contrastTest: o => contrastTest(window.bolt, o) }; // debug handle
// ---- Benchmark mode: no gesture needed, scripted input, JSON report on bolt.bench.done ----
let bench = null;
if (BENCH) { audio.muted = true; game.ready = true; loading.classList.add('done'); game.setState('MENU'); removeEventListener('keydown', firstGesture, true); removeEventListener('pointerdown', firstGesture, true); bench = window.bolt.bench = new Bench(window.bolt, params); bench.start(); }
console.log('three', THREE.REVISION);
