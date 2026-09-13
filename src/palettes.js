// Fixed recognition colours for the health pickup and HUD hearts. Never tinted by a biome.
// Colourblind variants keep the same luminance structure (contrast is luminance-based) and avoid the confused hue pairs.
export const PALETTES = {
  normal:       { core: 0x40e8ff, ring: 0x40e8ff, heart: '#3b82f6', accent: '#ffe27a', label: 'Standard' },
  deuteranopia: { core: 0x40c8ff, ring: 0xffd700, heart: '#2f6fe8', accent: '#ffd700', label: 'Deuteranopia' }, // red/green unsafe → blue/yellow
  protanopia:   { core: 0x50d0ff, ring: 0xffe040, heart: '#2a68e0', accent: '#ffe040', label: 'Protanopia' },
  tritanopia:   { core: 0xff5fa8, ring: 0x30e8c8, heart: '#e83c8c', accent: '#ffffff', label: 'Tritanopia' }, // blue/yellow unsafe → pink/teal
};
export const PALETTE_IDS = Object.keys(PALETTES);
