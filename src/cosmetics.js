// Cosmetic unlocks by lifetime distance. Purely visual: paints, antenna toppers, trail colours. No currency, nothing to buy.
export const PAINTS = {
  silver: { label: 'Silver', color: 0xd0d6e0, metalness: 0.9, roughness: 1 },
  chrome: { label: 'Chrome', color: 0xffffff, metalness: 1, roughness: 0.12 },
  copper: { label: 'Copper', color: 0xd8875a, metalness: 1, roughness: 0.35 },
  black: { label: 'Matte black', color: 0x24262c, metalness: 0.3, roughness: 0.95 },
  candy: { label: 'Candy red', color: 0xe8203c, metalness: 0.7, roughness: 0.25 },
};
export const TOPPERS = { ball: 'Bolt ball', star: 'Star', propeller: 'Propeller', flame: 'Flame' };
export const TRAILS = { biome: { label: 'World colour' }, gold: { label: 'Gold', color: 0xffd23f }, pink: { label: 'Pink', color: 0xff5fa8 }, lime: { label: 'Lime', color: 0xa8ff3a }, rainbow: { label: 'Rainbow', rainbow: true } };
// Unlock ladder (metres of lifetime distance). First entries come quickly so a first session already unlocks something.
export const UNLOCKS = [
  { at: 1500, kind: 'trail', id: 'gold' }, { at: 4000, kind: 'paint', id: 'chrome' }, { at: 8000, kind: 'topper', id: 'star' },
  { at: 14000, kind: 'trail', id: 'pink' }, { at: 22000, kind: 'paint', id: 'copper' }, { at: 32000, kind: 'topper', id: 'propeller' },
  { at: 45000, kind: 'trail', id: 'lime' }, { at: 60000, kind: 'paint', id: 'black' }, { at: 80000, kind: 'topper', id: 'flame' },
  { at: 110000, kind: 'trail', id: 'rainbow' }, { at: 150000, kind: 'paint', id: 'candy' },
];
export const labelOf = u => u.kind === 'paint' ? PAINTS[u.id].label + ' paint' : u.kind === 'topper' ? TOPPERS[u.id] + ' topper' : TRAILS[u.id].label + ' trail';
export const unlocked = (kind, id, distance) => { const u = UNLOCKS.find(x => x.kind === kind && x.id === id); return !u || distance >= u.at; }; // characters are always unlocked
export const nextUnlock = distance => UNLOCKS.find(u => u.at > distance) ?? null;
