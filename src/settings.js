// Settings screen: one schema drives the DOM, persistence (store.settings) and application (hooks supplied by main.js).
// Types: choice (segmented pills), toggle, range, key (press-to-capture), button.
import { store, save } from './store.js';
import { PALETTES, PALETTE_IDS } from './palettes.js';

export const DEFAULTS = {
  difficulty: 'kid', startSpeed: 12,
  quality: 'auto', dynamicRes: true, reduceMotion: false, highContrast: false, palette: 'normal', showFps: false, cameraDistance: 1,
  music: 0.7, sfx: 0.9, mute: false,
  jumpKey: 'Space', holdSensitivity: 'normal',
  sessionMinutes: 0, ghost: true, paint: 'silver', topper: 'ball', trail: 'biome', character: 'bolt',
};
const SCHEMA = [
  { section: 'Gameplay' },
  { key: 'difficulty', label: 'Difficulty', type: 'choice', options: [['kid', 'Kid'], ['normal', 'Normal'], ['nofail', 'No-Fail practice']], hint: 'No-Fail: bumps only cost points' },
  { key: 'startSpeed', label: 'Starting speed', type: 'choice', options: [[8, 'Gentle'], [12, 'Normal'], [16, 'Zippy']] },
  { section: 'Visual' },
  { key: 'quality', label: 'Quality', type: 'choice', options: [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']] },
  { key: 'reduceMotion', label: 'Reduce motion', type: 'toggle', hint: 'No screen shake or camera pulses' },
  { key: 'dynamicRes', label: 'Dynamic resolution', type: 'toggle', hint: 'Lowers the render resolution for a moment when frames drop' },
  { key: 'highContrast', label: 'High-Contrast Mode', type: 'toggle', hint: 'Fades the scenery, boosts obstacles and the health pickup' },
  { key: 'palette', label: 'Colour palette', type: 'choice', options: PALETTE_IDS.map(id => [id, PALETTES[id].label]) },
  { key: 'showFps', label: 'Show FPS', type: 'toggle' },
  { key: 'cameraDistance', label: 'Camera distance', type: 'range', min: 0.8, max: 1.5, step: 0.05 },
  { section: 'Audio' },
  { key: 'mute', label: 'Mute everything', type: 'toggle' },
  { key: 'music', label: 'Music', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'sfx', label: 'Sound effects', type: 'range', min: 0, max: 1, step: 0.05 },
  { section: 'Controls' },
  { key: 'jumpKey', label: 'Jump key', type: 'key', hint: 'Space, ↑ and W always work too' },
  { key: 'holdSensitivity', label: 'Hold-to-jump', type: 'choice', options: [['short', 'Quick'], ['normal', 'Normal'], ['long', 'Relaxed']], hint: 'How long a press counts as a full jump' },
  { key: 'ghost', label: 'Ghost of your best run', type: 'toggle' },
  { section: 'Parent' },
  { key: 'sessionMinutes', label: 'Break reminder', type: 'choice', options: [[0, 'Off'], [15, '15 min'], [30, '30 min'], [45, '45 min']], hint: 'Pauses with a gentle message; never locks' },
  { key: 'reset', label: 'Reset All Progress', type: 'button', hint: 'Clears records, unlocks and settings' },
];
const KEY_NAMES = { Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'Shift', ShiftRight: 'Shift', Enter: 'Enter' };
export const keyName = code => KEY_NAMES[code] ?? code.replace(/^(Key|Digit)/, '');

export class Settings {
  constructor(hooks) {
    this.hooks = hooks; this.s = store.settings = { ...DEFAULTS, ...(store.settings ?? {}) };
    if (store.mode && !store.settings?.difficulty) this.s.difficulty = store.mode; if (store.mute) this.s.mute = true; // v1 fields
    this.el = document.getElementById('settings'); this.body = this.el.querySelector('.body'); this.capturing = null;
    this.body.innerHTML = SCHEMA.map(r => r.section ? `<h3>${r.section}</h3>` : `<div class="row" data-key="${r.key}"><div class="lbl">${r.label}${r.hint ? `<small>${r.hint}</small>` : ''}</div><div class="ctl">${this.control(r)}</div></div>`).join('');
    this.body.addEventListener('click', e => { const b = e.target.closest('button[data-key]'); if (!b) return; const row = SCHEMA.find(r => r.key === b.dataset.key);
      if (row.type === 'choice') this.set(row.key, JSON.parse(b.dataset.v)); else if (row.type === 'toggle') this.set(row.key, !this.s[row.key]); else if (row.type === 'key') this.capture(row.key, b); else if (row.type === 'button') this.hooks[row.key]?.(); });
    this.body.addEventListener('input', e => { if (e.target.type === 'range') this.set(e.target.dataset.key, +e.target.value); });
    this.el.querySelector('#settingsclose').onclick = () => this.hooks.close();
    addEventListener('keydown', e => { if (!this.capturing) return; e.preventDefault(); e.stopImmediatePropagation(); if (e.code !== 'Escape') this.set(this.capturing.key, e.code); this.capturing.btn.classList.remove('waiting'); this.capturing = null; this.render(); }, true);
    this.render(); for (const k of Object.keys(this.s)) this.hooks.apply?.(k, this.s[k], true, this);
  }
  control(r) {
    if (r.type === 'choice') return r.options.map(([v, l]) => `<button class="pill" data-key="${r.key}" data-v='${JSON.stringify(v)}'>${l}</button>`).join('');
    if (r.type === 'toggle') return `<button class="pill tog" data-key="${r.key}"></button>`;
    if (r.type === 'range') return `<input type="range" data-key="${r.key}" min="${r.min}" max="${r.max}" step="${r.step}">`;
    if (r.type === 'key') return `<button class="pill" data-key="${r.key}"></button>`;
    return `<button class="pill danger" data-key="${r.key}">${r.label}</button>`;
  }
  render() {
    for (const r of SCHEMA) { if (!r.key) continue; const row = this.body.querySelector(`[data-key="${r.key}"]`), v = this.s[r.key];
      if (r.type === 'choice') row.querySelectorAll('button').forEach(b => b.classList.toggle('on', JSON.parse(b.dataset.v) === v));
      else if (r.type === 'toggle') { const b = row.querySelector('button'); b.textContent = v ? 'On' : 'Off'; b.classList.toggle('on', !!v); }
      else if (r.type === 'range') row.querySelector('input').value = v;
      else if (r.type === 'key') row.querySelector('button').textContent = keyName(v); }
  }
  capture(key, btn) { this.capturing = { key, btn }; btn.textContent = 'Press a key…'; btn.classList.add('waiting'); }
  set(key, v) { this.s[key] = v; save(); this.render(); this.hooks.apply?.(key, v, false, this); }
  show(v) { this.el.hidden = !v; this.visible = v; }
}
