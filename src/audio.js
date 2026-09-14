// Web Audio synthesis: SFX + an 8-bar chiptune loop. No sample files. Unlocked on first gesture.
import { CONFIG as C } from './config.js';
import { store, save } from './store.js';

const N = { C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, F3: 174.61, G3: 196, A3: 220, C3: 130.81, F2: 87.31, G2: 98, A2: 110, C2: 65.41 };
// 8-bar loop, 16 steps per bar. '.' = rest. Lead is a bright pentatonic hook; bass walks the roots C C F F G G Am G.
const LEAD = ('C5 . E5 . G5 . E5 . C5 . D5 . E5 . . . ' + 'A4 . C5 . E5 . C5 . A4 . G4 . A4 . . . ' + 'C5 . E5 . G5 . A5 . G5 . E5 . D5 . . . ' + 'E5 . D5 . C5 . D5 . E5 . G5 . E5 . . . ' +
  'G5 . E5 . C5 . E5 . G5 . A5 . G5 . . . ' + 'A5 . G5 . E5 . D5 . C5 . D5 . E5 . . . ' + 'C6 . A5 . G5 . E5 . D5 . E5 . G5 . . . ' + 'E5 . C5 . D5 . E5 . C5 . . . . . . . ').trim().split(/\s+/);
const BASS_ROOTS = ['C3', 'C3', 'F3', 'F3', 'G3', 'G3', 'A3', 'G3'];
// Music presets named by biome audio.musicPreset: same loop, different voice, tempo, key and brightness.
const MUSIC = { desert: { lead: 'square', bpm: 128, lp: 1800, semis: 0 }, city: { lead: 'sawtooth', bpm: 116, lp: 1100, semis: -3 }, jungle: { lead: 'triangle', bpm: 138, lp: 2600, semis: 2 }, frost: { lead: 'sine', bpm: 108, lp: 2200, semis: 5 } };
// Footstep timbres named by biome audio.footstepTimbre.
const FOOT = { sand: { type: 'highpass', f: 2500, dur: 0.035, g: 0.06 }, wet: { type: 'bandpass', f: 1400, dur: 0.05, g: 0.09, q: 2 }, soft: { type: 'lowpass', f: 900, dur: 0.04, g: 0.08 }, crunch: { type: 'highpass', f: 4000, dur: 0.06, g: 0.09 } };

