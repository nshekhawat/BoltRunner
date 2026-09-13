// State machine: MENU → COUNTDOWN → PLAYING → CRASHED → (PLAY AGAIN) → COUNTDOWN. PAUSED overlays COUNTDOWN/PLAYING.
import * as THREE from 'three';
import { CONFIG as C } from './config.js';
import { Player } from './physics.js';
import { Robot } from './robot.js';
import { Obstacles } from './obstacles.js';
import { hud } from './hud.js';
import { store, save } from './store.js';

const NO_BOXES = []; // shared empty list while invulnerable (no per-frame allocation)
export class Game {
  constructor(scene, shared) {
    this.scene = scene; this.player = new Player(); this.biome = null;
    this.robot = new Robot(shared); scene.add(this.robot.group, this.robot.trail);
    this.obstacles = new Obstacles(scene, shared);
    // DEBUG_HITBOXES: wireframes for the robot's three body boxes (obstacle boxes live in obstacles.js).
    const dbgMat = new THREE.MeshBasicMaterial({ color: 0x40ff40, wireframe: true });
    this.dbgBoxes = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dbgMat); m.visible = false; scene.add(m); return m; });
    this.handlers = {}; this.ev = {}; this.mode = store.mode in C.SPEED_CAP ? store.mode : C.DIFFICULTY_DEFAULT;
    this.state = 'MENU'; this.prevState = 'MENU'; this.stateTime = 0;
    this.resetRun();
    this.bindInput();
    this.bindMenu();
  }
  setMode(m) { this.mode = m; store.mode = m; save(); hud.mode(m); this.obstacles.setDifficulty(m); }
  // Swap the environment: obstacle art, pickup shell and robot accent follow the biome. Physics does not.
  setBiome(inst) { this.biome = inst; this.obstacles.setBiome(inst); this.robot.setAccent(inst.def.robotAccent.emissive, inst.def.robotAccent.trailColor); }
  on(name, fn) { this.handlers[name] = fn; return this; }
  emit(name, a) { this.handlers[name]?.(a); }

  resetRun() {
    this.player.reset(); this.obstacles.reset(); this.obstacles.setDifficulty(this.mode);
    this.speed = 0; this.distance = 0; this.score = 0; this.time = 0; this.shields = C.SHIELDS_MAX;
    this.combo = 0; this.cleared = 0; this.penalty = 0; this.invuln = 0; this.nextMilestone = C.MILESTONE; this.hitFlash = 0; this.beatBest = false;
    hud.score(0); hud.timer(0); hud.shields(this.shields, C.SHIELDS_MAX); hud.combo(0);
  }
  setState(s) { this.prevState = this.state; this.state = s; this.stateTime = 0; hud.menu(s === 'MENU', store.best, store.bestTime); hud.pause(s === 'PAUSED'); if (s !== 'CRASHED') hud.end(false); this.emit('state', s); }
  startRun() { this.resetRun(); this.setState('COUNTDOWN'); this.countdownStep = -1; }
  pause() { if (this.state === 'PLAYING' || this.state === 'COUNTDOWN') { this.pausedFrom = this.state; this.setState('PAUSED'); } }
  resume() { if (this.state === 'PAUSED') { this.state = this.pausedFrom; this.emit('state', this.state); } }

  jumpPressed() {
    if (!this.ready) return; // audio not unlocked yet: the start screen swallows the first gesture
    switch (this.state) {
      case 'MENU': this.startRun(); break;
      case 'CRASHED': if (this.stateTime > 1.5) this.startRun(); break;
      case 'PAUSED': this.resume(); break;
      case 'PLAYING': case 'COUNTDOWN': this.player.pressJump(); break;
    }
  }
  bindInput() {
    const JUMP = new Set(['Space', 'ArrowUp', 'KeyW']), DUCK = new Set(['ArrowDown', 'KeyS']);
    addEventListener('keydown', e => {
      if (JUMP.has(e.code)) { e.preventDefault(); if (!e.repeat) this.jumpPressed(); }
      else if (DUCK.has(e.code)) { e.preventDefault(); if (!e.repeat && this.state === 'PLAYING') this.emit('duck'); this.player.setDuck(true); }
      else if (e.code === 'KeyP' || e.code === 'Escape') this.state === 'PAUSED' ? this.resume() : this.pause();
      else if (e.code === 'KeyF') hud.toggleFps();
      else if (e.code === 'KeyM') this.emit('mute');
      else if (e.code === 'KeyD' && this.state === 'MENU') this.setMode(this.mode === 'kid' ? 'normal' : 'kid');
      else if (e.code === 'KeyH') { C.DEBUG_HITBOXES = !C.DEBUG_HITBOXES; }
    });
    addEventListener('keyup', e => { if (JUMP.has(e.code)) this.player.releaseJump(); else if (DUCK.has(e.code)) this.player.setDuck(false); });
    // Touch / pointer: tap = jump (hold for full height), swipe down = duck / fast-fall.
    let startY = 0, swiped = false;
    const canvas = document.getElementById('game');
    canvas.addEventListener('pointerdown', e => { if (e.target.closest?.('button,select')) return; startY = e.clientY; swiped = false; this.jumpPressed(); });
    addEventListener('pointermove', e => { if (e.buttons && !swiped && e.clientY - startY > 40) { swiped = true; this.player.releaseJump(); this.player.setDuck(true); if (this.state === 'PLAYING') this.emit('duck'); } });
    addEventListener('pointerup', () => { this.player.releaseJump(); this.player.setDuck(false); });
    addEventListener('pointercancel', () => { this.player.releaseJump(); this.player.setDuck(false); });
    // Overlays: tapping their background counts as the one button; buttons handle themselves.
    for (const id of ['menu', 'pause', 'end']) document.getElementById(id).addEventListener('pointerdown', e => { if (!e.target.closest('button,select')) this.jumpPressed(); });
    addEventListener('blur', () => this.pause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
  }

  bindMenu() {
    const H = hud.el; hud.mode(this.mode);
    H.mode.onclick = () => { this.setMode(this.mode === 'kid' ? 'normal' : 'kid'); this.emit('click'); };
    H.again.onclick = () => { this.startRun(); this.emit('click'); };
    H.menuBtn.onclick = () => { this.setState('MENU'); this.emit('click'); };
    H.mute.onclick = () => this.emit('mute');
  }
  get speedCap() { return C.SPEED_CAP[this.mode]; }

  update(dt) {
    this.stateTime += dt; hud.update(dt);
    const p = this.player;
    if (this.state === 'COUNTDOWN') {
      const step = Math.min(3, Math.floor(this.stateTime));
      if (step !== this.countdownStep) { this.countdownStep = step; const label = ['3', '2', '1', 'GO!'][step]; hud.message(label, 0.9); this.emit('countdown', step); }
      if (this.stateTime >= 3.4) { this.setState('PLAYING'); this.speed = C.SPEED_START; }
    }
    if (this.state === 'PLAYING') {
      this.speed = Math.min(this.speedCap, this.speed + C.SPEED_ACCEL * dt);
      this.distance += this.speed * dt; this.time += dt;
      this.score = Math.max(0, Math.floor(this.distance * C.POINTS_PER_UNIT) - this.penalty);
      if (this.score >= this.nextMilestone) { this.nextMilestone += C.MILESTONE; hud.flashScore(); this.emit('milestone', this.score); }
      if (!this.beatBest && store.best > 0 && this.score > store.best) { this.beatBest = true; hud.message('NEW BEST!', 1.6, true); this.emit('newbest'); }
      const e = p.update(dt); if (e.jumped) this.emit('jump'); if (e.landed) this.emit('land');
      this.invuln = Math.max(0, this.invuln - dt); this.hitFlash = Math.max(0, this.hitFlash - dt);
      const boxes = this.robot.boxes(p.y, p.ducking, C.HITBOX_SCALE[this.mode]);
      this.dbgBoxes.forEach((m, i) => { m.visible = C.DEBUG_HITBOXES; if (m.visible) { m.position.set(boxes[i].cx, boxes[i].cy, 0); m.scale.set(boxes[i].w, boxes[i].h, 1); } });
      this.obstacles.update(dt, this.speed, this.score, this.shields, this.ev, this.invuln > 0 ? NO_BOXES : boxes);
      const ev = this.ev;
      if (ev.passed) { this.combo += ev.passed; this.cleared += ev.passed; hud.combo(this.combo); }
      if (ev.hiss) this.emit('hiss'); if (ev.erupt) this.emit('erupt'); if (ev.beam) this.emit('beam');
      if (ev.pickup) { this.shields = Math.min(C.SHIELDS_MAX, this.shields + 1); hud.shields(this.shields, C.SHIELDS_MAX); this.emit('pickup'); }
      if (ev.hit) {
        if (this.mode === 'nofail') this.penalty += C.NOFAIL_HIT_COST; else this.shields--; // practice mode: hits only cost score
        this.combo = 0; this.invuln = C.INVULN_TIME; this.hitFlash = C.INVULN_TIME;
        hud.shields(this.shields, C.SHIELDS_MAX); hud.combo(0); this.emit('hit', ev.hit);
        if (this.shields <= 0) { const st = this.stats(); this.setState('CRASHED'); hud.end(true, st, store); this.emit('crashed', st); }
      }
      hud.score(this.score); hud.timer(this.time);
    }
    if (this.state === 'CRASHED') { this.speed = Math.max(0, this.speed - 30 * dt); this.player.update(dt); this.obstacles.update(dt, this.speed, this.score, C.SHIELDS_MAX, this.ev, NO_BOXES); }
    const mode = this.state === 'PLAYING' ? (p.grounded ? (p.ducking ? 'duck' : 'run') : 'jump') : this.state === 'CRASHED' ? 'stumble' : this.state === 'COUNTDOWN' ? 'run' : 'idle';
    if (this.robot.update(dt, { mode, y: p.y, vy: p.vy, speed: this.speed, ducking: p.ducking, hitFlash: this.hitFlash, airtime: p.airtime, grounded: p.grounded })) this.emit('step', this.speed);
  }
  stats() {
    const s = { score: this.score, time: this.time, cleared: this.cleared, mode: this.mode, newBest: this.score > store.best, newBestTime: this.time > store.bestTime };
    if (s.newBest) store.best = this.score; if (s.newBestTime) store.bestTime = this.time; if (s.newBest || s.newBestTime) save();
    return s;
  }
}
