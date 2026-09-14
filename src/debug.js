// Debug/verification helpers exposed on window.bolt. Not used by gameplay.
import * as THREE from 'three';
import { CONFIG as C } from './config.js';
import { BIOME_IDS } from './biomes/registry.js';
import { PALETTE_IDS } from './palettes.js';
import { setPalette } from './obstacles.js';

const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

// Renders every biome at noon and night under every palette, samples the pixels behind the health pickup and the pickup itself,
// and reports the WCAG luminance contrast ratio. The pickup must reach 4.5:1 everywhere; brighten the halo, never darken the biome.
export function contrastTest(env, { palette = 'normal' } = {}) {
  const { renderer, scene, camera, world, game, switchBiome } = env, gl = renderer.getContext(), results = [];
  const startBiome = env.biome.def.id, pick = game.obstacles.pickups[0], hud = document.getElementById('hud'), hudWas = hud.hidden;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2()), v = new THREE.Vector3();
  const sample = (cx, cy, r) => { // per-pixel luminance of the disc of radius r around canvas pixel (cx, cy), y up
    const w = 2 * r + 1, buf = new Uint8Array(w * w * 4); gl.readPixels(cx - r, cy - r, w, w, gl.RGBA, gl.UNSIGNED_BYTE, buf); const out = [];
    for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if ((x - r) ** 2 + (y - r) ** 2 <= r * r) { const i = (y * w + x) * 4; out.push(lum(buf[i], buf[i + 1], buf[i + 2])); }
    return out;
  };
  for (const id of BIOME_IDS) {
    switchBiome(id);
    for (const phase of [1, 3]) {
      world.jumpToPhase(phase);
      for (const pal of PALETTE_IDS) {
        setPalette(pal);
        pick.visible = true; pick.position.set(11, 0, 0); pick.userData.x = pick.userData.px = 11; pick.getObjectByName('body').position.y = C.PICKUP_HEIGHT; game.obstacles.beamMat.opacity = 0.55; pick.userData.t = 0.4;
        game.obstacles.active.push(pick); game.obstacles.render(0, 0, 0); game.obstacles.active.pop(); // runs the pulse/halo animation once at a fixed time
        v.set(11, C.PICKUP_HEIGHT, 0).project(camera); const cx = Math.round((v.x + 1) / 2 * size.x), cy = Math.round((v.y + 1) / 2 * size.y);
        v.set(11, C.PICKUP_HEIGHT + 0.5, 0).project(camera); const r = Math.max(3, Math.round(Math.abs((v.y + 1) / 2 * size.y - cy))); // footprint: core + inner halo
        pick.visible = false; renderer.render(scene, camera); const bg = sample(cx, cy, r);
        game.obstacles.measureBackgroundSync(renderer, camera); game.obstacles.applyPlate(0); // exactly what the runtime does, once per 1.5 s
        pick.visible = true; renderer.render(scene, camera); const fg = sample(cx, cy, r);
        pick.visible = false; game.obstacles.beamMat.opacity = 0;
        const ratios = fg.map((f, i) => (Math.max(f, bg[i]) + 0.05) / (Math.min(f, bg[i]) + 0.05)).sort((a, b) => a - b), ratio = ratios[ratios.length >> 1]; // median pixel
        const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
        results.push({ biome: id, phase: world.phaseName, palette: pal, fg: +mean(fg).toFixed(3), bg: +mean(bg).toFixed(3), ratio: +ratio.toFixed(2), pass: ratio >= 4.5, plateL: +game.obstacles.sceneL.toFixed(3), plate: game.obstacles.haloMat.color.getHexString() });
      }
    }
  }
  setPalette(palette); switchBiome(startBiome); world.jumpToPhase(world.phaseIndex()); hud.hidden = hudWas;
  const worst = results.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  return { pass: results.every(r => r.pass), worst, results };
}
