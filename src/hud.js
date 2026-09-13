// DOM HUD. Everything here is display only; game state lives in game.js.
const $ = id => document.getElementById(id);
const el = { score: $('scorenum'), scoreBox: $('score'), combo: $('combo'), timer: $('timer'), shields: $('shields'), msg: $('message'), hud: $('hud'), fps: $('fps') };
const pad5 = n => String(Math.min(99999, n | 0)).padStart(5, '0');
export const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s * 100) % 100)).padStart(2, '0')}`;

let lastScore = -1, lastTimer = '', lastCombo = -1, lastShields = -1, msgTimer = 0;
export const hud = {
  show(v) { el.hud.hidden = !v; },
  score(n) { if (n !== lastScore) { el.score.textContent = pad5(n); lastScore = n; } },
  flashScore() { el.scoreBox.classList.remove('flash'); void el.scoreBox.offsetWidth; el.scoreBox.classList.add('flash'); },
  timer(s) { const t = fmtTime(s); if (t !== lastTimer) { el.timer.textContent = t; lastTimer = t; } },
  combo(n) { if (n !== lastCombo) { el.combo.textContent = n >= 2 ? `×${n} combo` : ''; lastCombo = n; } },
  shields(n, max) { if (n === lastShields) return; lastShields = n; el.shields.innerHTML = Array.from({ length: max }, (_, i) => `<span class="${i < n ? '' : 'lost'}">💙</span>`).join(''); },
  message(text, secs = 1) { el.msg.textContent = text; msgTimer = secs; },
  fps(text) { el.fps.textContent = text; },
  toggleFps() { el.fps.hidden = !el.fps.hidden; },
  update(dt) { if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) el.msg.textContent = ''; } },
};
