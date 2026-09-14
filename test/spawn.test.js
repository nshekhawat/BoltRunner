import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG as C, AIRTIME } from '../src/config.js';
import { DEFS, Spawner, canSpawn, validatePattern, checkClearable, leadTime, REQUIRED_LEAD, MIN_GAP_TIME, unlockedTypes, gapTime, timeToPlayer } from '../src/spawn.js';
import { BIOMES } from '../src/biomes/registry.js';
import { ARCHETYPES } from '../src/biomes/schema.js';

test('every obstacle is clearable by its declared action', () => assert.deepEqual(checkClearable(), []));

test('lead time is enough at the speed cap for every obstacle, both modes', () => {
  for (const cap of Object.values(C.SPEED_CAP)) for (const d of Object.values(DEFS))
    assert.ok(leadTime(cap, d.speedMult ?? 1) >= REQUIRED_LEAD, `lead ${leadTime(cap, d.speedMult ?? 1).toFixed(2)} < ${REQUIRED_LEAD.toFixed(2)} at ${cap}`);
});

test('min gap is 1.4 × airtime', () => assert.ok(Math.abs(MIN_GAP_TIME - 1.4 * AIRTIME) < 1e-9));

test('canSpawn refuses an obstacle too close behind the previous one', () => {
  const speed = 20;
  // previous rock right at spawn point: same arrival time → refuse
  assert.equal(canSpawn('small', { x: C.SPAWN_X, mult: 1, action: 'jump' }, speed), false);
  // previous rock already travelled far enough → allow
  const okX = C.SPAWN_X - MIN_GAP_TIME * speed - 0.01;
  assert.equal(canSpawn('small', { x: okX, mult: 1, action: 'jump' }, speed), true);
  assert.equal(canSpawn('small', { x: okX + 1, mult: 1, action: 'jump' }, speed), false);
});

test('a faster chaser cannot be spawned where it would catch up to a static obstacle', () => {
  const speed = 20, prevX = C.SPAWN_X - MIN_GAP_TIME * speed - 0.01; // fine for a rock...
  assert.equal(canSpawn('small', { x: prevX, mult: 1, action: 'jump' }, speed), true);
  assert.equal(canSpawn('chaser', { x: prevX, mult: 1, action: 'jump' }, speed), false); // ...not for a chaser
});

test('duck obstacles get extra recovery margin', () => {
  const speed = 20, x = C.SPAWN_X - MIN_GAP_TIME * speed - 0.01;
  assert.equal(canSpawn('small', { x, mult: 1, action: 'duck' }, speed), false);
  assert.equal(canSpawn('small', { x: x - 0.15 * speed, mult: 1, action: 'duck' }, speed), true);
});

test('validatePattern accepts a fair sequence and rejects an unwinnable one', () => {
  const speed = 18, g = MIN_GAP_TIME;
  assert.equal(validatePattern([{ type: 'small', t: 2 }, { type: 'flyer_low', t: 2 + g + 0.1 }, { type: 'wide', t: 2 + 2 * g + 0.3 }], speed), null);
  assert.match(validatePattern([{ type: 'small', t: 2 }, { type: 'flyer_low', t: 2 + g - 0.1 }], speed) ?? '', /gap/);
  assert.match(validatePattern([{ type: 'wide', t: 2 }, { type: 'tall', t: 2.3 }], speed) ?? '', /gap/);
  assert.match(validatePattern([{ type: 'nope', t: 0 }], speed) ?? '', /unknown/);
});

test('unlock order matches the design table', () => {
  assert.deepEqual(unlockedTypes(0).sort(), ['small', 'tall']);
  assert.ok(unlockedTypes(250).includes('wide') && !unlockedTypes(249).includes('wide'));
  assert.ok(unlockedTypes(1000).includes('chaser') && !unlockedTypes(999).includes('chaser'));
});

test('random gap never dips below the minimum', () => {
  for (const s of [12, 20, 34]) for (const r of [0, 0.5, 0.999]) assert.ok(gapTime(r, s) >= MIN_GAP_TIME);
});

// ---- Per-biome fairness: every biome × every difficulty × 10,000 generated sequences is physically clearable ---------------
const lcg = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
// Drive the real Spawner at a constant speed; record when each obstacle reaches the robot; validate the arrival pattern.
function simulate(rng, speed, score, n) {
  const sp = new Spawner(rng), live = [], arrived = []; let t = 0; const dt = 1 / 30;
  while (arrived.length < n && t < 200) {
    const type = sp.tick(dt, speed, score, arrived.length % 3 === 0);
    if (type) live.push({ type, x: C.SPAWN_X, mult: DEFS[type].speedMult ?? 1 });
    for (let i = live.length - 1; i >= 0; i--) { live[i].x -= speed * live[i].mult * dt; if (live[i].x <= C.ROBOT_X) { arrived.push({ type: live[i].type, t: t + timeToPlayer(live[i].x, speed, live[i].mult) }); live.splice(i, 1); } }
    t += dt;
  }
  return arrived;
}
for (const id of Object.keys(BIOMES)) {
  test(`biome ${id}: archetype table is complete and identical to every other biome`, () => {
    for (const a of ARCHETYPES) assert.equal(typeof BIOMES[id].obstacles[a].makeMesh, 'function', `${id} lacks ${a}`);
    assert.deepEqual(Object.keys(BIOMES[id].obstacles).sort(), [...ARCHETYPES].sort());
  });
  for (const mode of Object.keys(C.SPEED_CAP)) {
    test(`biome ${id} / ${mode}: 10,000 spawner sequences are all clearable`, () => {
      const rng = lcg(id.length * 7919 + mode.length), cap = C.SPEED_CAP[mode];
      for (let k = 0; k < 10000; k++) {
        const speed = C.SPEED_START + rng() * (cap - C.SPEED_START), score = rng() < 0.5 ? 1200 : Math.floor(rng() * 1200);
        const pat = simulate(rng, speed, score, 6);
        assert.ok(pat.length >= 6, `${id}/${mode}: spawner stalled at speed ${speed.toFixed(1)}`);
        const why = validatePattern(pat, speed); assert.equal(why, null, `${id}/${mode} seq ${k} @${speed.toFixed(1)} u/s: ${why}`);
      }
    });
  }
}
