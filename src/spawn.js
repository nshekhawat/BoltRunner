// Pure spawn-safety maths. No three.js here so it is unit-testable in node.
import { CONFIG as C, AIRTIME } from './config.js';

// Obstacle definitions: what the player must do, and where the hitboxes are (local to the obstacle group).
// box = [cx, cy, w, h] in world units (y measured from the ground). action: jump | fulljump | duck | run | pickup.
// Archetype table. Hitboxes, timing and clearance are identical in every biome: a biome only supplies the mesh (see biomes/schema.js).
export const DEFS = {
  small:      { intro: 0,    action: 'jump',     boxes: [[0, 0.5, 0.9, 1.0]] },
  tall:       { intro: 0,    action: 'fulljump', boxes: [[0, 0.95, 0.8, 1.9]] },
  wide:       { intro: 250,  action: 'fulljump', boxes: [[0, 0.6, 2.4, 1.2]] },
  flyer_low:  { intro: 500,  action: 'jump',     boxes: [[0, 0.85, 1.0, 0.8]], fly: 0.85, arch: 'flyer' },
  flyer_tall: { intro: 500,  action: 'fulljump', boxes: [[0, 1.45, 1.0, 0.8]], fly: 1.45, arch: 'flyer' },
  hazard:     { intro: 800,  action: 'fulljump', boxes: [[0, 1.0, 1.2, 2.0]], telegraph: true },
  chaser:     { intro: 1000, action: 'jump',     boxes: [[0, 0.55, 1.1, 1.1]], speedMult: C.CHASER_SPEED_MULT },
  pickup:     { intro: 0,    action: 'pickup',   boxes: [[0, C.PICKUP_HEIGHT, 0.8, 0.9]], pickup: true },
  power:      { intro: 300,  action: 'pickup',   boxes: [[0, C.PICKUP_HEIGHT, 0.8, 0.9]], pickup: true, power: true }, // rare power-up, same telegraph as the health pickup
};
for (const [k, d] of Object.entries(DEFS)) { d.arch ??= k; d.top = Math.max(...d.boxes.map(b => b[1] + b[3] / 2)); d.halfW = Math.max(...d.boxes.map(b => b[0] + b[2] / 2)); d.width = Math.max(...d.boxes.map(b => b[0] + b[2] / 2)) - Math.min(...d.boxes.map(b => b[0] - b[2] / 2)); d.height = Math.max(...d.boxes.map(b => b[1] + b[3] / 2)) - (d.fly !== undefined ? Math.min(...d.boxes.map(b => b[1] - b[3] / 2)) : 0); }

export const HOP_APEX = C.JUMP_MIN_HEIGHT + C.JUMP_CUT_VELOCITY ** 2 / (2 * -C.GRAVITY); // apex of a tapped jump (≈1.6 u)
export const DUCK_HEIGHT = 1.0;  // u, robot height while ducking (must match robot.js duck hitbox)

// Minimum time between two obstacles arriving at the robot so the second is always physically clearable.
export const MIN_GAP_TIME = C.GAP_FACTOR * AIRTIME;

// Time until an obstacle at x (moving toward the robot at speed × mult) reaches the robot.
export const timeToPlayer = (x, speed, mult = 1) => (x - C.ROBOT_X) / (speed * mult);

// Lead time a freshly spawned obstacle gives the player at a given speed. Asserted at startup.
export const leadTime = (speed, mult = 1) => timeToPlayer(C.SPAWN_X, speed, mult);
export const REQUIRED_LEAD = C.REACTION_TIME + AIRTIME;

// Can `type` be spawned now given the most recently spawned obstacle (or null)?
// prev = { x, mult, action }. Enforces the gap guarantee in the *time* domain so a faster-moving
// wheel can never close the gap behind a static rock, and adds a recovery margin after a duck.
export function canSpawn(type, prev, speed) {
  const def = DEFS[type];
  if (!prev) return true;
  const tNew = timeToPlayer(C.SPAWN_X, speed, def.speedMult ?? 1);
  const tPrev = timeToPlayer(prev.x, speed, prev.mult ?? 1);
  let need = MIN_GAP_TIME;
  if (prev.action === 'duck') need += 0.15;                       // stand back up before the next one
  if (def.action === 'duck' && prev.action !== 'run') need += 0.1; // land, then duck
  return tNew - tPrev >= need;
}

