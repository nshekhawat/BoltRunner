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
import { makeMaterials } from './textures.js';
import { World } from './world.js';
import { Particles } from './fx.js';
import { Game } from './game.js';
import { hud } from './hud.js';
import { AudioEngine } from './audio.js';

const loadBar = document.getElementById('loadbar'), loadText = document.getElementById('loadtext');
const progress = (pct, text) => { loadBar.style.width = pct + '%'; loadText.textContent = text; return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); };

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, C.MAX_PIXEL_RATIO));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(C.FOV_BASE, 1, 0.1, 400);

await progress(10, 'Painting textures…');
const mats = makeMaterials();
await progress(35, 'Raising the mesas…');
const world = new World(scene, mats, camera);
await progress(55, 'Polishing the robot…');
const game = new Game(scene, mats);
const params = new URLSearchParams(location.search); world.phaseOffset = +(params.get('phase') ?? 0); // debug: ?phase=2 starts at night
const fx = new Particles(scene, mats.textures.dot);
const audio = new AudioEngine();
await progress(70, 'Bouncing light around…');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();
await progress(85, 'Tuning the speakers…');

// ---- Post-processing ---------------------------------------------------------
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.45, 1.15); // threshold above any lit albedo: only emissives bloom
const vignette = new ShaderPass(VignetteShader); vignette.uniforms.offset.value = 0.95; vignette.uniforms.darkness.value = 0.7;
const smaa = new SMAAPass(); const output = new OutputPass();
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(output); composer.addPass(vignette); composer.addPass(smaa);
let quality = 'high';
export function setQuality(q) {
  quality = q;
  bloom.enabled = q === 'high'; renderer.shadowMap.enabled = q !== 'low';
  world.sun.castShadow = q !== 'low'; world.sun.shadow.mapSize.setScalar(q === 'high' ? 2048 : 1024); if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  fx.budget = q === 'low' ? 0.4 : 1; world.dust.visible = q !== 'low'; for (const s of world.shafts) s.visible = q !== 'low';
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
function updateCamera(dt) {
  const p = game.player, norm = Math.min(1, Math.max(0, (game.speed - C.SPEED_START) / (C.SPEED_CAP.normal - C.SPEED_START)));
  camTarget.set(C.CAMERA_POS[0], C.CAMERA_POS[1] + p.y * 0.25, C.CAMERA_POS[2]); lookTarget.set(C.CAMERA_LOOK[0], C.CAMERA_LOOK[1] + p.y * 0.35, C.CAMERA_LOOK[2]);
  const k = 1 - Math.exp(-C.CAMERA_SPRING * dt);
  camPos.lerp(camTarget, k); camLook.lerp(lookTarget, k);
  shake = Math.max(0, shake - dt);
  const sh = shake > 0 ? C.SHAKE_AMOUNT * (shake / C.SHAKE_TIME) : 0;
  camera.position.set(camPos.x + (Math.random() - 0.5) * sh, camPos.y + (Math.random() - 0.5) * sh, camPos.z);
  camera.lookAt(camLook);
  applyFov(C.FOV_BASE + C.FOV_PUSH * norm);
}

// ---- Effects hooks ----------------------------------------------------------------
const SPARK = [0xffd060, 0xff8a30, 0xfff0a0], CONFETTI = [0xff5c8a, 0x40e8ff, 0xffe27a, 0x7dff7a, 0xc07dff];
game.on('hit', () => { shake = C.SHAKE_TIME; fx.emit(0.2, 1.1, 0.3, 40, SPARK, 9, -30, 0.7); audio.shieldLost(); })
    .on('milestone', () => { fx.emit(0, 1.5, 0.2, 60, CONFETTI, 7, -12, 1.4); audio.milestone(); })
    .on('pickup', () => { fx.emit(0, 1.4, 0.3, 30, [0x7dff7a, 0xfff27a], 5, -6, 0.9); audio.pickup(); })
    .on('land', () => { fx.emit(0, 0.05, 0.2, 8, [0xe8d0a0, 0xd0b080], 3, -8, 0.5, 0.4); audio.land(); })
    .on('erupt', () => { const v = game.obstacles.active.find(o => o.userData.type === 'vent' && o.userData.phase === 2); if (v) fx.emit(v.position.x, 0.5, 0, 30, [0xffffff, 0xe0f0ff], 4, 3, 1.2, 0.3); audio.erupt(); })
    .on('jump', () => audio.jump()).on('duck', () => audio.duck()).on('step', s => audio.step(s)).on('clang', () => audio.clang()).on('hiss', () => audio.hiss())
    .on('countdown', i => audio.countdown(i)).on('mute', () => audio.toggleMute())
    .on('state', s => { if (s === 'PLAYING') audio.startMusic(); else if (s === 'CRASHED' || s === 'MENU') audio.stopMusic(); console.log('state', s); })
    .on('crashed', s => console.log('crashed', JSON.stringify(s)));

// Browsers block audio until a gesture: keep the loading card up as a "tap to start" screen until then.
const loading = document.getElementById('loading');
function firstGesture(e) {
  e.stopImmediatePropagation(); audio.unlock(); game.ready = true; loading.classList.add('done');
  removeEventListener('keydown', firstGesture, true); removeEventListener('pointerdown', firstGesture, true);
}

function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; applyFov(C.FOV_BASE); }
addEventListener('resize', resize); resize();
await progress(100, 'Tap or press SPACE to start');
hud.show(true); loading.classList.add('ready');
addEventListener('keydown', firstGesture, true); addEventListener('pointerdown', firstGesture, true);

let last = performance.now(), frames = 0, fpsT = 0;
renderer.setAnimationLoop(now => {
  const raw = (now - last) / 1000, dt = Math.min(raw, C.MAX_DT); last = now;
  const paused = game.state === 'PAUSED';
  if (!paused) {
    game.update(dt);
    world.update(dt, game.speed, game.score); game.robot.trailBright = world.trailBright;
    fx.update(dt, game.speed); updateCamera(dt);
    audio.setMood(Math.min(1, Math.max(0, (game.speed - C.SPEED_START) / (C.SPEED_CAP.normal - C.SPEED_START))), world.cur.stars);
  }
  frames++; fpsT += raw; if (fpsT >= 0.5) { hud.fps(Math.round(frames / fpsT) + ' FPS · ' + quality); frames = 0; fpsT = 0; }
  if (quality === 'low') renderer.render(scene, camera); else composer.render();
});
window.bolt = { game, world, renderer, scene, setQuality }; // debug handle
console.log('three', THREE.REVISION);
