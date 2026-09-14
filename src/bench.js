// Deterministic benchmark mode (?bench=1): seeded RNG (see seed.js), an autopilot that jumps for the robot, exactly `secs` seconds
// of PLAYING per biome with no user input, then a JSON report of percentiles (window.bolt.bench.result / .done promise).
// Options: secs=60 (per biome), biomes=desert,city,jungle,frostpeak,journey (journey = Journey mode, transitions counted), seed=1.
import { CONFIG as C, AIRTIME } from './config.js';
import { BIOME_IDS } from './biomes/registry.js';

export class Bench {
  constructor(env, params) {
    this.env = env; this.secs = +(params.get('secs') ?? 60); this.seed = +(params.get('seed') ?? 1);
    this.list = (params.get('biomes') ?? [...BIOME_IDS, 'journey'].join(',')).split(',').filter(Boolean);
    this.result = { hardware: navigator.userAgent, seed: this.seed, secs: this.secs, tier: env.quality(), dpr: devicePixelRatio, size: [innerWidth, innerHeight], biomes: {} };
    this.done = new Promise(r => { this.resolve = r; }); this.state = 'idle'; this.i = -1; this.t = 0; this.held = 0;
  }
  start() { this.env.game.setMode('nofail'); this.next(); } // No-Fail so a hit never ends the run: the workload is the same every time
  next() {
    const g = this.env.game; if (++this.i >= this.list.length) { this.state = 'done'; this.result.tier = this.env.quality(); console.log('BENCH ' + JSON.stringify(this.result)); this.resolve(this.result); return; }
    const id = this.list[this.i], biome = id === 'journey' ? BIOME_IDS[0] : id;
    if (this.env.biome.def.id !== biome) this.env.switchBiome(biome);
    g.journey = id === 'journey'; g.runKey = id; g.startRun(); this.state = 'countdown'; this.t = 0; this.env.journey.frameMax = 0; this.env.journey.log = [];
  }
  // Called once per simulation tick (or frame before M3). Scripted input: full jump when the nearest dangerous obstacle is half an airtime away.
  tick(dt) {
    const g = this.env.game, p = g.player; if (this.state === 'done') return;
    if (this.state === 'countdown' && g.state === 'PLAYING') { this.state = 'run'; this.t = 0; this.env.perf.startRecording(); if (window.gc) gc(); this.heap0 = performance.memory?.usedJSHeapSize ?? 0; this.mem0 = { ...this.env.renderer.info.memory }; }
    if (this.state !== 'run') return;
    this.t += dt; const speed = g.speed; let nearest = Infinity, mult = 1;
    for (const o of g.obstacles.active) { const d = o.userData.def; if (d.pickup) continue; const x = o.userData.x - d.halfW; if (x > -0.5 && x < nearest) { nearest = x; mult = d.speedMult ?? 1; } }
    const lead = speed * mult * AIRTIME * 0.5 + 0.4;
    if (nearest < lead && p.grounded && this.held <= 0) { g.jumpPressed(); this.held = 0.3; } // hold for the full arc
    if (this.held > 0) { this.held -= dt; if (this.held <= 0) p.releaseJump(); }
    if (this.t >= (this.list[this.i] === 'journey' ? this.secs * 1.5 : this.secs)) { // Journey runs 1.5× longer so several transitions are covered
      if (window.gc) gc(); const s = this.env.perf.stopRecording(); const J = this.env.journey; s.memory = { start: this.mem0, end: { ...this.env.renderer.info.memory } }; if (s.heap) { s.heap.startMB = +(this.heap0 / 1048576).toFixed(1); s.heap.endMB = +((performance.memory?.usedJSHeapSize ?? 0) / 1048576).toFixed(1); }
      if (this.list[this.i] === 'journey') s.journey = { transitions: J.transitionsDone ?? 0, frameMax: +J.frameMax.toFixed(1), overruns: J.overruns, swapMs: J.swapMs ?? null };
      s.score = g.score; s.speed = +g.speed.toFixed(1); this.result.biomes[this.list[this.i]] = s; g.setState('MENU'); this.state = 'gap'; setTimeout(() => this.next(), 300);
    }
  }
}
