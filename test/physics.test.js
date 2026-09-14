import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG as C, APEX, AIRTIME } from '../src/config.js';
import { Player } from '../src/physics.js';

const run = (p, secs, dt = 1 / 120) => { let ev = {}, maxY = 0; for (let t = 0; t < secs; t += dt) { const e = p.update(dt); ev.jumped ||= e.jumped; ev.landed ||= e.landed; maxY = Math.max(maxY, p.y); } return { ...ev, maxY }; };

test('held jump reaches the full apex, tapped jump is a short hop', () => {
  const full = new Player(); full.pressJump(); const a = run(full, 1);
  assert.ok(a.jumped && a.landed && Math.abs(a.maxY - APEX) < 0.15, `apex ${a.maxY}`);
  const tap = new Player(); tap.pressJump(); tap.update(1 / 60); tap.releaseJump(); const b = run(tap, 1);
  assert.ok(b.maxY < a.maxY * 0.6 && b.maxY > C.JUMP_MIN_HEIGHT, `hop ${b.maxY}`);
});

test('input buffer: a press just before landing fires on touchdown', () => {
  const p = new Player(); p.pressJump(); p.releaseJump();
  while (!p.update(1 / 120).landed) if (p.vy < 0 && p.y < 0.5) { p.pressJump(); p.releaseJump(); }
  assert.ok(p.update(1 / 120).jumped || !p.grounded, 'second jump did not fire from buffer');
});

test('coyote time: jump works shortly after leaving the ground, not long after', () => {
  // Simulate running off a ledge: lift the player so the flat ground does not catch them immediately.
  const p = new Player(); p.y = 3; p.leaveGround();
  p.update(C.COYOTE_TIME * 0.5); p.pressJump(); assert.ok(p.update(1 / 120).jumped);
  const q = new Player(); q.y = 3; q.leaveGround();
  q.update(C.COYOTE_TIME * 1.5); q.pressJump(); assert.ok(!q.update(1 / 120).jumped);
});

test('fast fall lands sooner; duck only applies on the ground', () => {
  const a = new Player(); a.pressJump(); let ta = 0; while (!a.update(1 / 120).landed) ta += 1 / 120;
  const b = new Player(); b.pressJump(); b.setDuck(true); let tb = 0; while (!b.update(1 / 120).landed) tb += 1 / 120;
  assert.ok(tb < ta * 0.8, `fast fall ${tb} vs ${ta}`);
  assert.equal(b.ducking, true); const c = new Player(); c.pressJump(); c.update(1 / 60); c.setDuck(true); c.update(1 / 60); assert.equal(c.ducking, false);
});

// ---- Fixed timestep: the arc is a function of tick count only, so it is identical on every machine and refresh rate ----
test('120 Hz tick: full jump reaches the analytic apex and airtime, a tap gives a hop, and press/release edges are never lost', () => {
  const dt = 1 / C.TICK_RATE, p = new Player();
  p.pressJump(); let apex = 0, ticks = 0; do { p.update(dt); apex = Math.max(apex, p.y); ticks++; } while (!p.grounded && ticks < 1000);
  assert.ok(Math.abs(apex - APEX) < APEX * 0.04, `apex ${apex.toFixed(2)} vs ${APEX.toFixed(2)}`);
  assert.ok(Math.abs(ticks * dt - AIRTIME) < 0.03, `airtime ${(ticks * dt).toFixed(3)} vs ${AIRTIME.toFixed(3)}`);
  const q = new Player(); q.pressJump(); q.releaseJump(); let hop = 0; for (let i = 0; i < 200 && (i === 0 || !q.grounded); i++) { q.update(dt); hop = Math.max(hop, q.y); }
  assert.ok(hop < apex * 0.6 && hop > 1.0, `hop ${hop.toFixed(2)}`); // press+release inside one tick = a tap, never swallowed, never a full jump
  const r = new Player(); r.pressJump(); r.update(dt); assert.equal(r.grounded, false); r.pressJump(); // a second press mid-air only buffers
  let jumps = 0; for (let i = 0; i < 400; i++) { const e = r.update(dt); if (e.jumped) jumps++; if (r.grounded && r.buffer === 0) break; }
  assert.ok(jumps <= 1, 'a buffered press must not fire twice');
});