// Validate a whole pattern: list of { type, t } arrival times (s). Returns null if OK or a reason string.
export function validatePattern(pattern, speed) {
  for (let i = 0; i < pattern.length; i++) {
    const def = DEFS[pattern[i].type]; if (!def) return `unknown type ${pattern[i].type}`;
    if (def.pickup) continue;
    if (leadTime(speed, def.speedMult ?? 1) < REQUIRED_LEAD) return `${pattern[i].type} lead time too short at speed ${speed}`;
    if (i === 0) continue;
    const prev = pattern[i - 1], pdef = DEFS[prev.type]; if (pdef.pickup) continue;
    const gap = pattern[i].t - prev.t;
    const prevAsObj = { x: C.ROBOT_X + prev.t * speed * (pdef.speedMult ?? 1), mult: pdef.speedMult ?? 1, action: pdef.action };
    // Reconstruct the same check canSpawn makes, but for arbitrary arrival times.
    let need = MIN_GAP_TIME;
    if (pdef.action === 'duck') need += 0.15;
    if (def.action === 'duck' && pdef.action !== 'run') need += 0.1;
    if (gap < need - 1e-9) return `${prev.type}→${pattern[i].type} gap ${gap.toFixed(2)}s < ${need.toFixed(2)}s`; // epsilon: an authored gap of exactly 1.0 × the minimum is the minimum
    void prevAsObj;
  }
  return null;
}

// Geometry sanity: every obstacle is clearable by its declared action. Run at startup and in tests.
export function checkClearable() {
  const problems = [];
  for (const [name, d] of Object.entries(DEFS)) {
    if (d.pickup) continue;
    const top = Math.max(...d.boxes.map(b => b[1] + b[3] / 2));
    const bottom = Math.min(...d.boxes.map(b => b[1] - b[3] / 2));
    const apex = C.JUMP_VELOCITY ** 2 / (2 * -C.GRAVITY);
    if (d.action === 'jump' && top > HOP_APEX * 0.9) problems.push(`${name}: too tall (${top}) for a hop (${HOP_APEX.toFixed(2)})`);
    if (d.action === 'fulljump' && top > apex * 0.8) problems.push(`${name}: too tall (${top}) for a full jump (${apex.toFixed(2)})`);
    if (d.action === 'duck' && bottom < DUCK_HEIGHT * 1.15) problems.push(`${name}: bottom ${bottom} too low to duck under`);
  }
  return problems;
}

