// BiomeDefinition contract. validateBiome() throws one readable error listing every missing or mistyped field.
// Types: 'string' | 'number' | 'function' | 'array' | nested object | [itemSpec, minLength].
// Factories receive (ctx, M): ctx = helpers + THREE (see biomes/index.js), M = the biome's material bag from makeMaterials.

export const ARCHETYPES = ['small', 'tall', 'wide', 'flyer', 'hazard', 'chaser'];

// One lighting preset. dayNight has four of these: [dawn, noon, dusk, night].
export const PHASE = { top: 'number', horizon: 'number', fog: 'number', sun: 'number', sunI: 'number', hemiSky: 'number', hemiGround: 'number', hemiI: 'number', env: 'number', elev: 'number', stars: 'number', shafts: 'number', eyeLight: 'number', trail: 'number', cloud: 'number' };

const OBSTACLE = { makeMesh: 'function', impact: 'string' };
const AMBIENT = { count: 'number', color: 'number', size: 'number', vel: 'array', area: { x: 'array', y: 'array', z: 'array' } };

export const SCHEMA = {
  id: 'string', displayName: 'string', tagline: 'string',
  palette: { sky: 'number', fog: 'number', ground: 'number', accent: 'number', rim: 'number', obstacleTints: 'array' },
  lighting: { keyColor: 'number', keyIntensity: 'number', hemiSky: 'number', hemiGround: 'number', fogDensity: 'number', exposure: 'number', bloomThreshold: 'number' },
  startPhase: 'number',                       // index into dayNight the biome opens on
  dayNight: [PHASE, 4],
  makeMaterials: 'function',                  // generator: yields between expensive textures so Journey can build on idle time
  ground: { makeTexture: 'function', makeNormal: 'function', scrollDetail: 'number', material: 'object' },
  lane: { makeTexture: 'function', width: 'number' },
  parallax: [{ makeLayer: 'function', speedFactor: 'number', y: 'number', z: 'number', len: 'number' }, 3],
  props: [{ make: 'function', every: 'array', z: 'array', count: 'number' }, 0],
  particles: { ambient: [AMBIENT, 0], impact: { colors: 'array', n: 'number', speed: 'number', gravity: 'number', life: 'number' }, trail: { colors: 'array' } },
  obstacles: { small: OBSTACLE, tall: OBSTACLE, wide: OBSTACLE, flyer: OBSTACLE, hazard: OBSTACLE, chaser: OBSTACLE },
  pickup: { makePickupShell: 'function' },
  audio: { musicPreset: 'string', ambientBed: 'string', impactTimbre: 'string', footstepTimbre: 'string' },
  robotAccent: { emissive: 'number', trailColor: 'number' },
};

function check(spec, v, path, out) {
  if (typeof spec === 'string') {
    const ok = spec === 'array' ? Array.isArray(v) : spec === 'object' ? (v && typeof v === 'object') : typeof v === spec;
    if (!ok) out.push(`${path}: expected ${spec}, got ${v === undefined ? 'missing' : typeof v}`);
  } else if (Array.isArray(spec)) {
    const [item, min] = spec;
    if (!Array.isArray(v)) return out.push(`${path}: expected array, got ${v === undefined ? 'missing' : typeof v}`);
    if (v.length < min) out.push(`${path}: needs at least ${min} entries, has ${v.length}`);
    v.forEach((x, i) => check(item, x, `${path}[${i}]`, out));
  } else {
    if (!v || typeof v !== 'object') return out.push(`${path}: expected object, got ${v === undefined ? 'missing' : typeof v}`);
    for (const k of Object.keys(spec)) check(spec[k], v[k], `${path}.${k}`, out);
  }
}

export function validateBiome(b) {
  const out = []; check(SCHEMA, b, b?.id ?? 'biome', out);
  if (out.length) throw new Error(`Biome "${b?.id}" does not satisfy the BiomeDefinition schema:\n  - ${out.join('\n  - ')}`);
  return b;
}
