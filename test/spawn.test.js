import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG as C, AIRTIME } from '../src/config.js';
import { DEFS, canSpawn, validatePattern, checkClearable, leadTime, REQUIRED_LEAD, MIN_GAP_TIME, unlockedTypes, gapTime } from '../src/spawn.js';

test('every obstacle is clearable by its declared action', () => assert.deepEqual(checkClearable(), []));

test('lead time is enough at the speed cap for every obstacle, both modes', () => {
  for (const cap of Object.values(C.SPEED_CAP)) for (const d of Object.values(DEFS))
    assert.ok(leadTime(cap, d.speedMult ?? 1) >= REQUIRED_LEAD, `lead ${leadTime(cap, d.speedMult ?? 1).toFixed(2)} < ${REQUIRED_LEAD.toFixed(2)} at ${cap}`);
});

test('min gap is 1.4 × airtime', () => assert.ok(Math.abs(MIN_GAP_TIME - 1.4 * AIRTIME) < 1e-9));

test('canSpawn refuses an obstacle too close behind the previous one', () => {
  const speed = 20;
  // previous rock right at spawn point: same arrival time → refuse
  assert.equal(canSpawn('rock_small', { x: C.SPAWN_X, mult: 1, action: 'jump' }, speed), false);
  // previous rock already travelled far enough → allow
  const okX = C.SPAWN_X - MIN_GAP_TIME * speed - 0.01;
  assert.equal(canSpawn('rock_small', { x: okX, mult: 1, action: 'jump' }, speed), true);
  assert.equal(canSpawn('rock_small', { x: okX + 1, mult: 1, action: 'jump' }, speed), false);
});

test('a faster wheel cannot be spawned where it would catch up to a rock', () => {
  const speed = 20, prevX = C.SPAWN_X - MIN_GAP_TIME * speed - 0.01; // fine for a rock...
  assert.equal(canSpawn('rock_small', { x: prevX, mult: 1, action: 'jump' }, speed), true);
  assert.equal(canSpawn('wheel', { x: prevX, mult: 1, action: 'jump' }, speed), false); // ...not for a wheel
});

test('duck obstacles get extra recovery margin', () => {
  const speed = 20, x = C.SPAWN_X - MIN_GAP_TIME * speed - 0.01;
  assert.equal(canSpawn('rock_small', { x, mult: 1, action: 'duck' }, speed), false);
  assert.equal(canSpawn('rock_small', { x: x - 0.15 * speed, mult: 1, action: 'duck' }, speed), true);
});

test('validatePattern accepts a fair sequence and rejects an unwinnable one', () => {
  const speed = 18, g = MIN_GAP_TIME;
  assert.equal(validatePattern([{ type: 'rock_small', t: 2 }, { type: 'drone_mid', t: 2 + g + 0.1 }, { type: 'fence', t: 2 + 2 * g + 0.3 }], speed), null);
  assert.match(validatePattern([{ type: 'rock_small', t: 2 }, { type: 'drone_mid', t: 2 + g }], speed) ?? '', /gap/);
  assert.match(validatePattern([{ type: 'fence', t: 2 }, { type: 'rock_tall', t: 2.3 }], speed) ?? '', /gap/);
  assert.match(validatePattern([{ type: 'nope', t: 0 }], speed) ?? '', /unknown/);
});

test('unlock order matches the design table', () => {
  assert.deepEqual(unlockedTypes(0).sort(), ['rock_cluster', 'rock_small', 'rock_tall']);
  assert.ok(unlockedTypes(150).includes('barrel') && !unlockedTypes(149).includes('barrel'));
  assert.ok(unlockedTypes(1000).includes('wheel') && !unlockedTypes(999).includes('wheel'));
});

test('random gap never dips below the minimum', () => {
  for (const s of [12, 20, 34]) for (const r of [0, 0.5, 0.999]) assert.ok(gapTime(r, s) >= MIN_GAP_TIME);
});
