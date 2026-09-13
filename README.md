# Bolt Runner

A friendly 3D endless runner in the spirit of the Chrome offline T-Rex game, built with
Three.js. The runner is a chunky robot called Bolt. Designed for a seven-year-old: three
shields instead of instant death, generous timing windows, a hard speed cap, and no scary
failure states.

## Run it

No build step, no `npm install`. Serve the folder with any static server:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Three.js (`0.186.0`, pinned in the import map in `index.html`) is the only thing loaded from
the network, once, from jsDelivr. Every texture, model and sound is generated in code.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Jump (hold for a higher jump) | Space, ↑, W | Tap anywhere |
| Duck / fast-fall | ↓, S | Swipe down |
| Pause / resume | P, Escape | Tap the overlay |
| Mute | M | Speaker icon |
| Start, play again | Space or tap | Tap |

Debug keys: `F` shows the FPS counter and quality tier, `H` toggles wireframe hitboxes,
`D` toggles Kid / Normal on the menu. URL parameters: `?q=low|medium|high` forces a quality
tier, `?phase=2` starts at night (0 day, 1 sunset, 2 night, 3 dawn).

## Tuning

Every number lives in `src/config.js`, each with a comment. The ones that matter most:

**Physics**

| Constant | Default | Effect |
|---|---|---|
| `GRAVITY` | -55 u/s² | Snappier arcs with larger magnitude |
| `JUMP_VELOCITY` | 19 u/s | Full-hold apex ≈ 3.3 u, airtime ≈ 0.69 s |
| `JUMP_MIN_HEIGHT` / `JUMP_CUT_VELOCITY` | 1.0 u / 8 u/s | Variable jump: release above the min height clamps upward speed, so a tap is a hop and a hold is the full arc |
| `FAST_FALL_MULT` | 3 | Down while airborne multiplies gravity |
| `COYOTE_TIME` / `INPUT_BUFFER` | 120 ms / 150 ms | Forgiveness windows |
| `MAX_DT` | 50 ms | Frame delta clamp so tab switches never teleport the robot |

**Difficulty curve**

| Constant | Default | Effect |
|---|---|---|
| `SPEED_START` | 12 u/s | Scroll speed at the start of a run |
| `SPEED_ACCEL` | 0.30 u/s per s | Acceleration |
| `SPEED_CAP` | kid 26, normal 34 u/s | Hard cap: the game gets hard, never impossible |
| `HITBOX_SCALE` | kid 0.8, normal 0.9 | Collision boxes as a fraction of visual size |
| `SHIELDS_MAX` | 3 | Hearts; a battery pickup restores one |
| `INVULN_TIME` | 0.5 s | Flashing invulnerability after a hit |
| `GAP_FACTOR` | 1.4 | Minimum obstacle spacing = 1.4 × speed × airtime |
| `POINTS_PER_UNIT` | 1 | Score per world unit (about 12 to 26 points per second) |
| `MILESTONE` / `DAY_CYCLE_POINTS` | 100 / 700 | Chime + confetti / lighting phase change |

Obstacles unlock by score (see `DEFS` in `src/spawn.js`): rocks at 0, barrel 150, fence 350,
drones 550, steam vent 800, rolling wheel 1000.

## How fairness is enforced

`src/spawn.js` is pure JavaScript with no Three.js so it can be unit-tested:

- `canSpawn` works in the *time* domain (seconds until the obstacle reaches the robot), so a
  rolling wheel that moves faster than the scroll can never close the gap behind a rock.
- `checkClearable` verifies every obstacle's hitbox height against the hop apex, full-jump
  apex, or duck height for its declared action.
- `leadTime` is asserted at startup for every obstacle at both speed caps: an obstacle must be
  visible for at least reaction time + airtime before it can hit you.
- Duck obstacles get extra recovery margin on both sides.

Run the tests (Node 20+, no dependencies):

```sh
node --test test/
```

`node check.mjs` runs a headless Chrome smoke test that prints console errors and 404s and
can take screenshots (`--shot=out.png`), press keys (`--keys=Space,Space`) and emulate a
360 px phone (`--mobile`).

## Files

```
index.html       import map, canvas, HUD and overlay markup
style.css        HUD, menu, end card
src/config.js    every tunable constant
src/main.js      renderer, environment map, post-processing, camera, quality tiers, loop
src/game.js      state machine, input, scoring, shields, combo, persistence hooks
src/physics.js   player jump/duck controller (pure, tested)
src/spawn.js     obstacle definitions, gap maths, pattern validator (pure, tested)
src/obstacles.js pooled obstacle meshes, hitboxes, runtime spawner
src/robot.js     procedural robot rig and animations
src/world.js     ground, parallax mesas, sky shader, clouds, shafts, dust, day/night
src/textures.js  noise, canvas textures, normal maps, all materials
src/fx.js        pooled particle system (sparks, confetti, steam)
src/audio.js     Web Audio synth SFX and 8-bar music loop
src/hud.js       DOM HUD and overlays
src/store.js     localStorage persistence (versioned key)
test/            node:test unit tests
```

## Quality tiers

High (shadows, bloom, all particles), Medium (shadows, no bloom), Low (no shadows, no
post-processing, fewer particles). Auto mode picks a tier from the GPU string and a one-second
FPS probe, and drops a tier if FPS stays under 45 for 3 seconds. The menu button overrides
and persists the choice.
