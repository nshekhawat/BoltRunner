// State machine: MENU → COUNTDOWN → PLAYING → CRASHED → (PLAY AGAIN) → COUNTDOWN. PAUSED overlays COUNTDOWN/PLAYING.
import * as THREE from 'three';
import { CONFIG as C } from './config.js';
import { Player } from './physics.js';
import { Robot } from './robot.js';
import { Obstacles } from './obstacles.js';
import { hud } from './hud.js';
import { store, save } from './store.js';
import { earned } from './stickers.js';

const NO_BOXES = []; // shared empty list while invulnerable (no per-frame allocation)
export class Game {
  constructor(scene, shared) {
    this.scene = scene; this.player = new Player(); this.biome = null;
    this.robot = new Robot(shared); scene.add(this.robot.group, this.robot.trail);
    this.ghost = Robot.ghost(shared); this.ghost.group.visible = false; scene.add(this.ghost.group); this.ghostOn = true; this.ghostData = null; this.rec = [];
    this.obstacles = new Obstacles(scene, shared);
    // DEBUG_HITBOXES: wireframes for the robot's three body boxes (obstacle boxes live in obstacles.js).
    const dbgMat = new THREE.MeshBasicMaterial({ color: 0x40ff40, wireframe: true });
    this.dbgBoxes = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dbgMat); m.visible = false; scene.add(m); return m; });
    this.handlers = {}; this.ev = {}; this.mode = store.mode in C.SPEED_CAP ? store.mode : C.DIFFICULTY_DEFAULT;
    this.state = 'MENU'; this.prevState = 'MENU'; this.stateTime = 0; this.timeScale = 1; this.slowT = 0; this.tutorialDone = false;
    this.stickersBefore = earned(store.lifetime, store.records).map(x => x.id);
    this.select = null; this.runKey = 'desert'; this.settings = null; this.startSpeed = C.SPEED_START; this.sessionLimit = 0; this.sessionT = 0; // select carousel (set by main); records key for the current run ('journey' in Journey mode)
    this.resetRun();
    this.bindInput();
    this.bindMenu();
  }
  setMode(m) { this.mode = m; store.mode = m; save(); hud.mode(m); this.obstacles.setDifficulty(m); }
  // Swap the environment: obstacle art, pickup shell and robot accent follow the biome. Physics does not.
  setBiome(inst, prebuilt) { this.biome = inst; const old = this.obstacles.setBiome(inst, prebuilt); this.robot.setAccent(inst.def.robotAccent.emissive, inst.def.robotAccent.trailColor); return old; }
  on(name, fn) { (this.handlers[name] ??= []).push(fn); return this; }
  emit(name, a) { const h = this.handlers[name]; if (h) for (const f of h) f(a); }

  resetRun() {
    this.player.reset(); this.obstacles.reset(); this.obstacles.setDifficulty(this.mode);
    this.speed = 0; this.distance = 0; this.score = 0; this.time = 0; this.shields = C.SHIELDS_MAX;
    this.combo = 0; this.maxCombo = 0; this.cleared = 0; this.penalty = 0; this.bonus = 0; this.invuln = 0; this.power = null; this.bubble = false; this.rocket = false; this.powersGot = 0; this.clearedBy = {}; this.sawNight = false; this.rec = []; this.recT = 0; hud.power(null); this.nextMilestone = C.MILESTONE; this.hitFlash = 0; this.beatBest = false;
    hud.score(0); hud.timer(0); hud.shields(this.shields, C.SHIELDS_MAX); hud.combo(0);
  }
  setState(s) { this.prevState = this.state; this.state = s; this.stateTime = 0; hud.menu(s === 'MENU', store.best, store.bestTime); hud.pause(s === 'PAUSED'); if (s !== 'CRASHED') hud.end(false); this.emit('state', s); }
  startRun() { this.resetRun(); this.ghostData = store.ghosts[this.runKey] ?? null; this.setState('COUNTDOWN'); this.countdownStep = -1; }
  pause() { if (this.state === 'PLAYING' || this.state === 'COUNTDOWN') { this.pausedFrom = this.state; this.setState('PAUSED'); } }
  resume() { if (this.state === 'PAUSED') { this.state = this.pausedFrom; hud.pause(false); this.emit('state', this.state); } }

  jumpPressed() {
    if (!this.ready || this.settings?.visible || this.onBreak) return; // audio not unlocked yet / a settings or break card is open
    switch (this.state) {
      case 'MENU': this.setState('SELECT'); break;
      case 'SELECT': this.select?.pick(); break;
      case 'CRASHED': if (this.stateTime > 1.5) this.startRun(); break;
      case 'PAUSED': this.resume(); break;
      case 'PLAYING': case 'COUNTDOWN': this.player.pressJump(); if (this.slowT > 0) { this.slowT = 0; this.timeScale = 1; hud.message('', 0); } break; // any press skips the tutorial beat
    }
  }
  bindInput() {
    const JUMP = this.jumpKeys = new Set(['Space', 'ArrowUp', 'KeyW']);
    addEventListener('keydown', e => {
      if (this.settings?.visible) { if (e.code === 'Escape' || e.code === 'KeyP') this.emit('closeSettings'); return; }
      if (this.state === 'SELECT' && this.select?.key(e.code)) { e.preventDefault(); return; }
      if (JUMP.has(e.code)) { e.preventDefault(); if (!e.repeat) this.jumpPressed(); }
      else if (e.code === 'KeyP' || e.code === 'Escape') this.state === 'PAUSED' ? this.resume() : this.pause();
      else if (e.code === 'KeyF') this.emit('perf');
      else if (e.code === 'F3') { e.preventDefault(); this.emit('perfinfo'); }
      else if (e.code === 'KeyM') this.emit('mute');
      else if (e.code === 'KeyD' && this.state === 'MENU') { this.setMode(this.mode === 'kid' ? 'normal' : this.mode === 'normal' ? 'nofail' : 'kid'); this.emit('modeChanged', this.mode); }
      else if (e.code === 'KeyH') { C.DEBUG_HITBOXES = !C.DEBUG_HITBOXES; }
    });
    addEventListener('keyup', e => { if (JUMP.has(e.code)) this.player.releaseJump(); });
    // Touch / pointer: tap = jump (hold for full height).
    const canvas = document.getElementById('game');
    canvas.addEventListener('pointerdown', e => { if (e.target.closest?.('button,select')) return; this.jumpPressed(); });
    addEventListener('pointerup', () => this.player.releaseJump());
    addEventListener('pointercancel', () => this.player.releaseJump());
    // Overlays: tapping their background counts as the one button; buttons handle themselves.
    for (const id of ['menu', 'pause', 'end']) document.getElementById(id).addEventListener('pointerdown', e => { if (!e.target.closest('button,select')) this.jumpPressed(); });
    addEventListener('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
  }

  // Remappable jump key: the defaults always work plus one extra code.
  setKeys(jump) { this.jumpKeys.clear(); for (const k of ['Space', 'ArrowUp', 'KeyW', jump]) this.jumpKeys.add(k); }
  bindMenu() {
    const H = hud.el; hud.mode(this.mode);
    H.mode.onclick = () => { this.setMode(this.mode === 'kid' ? 'normal' : this.mode === 'normal' ? 'nofail' : 'kid'); this.emit('modeChanged', this.mode); this.emit('click'); };
    H.again.onclick = () => { this.startRun(); this.emit('click'); };
    H.menuBtn.onclick = () => { this.setState('MENU'); this.emit('click'); };
    H.mute.onclick = () => this.emit('mute');
  }
  get speedCap() { return C.SPEED_CAP[this.mode]; }

  update(dt) {
    this.stateTime += dt; hud.update(dt);
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.timeScale = 1; }
    const p = this.player;
    if (this.state === 'COUNTDOWN') {
      const step = Math.min(3, Math.floor(this.stateTime));
      if (step !== this.countdownStep) { this.countdownStep = step; const label = ['3', '2', '1', 'GO!'][step]; hud.message(label, 0.9); this.emit('countdown', step); }
      if (this.stateTime >= 3.4) { this.setState('PLAYING'); this.speed = this.startSpeed; }
    }
    if (this.state === 'PLAYING') {
      if (this.sessionLimit > 0) { this.sessionT += dt; if (this.sessionT >= this.sessionLimit) { this.sessionT = 0; this.pause(); this.onBreak = true; this.emit('break'); return; } }
      this.speed = Math.min(this.speedCap, this.speed + C.SPEED_ACCEL * dt);
      this.distance += this.speed * dt; this.time += dt;
      if (this.rocket) this.bonus += this.speed * dt * C.POINTS_PER_UNIT; // Rocket Boost: double score while flying
      this.score = Math.max(0, Math.floor((this.distance + this.bonus) * C.POINTS_PER_UNIT) - this.penalty);
      if (this.score >= this.nextMilestone) { this.nextMilestone += C.MILESTONE; hud.flashScore(); this.emit('milestone', this.score); }
      if (!this.beatBest && (store.records[this.runKey]?.best ?? 0) > 0 && this.score > store.records[this.runKey].best) { this.beatBest = true; hud.message('NEW BEST!', 1.6, true); this.emit('newbest'); }
      const e = p.update(dt); if (e.jumped) this.emit('jump'); if (e.landed) this.emit('land');
      if (this.rocket) { p.y = THREE.MathUtils.lerp(p.y, 3.6, Math.min(1, dt * 4)); p.vy = 0; p.grounded = false; }
      this.updatePower(dt); this.record(dt);
      this.invuln = Math.max(0, this.invuln - dt); this.hitFlash = Math.max(0, this.hitFlash - dt);
      const boxes = this.robot.boxes(p.y, false, C.HITBOX_SCALE[this.mode]);
      this.dbgBoxes.forEach((m, i) => { m.visible = C.DEBUG_HITBOXES; if (m.visible) { m.position.set(boxes[i].cx, boxes[i].cy, 0); m.scale.set(boxes[i].w, boxes[i].h, 1); } });
      this.obstacles.powerActive = !!this.power;
      this.obstacles.update(dt, this.speed, this.score, this.shields, this.ev, this.invuln > 0 || this.rocket ? NO_BOXES : boxes);
      const ev = this.ev;
      if (ev.passed) { this.combo += ev.passed; this.cleared += ev.passed; this.maxCombo = Math.max(this.maxCombo, this.combo); hud.combo(this.combo); for (const t of ev.passedTypes) this.clearedBy[t] = (this.clearedBy[t] ?? 0) + 1; }
      if (ev.power) this.activatePower(ev.power);
      if (ev.hiss) this.emit('hiss'); if (ev.erupt) this.emit('erupt');
      if (ev.beam) { this.emit('beam'); if (!this.tutorialDone) { this.tutorialDone = true; this.slowT = 1.0; this.timeScale = 0.6; hud.message('💙 HEALTH', 1.4, true); this.emit('tutorial'); } } // first-seen beat, once per session
      if (ev.pickup) { this.shields = Math.min(C.SHIELDS_MAX, this.shields + 1); hud.shields(this.shields, C.SHIELDS_MAX); this.emit('pickup'); }
      if (ev.hit && this.bubble) { this.bubble = false; this.endPower(); this.invuln = C.INVULN_TIME; this.emit('bubblePop'); ev.hit = null; } // Shield Bubble absorbs one hit
      if (ev.hit) {
        if (this.mode === 'nofail') this.penalty += C.NOFAIL_HIT_COST; else this.shields--; // practice mode: hits only cost score
        this.combo = 0; this.invuln = C.INVULN_TIME; this.hitFlash = C.INVULN_TIME;
        hud.shields(this.shields, C.SHIELDS_MAX); hud.combo(0); this.emit('hit', ev.hit);
        if (this.shields <= 0) { const st = this.stats(); this.setState('CRASHED'); hud.end(true, st); this.emit('crashed', st); }
      }
      hud.score(this.score); hud.timer(this.time);
    }
    if (this.state === 'SELECT') this.select?.update(dt);
    this.updateGhost(dt);
    if (this.state === 'CRASHED') { this.speed = Math.max(0, this.speed - 30 * dt); this.player.update(dt); this.obstacles.update(dt, this.speed, this.score, C.SHIELDS_MAX, this.ev, NO_BOXES); }
    const mode = this.state === 'PLAYING' ? (this.rocket ? 'jump' : p.grounded ? 'run' : 'jump') : this.state === 'CRASHED' ? 'stumble' : this.state === 'COUNTDOWN' ? 'run' : 'idle';
    if (this.robot.update(dt, { mode, y: p.y, vy: p.vy, speed: this.speed, ducking: false, hitFlash: this.hitFlash, airtime: p.airtime, grounded: p.grounded })) this.emit('step', this.speed);
  }
  // ---- Power-ups: 5–8 s each, on-screen timer ring, never two at once ----
  activatePower(kind) {
    this.endPower(); this.power = { kind, t: C.POWER_TIME[kind], dur: C.POWER_TIME[kind] }; this.powersGot++;
    if (kind === 'shield') this.bubble = true; else if (kind === 'slowmo') this.timeScale = 0.6; else if (kind === 'rocket') this.rocket = true;
    hud.message({ shield: '🛡️ SHIELD', slowmo: '⏳ SLOW-MO', rocket: '🚀 ROCKET!' }[kind], 1.2, true, true); this.emit('power', kind);
  }
  endPower() { if (!this.power) return; const k = this.power.kind; this.power = null; if (k === 'shield') this.bubble = false; if (k === 'slowmo' && this.slowT <= 0) this.timeScale = 1; if (k === 'rocket') { this.rocket = false; this.player.vy = 0; } hud.power(null); }
  updatePower(dt) { if (!this.power) return; this.power.t -= dt / this.timeScale; hud.power(this.power.kind, Math.max(0, this.power.t / this.power.dur)); if (this.power.t <= 0) this.endPower(); }
  // ---- Ghost: record y at 10 Hz (quantised to 1/20 u); replay the saved best run beside the robot ----
  record(dt) { this.recT += dt; if (this.recT >= 0.1 && this.rec.length < 6000) { this.recT -= 0.1; this.rec.push(Math.min(127, Math.round(this.player.y * 20))); } }
  updateGhost(dt) {
    const d = this.ghostData, g = this.ghost, show = !!(this.ghostOn && d && d.length > 1 && this.state === 'PLAYING');
    g.group.visible = show; if (!show) return;
    const i = Math.min(d.length - 2, Math.floor(this.time * 10)), f = Math.min(1, this.time * 10 - i), y = THREE.MathUtils.lerp(d[i], d[i + 1], f) / 20;
    g.update(dt, { mode: y > 0.05 ? 'jump' : 'run', y, vy: (d[i + 1] - d[i]) / 2, speed: this.speed, ducking: false, hitFlash: 0, airtime: 0.2, grounded: y <= 0.05 });
  }
  stats() {
    const r = (store.records[this.runKey] ??= { best: 0, bestTime: 0, cleared: 0, combo: 0 });
    const s = { score: this.score, time: this.time, cleared: this.cleared, mode: this.mode, key: this.runKey, newBest: this.score > r.best, newBestTime: this.time > r.bestTime, record: r };
    if (s.newBest) r.best = this.score; if (s.newBestTime) r.bestTime = this.time; r.cleared = Math.max(r.cleared, this.cleared); r.combo = Math.max(r.combo, this.maxCombo);
    store.best = Math.max(store.best, this.score); store.bestTime = Math.max(store.bestTime, this.time);
    if (s.newBest && this.rec.length > 10) store.ghosts[this.runKey] = this.rec; // ghost of the personal best
    const L = store.lifetime; L.distance += Math.round(this.distance); L.runs++; L.combo = Math.max(L.combo, this.maxCombo); L.powers += this.powersGot; if (this.sawNight) L.night++;
    for (const [t, n] of Object.entries(this.clearedBy)) L.cleared[t] = (L.cleared[t] ?? 0) + n; L.biomeRuns[this.runKey] = (L.biomeRuns[this.runKey] ?? 0) + 1;
    const before = this.stickersBefore ?? []; const after = earned(L, store.records); s.newStickers = after.filter(x => !before.includes(x.id)).map(x => x.id); this.stickersBefore = after.map(x => x.id);
    save(); return s;
  }
}
