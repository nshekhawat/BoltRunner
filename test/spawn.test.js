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

// ---- Chunk generator ---------------------------------------------------------------------------------------------------------
import { CHUNKS, CHUNK_RULES, SKILLS } from '../src/chunks.js';
import { checkChunks } from '../src/spawn.js';
test('every authored chunk is clearable at every speed cap, has a difficulty 1–10 and a known skill', () => {
  assert.deepEqual(checkChunks(), []); assert.ok(CHUNKS.length >= 30, `${CHUNKS.length} chunks`);
  for (const c of CHUNKS) assert.ok(SKILLS.includes(c.skill), c.id);
  assert.equal(new Set(CHUNKS.map(c => c.id)).size, CHUNKS.length, 'chunk ids are unique');
});
test('the bag never repeats a chunk within two, never runs a skill three times, and goes easy after a hit', () => {
  const sp = new Spawner(lcg(7)); const ids = [], skills = []; let easyChecks = 0;
  for (let k = 0; k < 3000; k++) { const c = sp.pickChunk(1500); ids.push(c.id); skills.push(c.skill); if (k % 50 === 0) { sp.hit(); const e = sp.pickChunk(1500); assert.ok(e.diff <= CHUNK_RULES.easyAfterHit, `after a hit got ${e.id} (diff ${e.diff})`); easyChecks++; ids.push(e.id); skills.push(e.skill); } }
  for (let i = 2; i < ids.length; i++) { assert.notEqual(ids[i], ids[i - 1]); assert.notEqual(ids[i], ids[i - 2]); }
  let run = 1; for (let i = 1; i < skills.length; i++) { run = skills[i] === skills[i - 1] ? run + 1 : 1; assert.ok(run <= CHUNK_RULES.skillRunCap, `skill ${skills[i]} ran ${run} times at ${i}`); }
  assert.ok(easyChecks > 50);
});
test('difficulty band widens with score and never exceeds the unlocked archetypes', () => {
  const sp = new Spawner(lcg(3));
  for (let k = 0; k < 500; k++) { const c = sp.pickChunk(0); assert.ok(c.diff <= 1, c.id); for (const [t] of c.items) assert.ok(DEFS[t].intro === 0); }
  for (let k = 0; k < 500; k++) { const c = sp.pickChunk(400); assert.ok(c.diff <= 4); for (const [t] of c.items) assert.ok(DEFS[t].intro <= 400, `${c.id} uses ${t} at 400`); }
  const seen = new Set(); for (let k = 0; k < 3000; k++) seen.add(sp.pickChunk(2000).id); assert.equal(seen.size, CHUNKS.length, 'at full band every chunk is drawn');
});
test('coverage: 10,000 sequences per difficulty reach every chunk of the band and include rest beats', () => {
  for (const mode of Object.keys(C.SPEED_CAP)) {
    const rng = lcg(mode.length * 31), cap = C.SPEED_CAP[mode], sp = new Spawner(rng); let rests = 0;
    for (let k = 0; k < 10000; k++) { const speed = C.SPEED_START + rng() * (cap - C.SPEED_START); const before = sp.stats.rest ?? 0; simulateWith(sp, rng, speed, 1500, 4); rests += (sp.stats.rest ?? 0) - before; }
    const ids = Object.keys(sp.stats).filter(k => k !== 'rest'); assert.equal(ids.length, CHUNKS.length, `${mode}: ${ids.length}/${CHUNKS.length} chunks reached`); assert.ok(rests > 100, `${mode}: ${rests} rest beats`);
  }
});
function simulateWith(sp, rng, speed, score, n) { const live = []; let arrived = 0, t = 0; const dt = 1 / 30; while (arrived < n && t < 60) { const type = sp.tick(dt, speed, score, false); if (type) live.push({ type, x: C.SPAWN_X, mult: DEFS[type].speedMult ?? 1 }); for (let i = live.length - 1; i >= 0; i--) { live[i].x -= speed * live[i].mult * dt; if (live[i].x <= C.ROBOT_X) { arrived++; live.splice(i, 1); } } t += dt; } }
