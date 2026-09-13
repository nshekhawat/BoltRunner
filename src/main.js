import * as THREE from 'three';
import { CONFIG as C } from './config.js';
import { makeMaterials } from './textures.js';
import { Game } from './game.js';
import { hud } from './hud.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, C.MAX_PIXEL_RATIO));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ec9ff);
const camera = new THREE.PerspectiveCamera(C.FOV_BASE, 1, 0.1, 300);
camera.position.set(...C.CAMERA_POS); camera.lookAt(...C.CAMERA_LOOK);

const sun = new THREE.DirectionalLight(0xfff1d6, 3); sun.position.set(10, 15, 8); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -15, right: 30, top: 12, bottom: -4, near: 1, far: 60 });
scene.add(sun, new THREE.HemisphereLight(0xbfdfff, 0xc9915a, 1.2));

const mats = makeMaterials();
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 120), mats.ground);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const game = new Game(scene, mats);
game.on('state', s => console.log('state', s)).on('crashed', s => console.log('crashed', s));

export function applyFov(base) {
  const a = camera.aspect; // keep the horizontal field of view constant on narrow (portrait) screens
  camera.fov = a >= C.MIN_ASPECT_FOV ? base : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base / 2)) * C.MIN_ASPECT_FOV / a));
  camera.updateProjectionMatrix();
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; applyFov(C.FOV_BASE); }
addEventListener('resize', resize); resize();

hud.show(true); document.getElementById('loading').classList.add('done');
let last = performance.now(), frames = 0, fpsT = 0;
renderer.setAnimationLoop(now => {
  const dt = Math.min((now - last) / 1000, C.MAX_DT); last = now;
  game.update(dt);
  frames++; fpsT += dt; if (fpsT >= 0.5) { hud.fps(Math.round(frames / fpsT) + ' FPS'); frames = 0; fpsT = 0; }
  renderer.render(scene, camera);
});
console.log('three', THREE.REVISION);
