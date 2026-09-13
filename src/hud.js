// DOM HUD + overlays. Everything here is display only; game state lives in game.js.
const $ = id => document.getElementById(id);
const el = { power: $('powerring'), powerIcon: $('powericon'), powerArc: $('powerarc'), stats: $('stats'), statsBody: $('statsbody'), score: $('scorenum'), scoreBox: $('score'), combo: $('combo'), timer: $('timer'), shields: $('shields'), msg: $('message'), hud: $('hud'), fps: $('fps'),
  menu: $('menu'), pause: $('pause'), end: $('end'), mode: $('modebtn'), quality: $('qualitybtn'), best: $('bestscore'), bestTime: $('besttime'), mute: $('mutebtn'),
  encourage: $('encourage'), newbest: $('newbest'), eScore: $('e-score'), eTime: $('e-time'), eCleared: $('e-cleared'), eBestS: $('e-bests'), eBestT: $('e-bestt'), again: $('againbtn'), menuBtn: $('menubtn') };
// One fixed heart shape and colour in every biome, white outline so it never vanishes against the sky.
const HEART = '<svg viewBox="0 0 32 30" width="1em" height="1em"><path d="M16 28 C2 18 1 9 6 4.5 C10 1 14.5 3 16 7 C17.5 3 22 1 26 4.5 C31 9 30 18 16 28 Z" fill="var(--heart)" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>';
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
  shields(n, max) { if (n === lastShields) return; lastShields = n; el.shields.innerHTML = Array.from({ length: max }, (_, i) => `<span class="${i < n ? '' : 'lost'}">${HEART}</span>`).join(''); },
  message(text, secs = 1, bounce = false, small = false) { el.msg.textContent = text; el.msg.classList.toggle('bounce', bounce); el.msg.classList.toggle('small', small); msgTimer = secs; },
  fps(text) { el.fps.textContent = text; },
  toggleFps() { el.fps.hidden = !el.fps.hidden; },
  biome(def) { document.title = `Bolt Runner · ${def.displayName}`; },
  power(kind, frac = 0) { el.power.hidden = !kind; if (!kind) return; el.powerIcon.textContent = { shield: '🛡️', magnet: '🧲', slowmo: '⏳', rocket: '🚀' }[kind]; el.powerArc.style.strokeDashoffset = String(157 * (1 - frac)); },
  // Stats + sticker book. L = store.lifetime, R = store.records, stickers = earned list, all = full sticker list.
  stats(v, L, R, stickers, all) {
    el.stats.hidden = !v; if (!v) return;
    const fav = Object.entries(L.biomeRuns).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—', have = new Set(stickers.map(s => s.id));
    const rows = [['Lifetime distance', `${L.distance.toLocaleString()} m`], ['Runs', L.runs], ['Favourite world', fav], ['Longest combo', L.combo], ['Power-ups grabbed', L.powers], ['Best run', pad5(Math.max(0, ...Object.values(R).map(r => r.best)))]];
    const cleared = ['small', 'tall', 'wide', 'flyer', 'hazard', 'chaser'].map(t => `<span class="chip">${t} <b>${L.cleared[t] ?? 0}</b></span>`).join('');
    el.statsBody.innerHTML = `<table class="stats">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table><h3>Obstacles cleared</h3><div class="chips">${cleared}</div><h3>Stickers ${have.size}/${all.length}</h3><div class="stickers">${all.map(s => `<div class="sticker ${have.has(s.id) ? 'got' : ''}"><span>${have.has(s.id) ? s.emoji : '❔'}</span><small>${s.label}</small></div>`).join('')}</div>`;
  },
  update(dt) { if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) { el.msg.textContent = ''; el.msg.classList.remove('bounce'); } } },
  // overlays
  menu(v, best, bestTime) { el.menu.hidden = !v; if (v) { el.best.textContent = pad5(best); el.bestTime.textContent = fmtTime(bestTime); } },
  pause(v) { el.pause.hidden = !v; },
  mode(m) { el.mode.textContent = { kid: 'Kid mode', normal: 'Normal mode', nofail: 'No-Fail practice' }[m]; el.mode.classList.toggle('on', m === 'kid'); },
  quality(q, auto) { el.quality.textContent = `Quality: ${auto ? 'Auto (' + q + ')' : q[0].toUpperCase() + q.slice(1)}`; },
  muted(m) { el.mute.textContent = m ? '🔇' : '🔊'; },
  end(v, s) { // s = { score, time, cleared, newBest, newBestTime, record } (record = this biome's bests, already updated)
    el.end.hidden = !v; if (!v) return;
    el.encourage.textContent = LINES[lineIdx++ % LINES.length];
    el.newbest.hidden = !(s.newBest || s.newBestTime);
    el.eScore.textContent = pad5(s.score); el.eTime.textContent = fmtTime(s.time); el.eCleared.textContent = s.cleared;
    el.eBestS.textContent = s.newBest ? '★ best!' : `best ${pad5(s.record.best)}`; el.eBestT.textContent = s.newBestTime ? '★ longest!' : `best ${fmtTime(s.record.bestTime)}`;
  },
};
