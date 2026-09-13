import * as THREE from 'three';
import { CONFIG } from './config.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, CONFIG.MAX_PIXEL_RATIO));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec9ff);
const camera = new THREE.PerspectiveCamera(CONFIG.FOV_BASE, 1, 0.1, 200);
camera.position.set(...CONFIG.CAMERA_POS);
camera.lookAt(...CONFIG.CAMERA_LOOK);

const sun = new THREE.DirectionalLight(0xfff1d6, 3);
sun.position.set(10, 15, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -15, right: 30, top: 12, bottom: -4, near: 1, far: 60 });
scene.add(sun, new THREE.HemisphereLight(0xbfdfff, 0xc9915a, 1.2));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshStandardMaterial({ color: 0xd9a46b, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const bot = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 0.9, 6, 16), new THREE.MeshStandardMaterial({ color: 0x9aa4b2, metalness: 0.6, roughness: 0.4 }));
bot.castShadow = true; scene.add(bot);

let y = 0, vy = 0, jumpHeld = false;
const press = () => { if (y <= 0) vy = CONFIG.JUMP_VELOCITY; jumpHeld = true; };
addEventListener('keydown', e => { if (e.code === 'Space' && !e.repeat) press(); });
addEventListener('keyup', e => { if (e.code === 'Space') jumpHeld = false; });
addEventListener('pointerdown', press); addEventListener('pointerup', () => jumpHeld = false);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const fpsEl = document.getElementById('fps'); fpsEl.hidden = false; document.getElementById('hud').hidden = false;
let last = performance.now(), frames = 0, fpsT = 0;
document.getElementById('loading').classList.add('done');
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, CONFIG.MAX_DT); last = now;
  if (!jumpHeld && vy > CONFIG.JUMP_CUT_VELOCITY && y > CONFIG.JUMP_MIN_HEIGHT) vy = CONFIG.JUMP_CUT_VELOCITY;
  vy += CONFIG.GRAVITY * dt; y += vy * dt;
  if (y < 0) { y = 0; vy = 0; }
  bot.position.y = y + 0.9;
  frames++; fpsT += dt; if (fpsT >= 0.5) { fpsEl.textContent = Math.round(frames / fpsT) + ' FPS'; frames = 0; fpsT = 0; }
  renderer.render(scene, camera);
});
console.log('three', THREE.REVISION);
