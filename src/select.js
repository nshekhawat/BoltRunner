// Environment select carousel. The highlighted card is a window onto the live scene (camera orbits the idle robot in that biome);
// side cards show their palette. Keyboard ←/→/Enter, touch swipe/tap, and one-button (auto-advance, press to pick) all work.
import { BIOMES, BIOME_IDS } from './biomes/registry.js';
import { pad5, fmtTime } from './hud.js';

const EXTRA = [
  { id: 'surprise', displayName: 'Surprise Me', tagline: 'A random world every run', palette: { sky: 0xff7ac8, ground: 0x40e8ff } },
  { id: 'journey', displayName: 'Journey', tagline: 'Every world in one run: a new land every 700 m', palette: { sky: 0xffd23f, ground: 0x2f78d0 } },
];
export const CARDS = [...BIOME_IDS.map(id => BIOMES[id]), ...EXTRA];
const hex = n => '#' + n.toString(16).padStart(6, '0');
const AUTO_ADVANCE = 2.5, AUTO_IDLE = 4; // s: one-button players watch the highlight walk along after AUTO_IDLE s without input

export class Select {
  constructor({ onHighlight, onPick, onBack }) {
    this.onHighlight = onHighlight; this.onPick = onPick; this.onBack = onBack;
    this.el = document.getElementById('select'); this.track = this.el.querySelector('.track');
    this.track.innerHTML = CARDS.map((c, i) => `<div class="bcard" data-i="${i}" style="--sky:${hex(c.palette.sky)};--ground:${hex(c.palette.ground)}">
      <div class="window"></div><div class="info"><div class="name">${c.displayName}</div><div class="tag">${c.tagline}</div><div class="rec"></div><div class="bar"><div></div></div></div></div>`).join('');
    this.cards = [...this.track.children]; this.i = 0; this.idle = 0; this.auto = 0; this.visible = false;
    let sx = 0, moved = false;
    this.el.addEventListener('pointerdown', e => { sx = e.clientX; moved = false; e.stopPropagation(); });
    this.el.addEventListener('pointermove', e => { if (e.buttons && !moved && Math.abs(e.clientX - sx) > 40) { moved = true; this.move(e.clientX < sx ? 1 : -1); } });
    this.el.addEventListener('pointerup', e => { if (moved) return; const card = e.target.closest('.bcard'); if (!card) return; const i = +card.dataset.i; i === this.i ? this.pick() : this.highlight(i); });
    this.el.querySelector('#backbtn').onclick = e => { e.stopPropagation(); this.onBack(); };
  }
  get card() { return CARDS[this.i]; }
  show(v, store) { this.visible = v; this.el.hidden = !v; if (v) { this.records(store); this.highlight(this.i, true); this.idle = 0; } }
  records(store) { CARDS.forEach((c, i) => { const r = store.records?.[c.id]; this.cards[i].querySelector('.rec').innerHTML = r?.best ? `Best <b>${pad5(r.best)}</b> · <b>${fmtTime(r.bestTime)}</b>` : 'No run yet'; }); }
  move(d) { this.highlight((this.i + d + CARDS.length) % CARDS.length); }
  highlight(i, force = false) {
    if (i === this.i && !force) return; this.i = i; this.idle = 0; this.auto = 0;
    this.cards.forEach((c, k) => { c.classList.toggle('on', k === i); c.classList.toggle('near', Math.abs(k - i) === 1 || Math.abs(k - i) === CARDS.length - 1); });
    this.track.style.transform = `translateX(calc(50% - var(--cw) / 2 - ${i} * (var(--cw) + var(--gap))))`;
    this.onHighlight(this.card);
  }
  // Loading progress for the highlighted card's biome (0..1); 1 hides the bar.
  progress(p) { const bar = this.cards[this.i].querySelector('.bar'); bar.style.opacity = p >= 1 ? 0 : 1; bar.firstElementChild.style.width = (p * 100) + '%'; }
  pick() { this.onPick(this.card); }
  key(code) {
    if (code === 'ArrowLeft' || code === 'KeyA') this.move(-1); else if (code === 'ArrowRight' || code === 'KeyD') this.move(1);
    else if (code === 'Enter' || code === 'Space' || code === 'ArrowUp' || code === 'KeyW') this.pick(); else if (code === 'Escape' || code === 'Backspace') this.onBack(); else return false;
    this.idle = 0; return true;
  }
  update(dt) { // one-button mode: after a quiet spell the highlight walks along by itself
    if (!this.visible) return; this.idle += dt; if (this.idle < AUTO_IDLE) return;
    this.auto += dt; if (this.auto >= AUTO_ADVANCE) { this.auto = 0; const i = (this.i + 1) % CARDS.length; this.cards.forEach((c, k) => { c.classList.toggle('on', k === i); c.classList.toggle('near', Math.abs(k - i) === 1 || Math.abs(k - i) === CARDS.length - 1); }); this.i = i; this.track.style.transform = `translateX(calc(50% - var(--cw) / 2 - ${i} * (var(--cw) + var(--gap))))`; this.onHighlight(this.card); }
  }
}
