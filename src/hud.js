// DOM HUD + overlays. Everything here is display only; game state lives in game.js.
const $ = id => document.getElementById(id);
const el = { score: $('scorenum'), scoreBox: $('score'), combo: $('combo'), timer: $('timer'), shields: $('shields'), msg: $('message'), hud: $('hud'), fps: $('fps'),
  menu: $('menu'), pause: $('pause'), end: $('end'), mode: $('modebtn'), quality: $('qualitybtn'), best: $('bestscore'), bestTime: $('besttime'), mute: $('mutebtn'),
  encourage: $('encourage'), newbest: $('newbest'), eScore: $('e-score'), eTime: $('e-time'), eCleared: $('e-cleared'), eBestS: $('e-bests'), eBestT: $('e-bestt'), again: $('againbtn'), menuBtn: $('menubtn') };
export const pad5 = n => String(Math.min(99999, n | 0)).padStart(5, '0');
export const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s * 100) % 100)).padStart(2, '0')}`;
const LINES = ['You are getting faster every time!', 'That robot is lucky to have you.', 'Great jumping! Ready for one more?', 'The canyon says: come back soon!', 'Bolt is proud of you.', 'So close to a new record!', 'Your reflexes are sparkling ⚡'];

let lastScore = -1, lastTimer = '', lastCombo = -1, lastShields = -1, msgTimer = 0, lineIdx = Math.floor(Math.random() * LINES.length);
export const hud = {
  el,
  show(v) { el.hud.hidden = !v; },
  score(n) { if (n !== lastScore) { el.score.textContent = pad5(n); lastScore = n; } },
  flashScore() { el.scoreBox.classList.remove('flash'); void el.scoreBox.offsetWidth; el.scoreBox.classList.add('flash'); },
  timer(s) { const t = fmtTime(s); if (t !== lastTimer) { el.timer.textContent = t; lastTimer = t; } },
  combo(n) { if (n !== lastCombo) { el.combo.textContent = n >= 2 ? `×${n} combo` : ''; lastCombo = n; } },
  shields(n, max) { if (n === lastShields) return; lastShields = n; el.shields.innerHTML = Array.from({ length: max }, (_, i) => `<span class="${i < n ? '' : 'lost'}">💙</span>`).join(''); },
  message(text, secs = 1, bounce = false) { el.msg.textContent = text; el.msg.classList.toggle('bounce', bounce); msgTimer = secs; },
  fps(text) { el.fps.textContent = text; },
  toggleFps() { el.fps.hidden = !el.fps.hidden; },
  biome(def) { document.title = `Bolt Runner · ${def.displayName}`; },
  update(dt) { if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) { el.msg.textContent = ''; el.msg.classList.remove('bounce'); } } },
  // overlays
  menu(v, best, bestTime) { el.menu.hidden = !v; if (v) { el.best.textContent = pad5(best); el.bestTime.textContent = fmtTime(bestTime); } },
  pause(v) { el.pause.hidden = !v; },
  mode(m) { el.mode.textContent = m === 'kid' ? 'Kid mode' : 'Normal mode'; el.mode.classList.toggle('on', m === 'kid'); },
  quality(q, auto) { el.quality.textContent = `Quality: ${auto ? 'Auto (' + q + ')' : q[0].toUpperCase() + q.slice(1)}`; },
  muted(m) { el.mute.textContent = m ? '🔇' : '🔊'; },
  end(v, s, best) { // s = { score, time, cleared, newBest, newBestTime }
    el.end.hidden = !v; if (!v) return;
    el.encourage.textContent = LINES[lineIdx++ % LINES.length];
    el.newbest.hidden = !(s.newBest || s.newBestTime);
    el.eScore.textContent = pad5(s.score); el.eTime.textContent = fmtTime(s.time); el.eCleared.textContent = s.cleared;
    el.eBestS.textContent = s.newBest ? '★ best!' : `best ${pad5(best.best)}`; el.eBestT.textContent = s.newBestTime ? '★ longest!' : `best ${fmtTime(best.bestTime)}`;
  },
};
