// Sticker book: badges earned from lifetime stats. Kids love a page of numbers that goes up and stickers that appear.
import { BIOME_IDS, BIOMES } from './biomes/registry.js';
export const STICKERS = [
  { id: 'first', emoji: '🏁', label: 'First run', test: L => L.runs >= 1 },
  ...BIOME_IDS.map(id => ({ id: 'biome-' + id, emoji: { desert: '🌵', city: '🌆', jungle: '🌿', frostpeak: '❄️' }[id] ?? '🌍', label: BIOMES[id].displayName, test: L => (L.biomeRuns[id] ?? 0) >= 1 })),
  { id: 'globe', emoji: '🌍', label: 'Globetrotter', test: L => BIOME_IDS.every(id => (L.biomeRuns[id] ?? 0) >= 1) },
  { id: 'km', emoji: '📏', label: '1000 m in one run', test: (L, R) => Object.values(R).some(r => r.best >= 1000) },
  { id: 'ten', emoji: '🔟', label: 'Ten runs', test: L => L.runs >= 10 },
  { id: 'marathon', emoji: '🏃', label: '10 km lifetime', test: L => L.distance >= 10000 },
  { id: 'combo', emoji: '🔥', label: '10 in a row', test: L => L.combo >= 10 },
  { id: 'night', emoji: '🌙', label: 'Night owl', test: L => L.night >= 1 },
  { id: 'power', emoji: '⚡', label: 'Power collector', test: L => L.powers >= 5 },
  { id: 'journey', emoji: '🗺️', label: 'Journey: two worlds', test: (L, R) => (R.journey?.best ?? 0) >= 1400 },
  { id: 'flyers', emoji: '🦅', label: '50 flyers dodged', test: L => (L.cleared.flyer ?? 0) >= 50 },
  { id: 'hundred', emoji: '💯', label: '100 runs', test: L => L.runs >= 100 },
];
export const earned = (L, R) => STICKERS.filter(s => { try { return s.test(L, R); } catch { return false; } });