// Runtime spawner: a chunk-based generator (chunks.js), pure so the fairness tests can drive it for thousands of runs. Tracks the last
// spawn's position itself. Draws chunks from a weighted bag inside a difficulty band that widens with score; the same chunk never repeats
// within the last two, a skill tag never runs more than twice, an easy chunk always follows a hit, pickups/power-ups arrive on their
// fixed cadence, and a rest beat (an empty 1.5–2 s) lands every ~20 s.
import { CHUNKS, CHUNK_RULES as R } from './chunks.js';
export class Spawner {
  constructor(rng = Math.random, chunks = CHUNKS) { this.rng = rng; this.chunks = chunks; this.flavour = null; this.stats = {}; this.reset(); }
  reset() { this.cooldown = 1.2; this.sincePickup = 0; this.sincePower = 0; this.count = 0; this.recent = []; this.last = null; this.queue = []; this.recentIds = []; this.skillRun = 0; this.lastSkill = null; this.forceEasy = false; this.restT = 0; this.nextRest = R.restEvery; this.chunkId = null; }
  setFlavour(w) { this.flavour = w ?? null; } // { jump, timing, rhythm } weights
  hit() { this.forceEasy = true; } // fairness: the next chunk is easy
  band(score) { return Math.min(10, 1 + Math.floor(score / R.bandPoints)); }
  pickChunk(score) {
    const band = this.forceEasy ? R.easyAfterHit : this.band(score), banSkill = this.skillRun >= R.skillRunCap ? this.lastSkill : null;
    let pool = this.chunks.filter(c => c.diff <= band && !this.recentIds.includes(c.id) && c.skill !== banSkill && c.items.every(([t]) => DEFS[t].intro <= score));
    if (!pool.length) pool = this.chunks.filter(c => c.diff <= band && c.items.every(([t]) => DEFS[t].intro <= score)); // tiny bands: relax the repeat rules rather than stall
    const w = pool.map(c => (this.flavour?.[c.skill] ?? 1) * (0.6 + 0.4 * c.diff / band)); // within the band, lean toward its top so progress is felt
    let r = this.rng() * w.reduce((a, b) => a + b, 0); let c = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) { c = pool[i]; break; } }
    this.recentIds.push(c.id); if (this.recentIds.length > R.noRepeatWithin) this.recentIds.shift();
    this.skillRun = c.skill === this.lastSkill ? this.skillRun + 1 : 1; this.lastSkill = c.skill; this.forceEasy = false; this.chunkId = c.id; this.stats[c.id] = (this.stats[c.id] ?? 0) + 1;
    return c;
  }
  fill(score, wantPickup, wantPower) {
    if (wantPickup && this.sincePickup >= C.PICKUP_EVERY) { this.queue.push(['pickup', 1]); return; }
    if (wantPower && score >= DEFS.power.intro && this.sincePower >= C.POWER_EVERY) { this.queue.push(['power', 1]); return; }
    if (this.restT >= this.nextRest) { this.restT = 0; this.nextRest = R.restEvery + (this.rng() * 2 - 1) * R.restJitter; this.cooldown += R.restSeconds[0] + this.rng() * (R.restSeconds[1] - R.restSeconds[0]); this.stats.rest = (this.stats.rest ?? 0) + 1; }
    for (const it of this.pickChunk(score).items) this.queue.push(it);
  }
  // Advance by dt; returns the type to spawn at SPAWN_X now, or null. wantPickup: a pickup would be useful (shields missing).
  tick(dt, speed, score, wantPickup, wantPower = false) {
    if (this.last) this.last.x -= speed * this.last.mult * dt;
    this.restT += dt; this.cooldown -= dt; if (this.cooldown > 0) return null;
    if (!this.queue.length) { this.fill(score, wantPickup, wantPower); if (this.cooldown > 0) return null; }
    const [type, gap] = this.queue[0];
    if (!canSpawn(type, this.last, speed)) return null; // safety net in the time domain (chaser speed, lead time); authored gaps already satisfy it
    this.queue.shift(); const d = DEFS[type];
    this.last = { x: C.SPAWN_X, mult: d.speedMult ?? 1, action: d.action }; this.count++;
    if (d.power) this.sincePower = 0; else if (d.pickup) this.sincePickup = 0; else { this.sincePickup++; this.sincePower++; this.recent.push(type); if (this.recent.length > 2) this.recent.shift(); }
    const ease = 1 + 0.3 * Math.min(1, Math.max(0, (speed - C.SPEED_START) / (C.SPEED_CAP.normal - C.SPEED_START))); // faster = slightly longer relative gaps
    this.cooldown = (gap * ease - 1) * MIN_GAP_TIME; // canSpawn enforces the minimum; this is the authored extra
    return type;
  }
}
// Load-time check: every chunk, expanded at every speed cap, must pass the pattern validator. Returns problems (empty = OK).
export function checkChunks(chunks = CHUNKS) {
  const problems = [];
  for (const c of chunks) {
    if (!(c.diff >= 1 && c.diff <= 10)) problems.push(`${c.id}: difficulty ${c.diff} outside 1–10`);
    for (const [t, gap] of c.items) { if (!DEFS[t] || DEFS[t].pickup) problems.push(`${c.id}: unknown type ${t}`); if (!(gap >= 1)) problems.push(`${c.id}: gap ${gap} < 1 (minimum clearable spacing)`); }
    for (const cap of Object.values(C.SPEED_CAP)) { let t = 0; const pat = c.items.map(([type, gap]) => ({ type, t: (t += gap * MIN_GAP_TIME) })); const why = validatePattern(pat, cap); if (why) problems.push(`${c.id} @ ${cap} u/s: ${why}`); }
  }
  return problems;
}

// Which non-pickup types are unlocked at this score.
export const unlockedTypes = score => Object.keys(DEFS).filter(k => !DEFS[k].pickup && DEFS[k].intro <= score);

// Random extra gap (seconds) above the minimum. rnd in [0,1).
export const gapTime = (rnd, speed) => {
  // Faster = slightly longer relative gaps, so density stays fair as reaction distance shrinks.
  const ease = 1 + 0.3 * Math.min(1, (speed - C.SPEED_START) / (C.SPEED_CAP.normal - C.SPEED_START));
  return MIN_GAP_TIME * ease * (1 + rnd * (C.GAP_RANDOM - 1));
};
