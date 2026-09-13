// Pure registry (no three.js) so node tests can load every biome. Adding a biome: one file + one import here.
import { validateBiome } from './schema.js';
import desert from './desert.js';
import city from './city.js';
import jungle from './jungle.js';
import frostpeak from './frostpeak.js';

export const BIOMES = Object.fromEntries([desert, city, jungle, frostpeak].map(b => [validateBiome(b).id, b]));
export const BIOME_IDS = Object.keys(BIOMES);
