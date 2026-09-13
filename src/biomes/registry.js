// Pure registry (no three.js) so node tests can load every biome. Adding a biome: one file + one import here.
import { validateBiome } from './schema.js';
import desert from './desert.js';

export const BIOMES = Object.fromEntries([desert].map(b => [validateBiome(b).id, b]));
export const BIOME_IDS = Object.keys(BIOMES);
