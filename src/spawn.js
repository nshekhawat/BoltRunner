// Pure spawn-safety maths. No three.js here so it is unit-testable in node.
import { CONFIG as C, AIRTIME } from './config.js';

// Obstacle definitions: what the player must do, and where the hitboxes are (local to the obstacle group).
// box = [cx, cy, w, h] in world units (y measured from the ground). action: jump | fulljump | duck | run | pickup.
export const DEFS = {
  rock_small:   { intro: 0,    action: 'jump',     boxes: [[0, 0.5, 1.0, 1.0]] },
  rock_tall:    { intro: 0,    action: 'fulljump', boxes: [[0, 0.9, 1.1, 1.8]] },
  rock_cluster: { intro: 0,    action: 'fulljump', boxes: [[-1.1, 0.4, 0.9, 0.8], [0, 0.65, 1.0, 1.3], [1.1, 0.4, 0.9, 0.8]] },
  barrel:       { intro: 150,  action: 'jump',     boxes: [[0, 0.65, 0.9, 1.3]] },
  fence:        { intro: 350,  action: 'fulljump', boxes: [[0, 0.75, 2.6, 1.5]] },
  drone_low:    { intro: 550,  action: 'jump',     boxes: [[0, 0.85, 1.2, 0.8]], fly: 0.85 },
  drone_mid:    { intro: 550,  action: 'duck',     boxes: [[0, 1.95, 1.2, 0.8]], fly: 1.95 },
  drone_tall:   { intro: 550,  action: 'fulljump', boxes: [[0, 1.45, 1.2, 1.7]], fly: 1.45 },
  vent:         { intro: 800,  action: 'fulljump',     boxes: [[0, 1.0, 0.9, 2.0]], telegraph: true },
  wheel:        { intro: 1000, action: 'jump',     boxes: [[0, 0.7, 1.4, 1.4]], speedMult: C.WHEEL_SPEED_BONUS },
  battery:      { intro: 0,    action: 'pickup',   boxes: [[0, 1.3, 0.8, 1.0]], pickup: true },
};

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
    if (gap < need) return `${prev.type}→${pattern[i].type} gap ${gap.toFixed(2)}s < ${need.toFixed(2)}s`;
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

// Which non-pickup types are unlocked at this score.
export const unlockedTypes = score => Object.keys(DEFS).filter(k => !DEFS[k].pickup && DEFS[k].intro <= score);

// Random extra gap (seconds) above the minimum. rnd in [0,1).
export const gapTime = (rnd, speed) => {
  // Faster = slightly longer relative gaps, so density stays fair as reaction distance shrinks.
  const ease = 1 + 0.3 * Math.min(1, (speed - C.SPEED_START) / (C.SPEED_CAP.normal - C.SPEED_START));
  return MIN_GAP_TIME * ease * (1 + rnd * (C.GAP_RANDOM - 1));
};