export class AudioEngine {
  constructor() { this.ctx = null; this.muted = !!store.mute; this.tempoMult = 1; this.filterOpen = 0; this.playing = false; this.stepIdx = 0; this.nextStepTime = 0; this.lastStep = 0; this.preset = MUSIC.desert; this.vol = { music: 0.32, sfx: 0.9 }; }
  get unlocked() { return !!this.ctx; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : C.VOLUME;
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -18; this.comp.ratio.value = 4;
    this.master.connect(this.comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.vol.sfx; this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.vol.music;
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 1800; this.musicFilter.Q.value = 0.7;
    this.musicBus.connect(this.musicFilter).connect(this.master);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = buf;
  }
  setMuted(m) { this.muted = m; store.mute = m; save(); if (this.master) this.master.gain.setTargetAtTime(m ? 0 : C.VOLUME, this.ctx.currentTime, 0.02); }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }
  setVolumes(music, sfx) { this.vol = { music: music * 0.45, sfx }; if (this.ctx) { this.musicBus.gain.setTargetAtTime(this.vol.music, this.ctx.currentTime, 0.05); this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05); } }
  setBiome(a) { this.preset = MUSIC[a.musicPreset] ?? MUSIC.desert; } // per-biome music preset

  // ---- synth primitives --------------------------------------------------------
  tone({ type = 'square', f = 440, f2, t = 0, dur = 0.1, g = 0.2, a = 0.005, r = 0.05, out = this.sfx, lp }) {
    const ctx = this.ctx, t0 = ctx.currentTime + t, o = ctx.createOscillator(), env = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    env.gain.setValueAtTime(0, t0); env.gain.linearRampToValueAtTime(g, t0 + a); env.gain.setValueAtTime(g, t0 + Math.max(a, dur - r)); env.gain.linearRampToValueAtTime(0, t0 + dur);
    let node = o; if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); node = fl; }
    node.connect(env).connect(out); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  noise({ t = 0, dur = 0.1, g = 0.2, type = 'bandpass', f = 1000, f2, q = 1, a = 0.005, out = this.sfx }) {
    const ctx = this.ctx, t0 = ctx.currentTime + t, src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), env = ctx.createGain();
    src.buffer = this.noiseBuf; src.loop = true; fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q; if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    env.gain.setValueAtTime(0, t0); env.gain.linearRampToValueAtTime(g, t0 + a); env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(fl).connect(env).connect(out); src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
  }

  // ---- SFX ------------------------------------------------------------------------
  jump() { if (!this.ctx) return; this.tone({ type: 'square', f: 300, f2: 720, dur: 0.14, g: 0.12 }); this.noise({ type: 'bandpass', f: 900, f2: 2400, dur: 0.18, g: 0.12, q: 0.8 }); }
  land(foot = 'sand') { if (!this.ctx) return; const F = FOOT[foot] ?? FOOT.sand; this.noise({ type: F.type, f: F.f * 0.6, dur: 0.12, g: 0.35 }); this.tone({ type: 'sine', f: 120, f2: 60, dur: 0.08, g: 0.15 }); }
  shieldLost() { if (!this.ctx) return; this.tone({ type: 'sawtooth', f: 440, f2: 170, dur: 0.38, g: 0.16, lp: 1100, r: 0.2 }); this.noise({ type: 'lowpass', f: 700, dur: 0.2, g: 0.15 }); }
  milestone() { if (!this.ctx) return; [N.C5, N.E5, N.G5].forEach((f, i) => this.tone({ type: 'triangle', f, t: i * 0.09, dur: 0.16, g: 0.16 })); }
  newBest() { if (!this.ctx) return; [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => this.tone({ type: 'triangle', f, t: i * 0.11, dur: i === 3 ? 0.4 : 0.14, g: 0.16 })); }
  pickup() { if (!this.ctx) return; this.tone({ type: 'sine', f: 1320, dur: 0.35, g: 0.18, r: 0.3 }); this.tone({ type: 'sine', f: 2640, dur: 0.25, g: 0.06, r: 0.2 }); }
  countdown(step) { if (!this.ctx) return; step === 3 ? this.tone({ type: 'square', f: 990, dur: 0.28, g: 0.14, r: 0.15 }) : this.tone({ type: 'square', f: 660, dur: 0.09, g: 0.1 }); }
  step(speed, foot = 'sand') { if (!this.ctx) return; const k = speed / C.SPEED_START, F = FOOT[foot] ?? FOOT.sand; this.noise({ type: F.type, f: F.f * k, dur: F.dur, g: F.g, q: F.q ?? 1 }); this.tone({ type: 'sine', f: 150 * k, f2: 80 * k, dur: 0.04, g: 0.07 }); }
  // Impact timbre per obstacle (biome data names one of these): what you hit sounds like what it is made of.
  impact(kind) {
    if (!this.ctx) return;
    switch (kind) {
      case 'metal': [400, 620, 1150, 1830].forEach((f, i) => this.tone({ type: 'sine', f, dur: 0.5 - i * 0.08, g: 0.07, r: 0.35 })); this.noise({ type: 'highpass', f: 3000, dur: 0.06, g: 0.1 }); break;
      case 'wood': case 'thud': this.tone({ type: 'triangle', f: 180, f2: 90, dur: 0.16, g: 0.2 }); this.noise({ type: 'lowpass', f: 600, dur: 0.1, g: 0.2 }); break;
      case 'stone': this.noise({ type: 'lowpass', f: 900, f2: 200, dur: 0.18, g: 0.25 }); this.tone({ type: 'square', f: 90, f2: 50, dur: 0.1, g: 0.1, lp: 300 }); break;
      case 'ice': case 'crack': this.noise({ type: 'highpass', f: 2600, dur: 0.09, g: 0.18 }); [1900, 2900, 4100].forEach((f, i) => this.tone({ type: 'sine', f, t: i * 0.02, dur: 0.12, g: 0.06 })); break;
      case 'flap': this.noise({ type: 'bandpass', f: 500, f2: 1200, dur: 0.2, g: 0.16, q: 0.8 }); break;
      case 'rustle': this.noise({ type: 'bandpass', f: 3000, f2: 1500, dur: 0.25, g: 0.14, q: 0.5 }); break;
      case 'steam': case 'splash': this.noise({ type: 'lowpass', f: 1200, f2: 300, dur: 0.3, g: 0.18 }); break;
      case 'plastic': this.tone({ type: 'square', f: 260, f2: 140, dur: 0.1, g: 0.12, lp: 900 }); break;
      default: this.noise({ type: 'lowpass', f: 700, dur: 0.15, g: 0.2 });
    }
  }
  hiss() { if (!this.ctx) return; this.noise({ type: 'highpass', f: 3500, dur: C.HAZARD_TELEGRAPH, g: 0.1, a: 0.25 }); }
  erupt() { if (!this.ctx) return; this.noise({ type: 'lowpass', f: 900, f2: 250, dur: 0.5, g: 0.22 }); }
  uiClick() { if (!this.ctx) return; this.tone({ type: 'square', f: 880, dur: 0.05, g: 0.06 }); }

  // ---- Music --------------------------------------------------------------------
  startMusic() { if (!this.ctx || this.playing) return; this.playing = true; this.stepIdx = 0; this.nextStepTime = this.ctx.currentTime + 0.05; this.timer = setInterval(() => this.schedule(), 25); }
  stopMusic() { this.playing = false; clearInterval(this.timer); }
  // speedNorm 0..1 nudges tempo up; night 0..1 opens the filter.
  setMood(speedNorm, night) { this.tempoMult = 1 + 0.22 * speedNorm; if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(this.preset.lp + night * 5000, this.ctx.currentTime, 0.5); }
  schedule() {
    const ctx = this.ctx, P = this.preset, stepDur = 60 / (P.bpm * this.tempoMult) / 4, tr = 2 ** (P.semis / 12);
    while (this.nextStepTime < ctx.currentTime + 0.12) {
      const i = this.stepIdx % 128, t = this.nextStepTime - ctx.currentTime, bar = Math.floor(i / 16), s16 = i % 16, out = this.musicBus;
      const lead = LEAD[i]; if (lead && lead !== '.') this.tone({ type: P.lead, f: N[lead] * tr, t, dur: stepDur * 1.6, g: P.lead === 'sawtooth' ? 0.05 : 0.07, r: 0.05, out, lp: P.lead === 'sawtooth' ? 2500 : undefined });
      if (s16 % 2 === 0) { const root = N[BASS_ROOTS[bar]] * tr / (s16 % 8 === 4 ? 1 : 2); this.tone({ type: 'triangle', f: root, t, dur: stepDur * 1.8, g: 0.16, r: 0.06, out }); }
      if (s16 === 0 || s16 === 8) this.tone({ type: 'sine', f: 150, f2: 45, t, dur: 0.12, g: 0.3, r: 0.08, out });
      if (s16 === 4 || s16 === 12) this.noise({ type: 'bandpass', f: 1800, q: 0.6, t, dur: 0.1, g: 0.12, out });
      if (s16 % 2 === 0) this.noise({ type: 'highpass', f: 7000, t, dur: s16 % 4 === 2 ? 0.05 : 0.025, g: 0.035, out });
      this.nextStepTime += stepDur; this.stepIdx++;
    }
  }
}
