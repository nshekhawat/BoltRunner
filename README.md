# Bolt Runner

A friendly 3D endless runner in the spirit of the Chrome offline T-Rex game, built with
Three.js. The runner is a chunky robot called Bolt. Designed for a seven-year-old: three
shields instead of instant death, generous timing windows, a hard speed cap, and no scary
failure states.

v2 adds four selectable worlds (desert canyon, neon city, temple jungle, frost peak), a
Journey mode that runs through all of them, a health pickup that is recognisable in every
world, a full settings screen, and progression (records, cosmetics, ghost, power-ups,
sticker book, photo mode). No ads, purchases, accounts, analytics or network calls.

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
| Jump (hold for a higher jump) | Space, ↑, W (+ one remappable key) | Tap anywhere |
| Duck / fast-fall | ↓, S (+ one remappable key) | Swipe down, or hold the DUCK button |
| Pause / resume | P, Escape | Tap the overlay |
| Browse worlds | ← → then Space / Enter | Swipe the cards, tap to pick |
| Mute | M | Speaker icon |

One-button play: on the select screen the highlight walks along by itself after a few
quiet seconds, so a single button (or tap) can pick a world and play.

Debug keys: `F` shows FPS, quality tier, `renderer.info.memory` counts and the current
biome/phase; `H` toggles wireframe hitboxes; `D` cycles Kid / Normal / No-Fail on the
title screen. URL parameters: `?q=low|medium|high` forces a quality tier,
`?biome=city` starts in a world, `?phase=2` shifts the day/night cycle by two phases.
`window.bolt` exposes `game`, `world`, `journey`, `switchBiome(id)` and
`contrastTest()` in the console.

## Worlds

| id | World | Obstacles (small · tall · wide · flyer · hazard · chaser) |
|---|---|---|
| `desert` | Sunset Canyon | cactus · saguaro · cactus cluster · vulture · steam vent · tumbleweed |
| `city` | Neon City | traffic cone · hydrant + post box · oil drums · delivery drone · manhole steam · runaway trolley |
| `jungle` | Temple Jungle | mossy log · stone idol · fallen trunk · parrot flock · spore geyser · rolling boulder |
| `frostpeak` | Frost Peak | ice chunk · icicle spike · snow-buried car · snowy owl · cracking ice plume · snowball |

**The six archetypes keep identical hitboxes, spawn timing and clearance maths in every
world.** Only mesh, texture, colour, particles and sound change. Timing learned in the
desert transfers to the city.

| Archetype | Hitbox (w × h) | Action | Unlocks at |
|---|---|---|---|
| `small` | 0.9 × 1.0 | hop | 0 |
| `tall` | 0.8 × 1.9 | full jump | 0 |
| `wide` | 2.4 × 1.2 | full jump | 250 |
| `flyer` | 1.0 × 0.8 at 0.85 / 1.95 / 1.45 u | hop / duck / full jump | 500 |
| `hazard` | 1.2 × 2.0, telegraphed 0.6 s | full jump (only while erupting) | 800 |
| `chaser` | 1.1 × 1.1, moves at speed × 1.15 | hop | 1000 |

**Journey** switches world every 700 points. The next world (textures, materials, obstacle
pools, compiled shaders) is built on idle callbacks during the previous segment; the robot
then runs through an enclosed gateway of light and the swap happens while the view is
enclosed (about 1 ms of scene operations). The day/night cycle continues across the seam.
Frame time is asserted during every transition (`console.assert` if a frame exceeds 20 ms;
`bolt.journey.frameMax` and `.log` hold the numbers).

### The health pickup

A constant recognition layer plus a decorative shell:

- Invariant everywhere: pulsing white → cyan core (0.27 u sphere), a spinning ring with
  knobs facing the camera, fixed height 1.2 u (always in the jump path), 1.2 Hz bob, a
  vertical light beam two seconds before arrival, the same chime and burst.
- Contrast guarantee: a backing plate behind the core, drawn with depth test off (visible
  through fog, rain, snow, dust). The plate is pure black or pure white depending on the
  measured luminance of what is actually behind the lane (a 6×6 pixel readback every 1.5 s,
  asynchronous through a pixel-pack buffer so it never stalls the GPU). A rim sprite around
  the plate and the beam carry the biome palette's complementary hue.
- Per-world shells never cross the core: brass fins (desert), open neon frame (city),
  crystal petals in glowing vine loops (jungle), ice rings with frost crystals (frost peak).
- `bolt.contrastTest()` renders every world at noon and night under every colour palette,
  samples the pixels behind the pickup and the pickup itself, and reports the median
  per-pixel WCAG contrast ratio. All 32 combinations are at or above 4.5:1.
- First-seen tutorial beat: the first pickup of a session slows the world to 60 % for a
  second with a big "HEALTH" label. Any press skips it.

## Settings

Everything on the settings screen persists in `localStorage` under `boltrunner.v2`.

- Gameplay: Kid / Normal / No-Fail practice (hits only cost points), Jump Assist
  (auto-jumps when an obstacle is unavoidably close), starting speed.
- Visual: quality tier, High-Contrast Mode (scenery desaturated 60 %, obstacles and pickup
  saturated, scenery bloom off), Reduce Motion, screen shake, colourblind palettes
  (deuteranopia / protanopia / tritanopia), FPS, camera distance.
- Audio: music and SFX sliders, master mute, ambience (wind, rain, jungle, blizzard).
- Controls: extra jump/duck key, left- or right-handed touch layout (side of the DUCK
  button), hold-to-jump sensitivity.
- Parent: break reminder at 15 / 30 / 45 minutes (pauses with a gentle card, never locks),
  Reset All Progress behind a confirm.

## Progression

- Per-world records (best distance, time, most cleared, longest combo) on the select cards.
- Cosmetics unlock by lifetime distance: paints, antenna toppers, trail colours. The select
  screen shows the next unlock and a progress bar. Nothing is for sale.
- Ghost: a translucent robot replays your best run in that world (y sampled at 10 Hz,
  stored per world). Toggle in settings.
- Power-ups (5–8 s, on-screen timer ring, never two at once, same beam telegraph):
  Shield Bubble, Magnet, Slow-Mo, Rocket Boost.
- Sticker book: lifetime numbers, obstacles cleared by type, and badges.
- Photo mode on pause: HUD hidden, drag to orbit, saves a PNG from the canvas.

## Adding a fifth biome

An environment is data. Two files change:

1. Create `src/biomes/<id>.js` exporting one object that satisfies the schema in
   `src/biomes/schema.js`. `validateBiome` runs at load time and throws a readable list of
   everything missing.
2. Import it in `src/biomes/registry.js` and add it to the array.

The contract (`SCHEMA` in `schema.js`):

```js
{
  id, displayName, tagline,
  palette:  { sky, fog, ground, accent, rim, obstacleTints[] },       // hex numbers
  lighting: { keyColor, keyIntensity, hemiSky, hemiGround, fogDensity, exposure, bloomThreshold },
  startPhase,                                  // index into dayNight the world opens on
  dayNight: [dawn, noon, dusk, night],         // presets: top, horizon, fog, sun, sunI, hemiSky, hemiGround,
                                               //   hemiI, env, elev, stars, shafts, eyeLight, trail, cloud (+ optional aurora)
  *makeMaterials(ctx),                         // generator: `yield` between expensive textures; returns the material bag M
  ground:   { makeTexture(ctx), makeNormal(ctx), makeRoughness?(ctx), scrollDetail, material },
  lane:     { makeTexture(ctx), width },       // transparent strip along the lane (tyre tracks, road markings, roots)
  parallax: [ { makeLayer(ctx, M, i), speedFactor, y, z, len, update?(layer, dt, t) }, ... ],  // ≥ 3
  props:    [ { make(ctx, M, i), every: [min, max], z: [min, max], count, scale?, update?(g, dt, t) }, ... ],
  particles: { ambient: [ { count, color, size, vel, area: {x, y, z}, opacity?, texture?, sway?, scroll?, blink?, additive? } ],
               impact: { colors, n, speed, gravity, life }, trail: { colors }, breath?: { colors, every } },
  obstacles: { small, tall, wide, flyer, hazard, chaser },   // each { makeMesh(ctx, M, type), impact: timbre }
  pickup:   { makePickupShell(ctx, M) },
  audio:    { musicPreset, ambientBed, impactTimbre, footstepTimbre },
  robotAccent: { emissive, trailColor },
}
```

`ctx` gives every factory `THREE`, mesh primitives (`prim.box/cyl/cone/sphere/plane/group`),
texture helpers (`tex.canvasTexture/heightToNormal/makeNoiseTexture/clone`, tracked for
disposal), `std`/`basic` material constructors, `shared` textures and materials, a seeded
`rnd(seed)`, and `viewDir` (the chase camera's direction, for camera-facing decor).

Rules the engine enforces for you:

- Obstacle meshes are auto-scaled to the archetype box at build time. A warning is logged
  when more than 15 % scaling is needed (`bolt.game.obstacles.fit` lists the factors).
- Named children get archetype animation: `spin` (rotors), `flap` (wings, `userData.side`
  and `userData.base`), `roll` (wheels, `userData.r`), `plume` (hazard eruption),
  `flicker` (blinking part).
- `userData.noOutline` skips the rim outline (in `palette.rim`) for a mesh.
- Ambient particles must live behind or beside the lane (`area.z` ≤ −1.5), never in front.
- Everything the instance creates is disposed on switch; `renderer.info.memory` returns to
  the same numbers.

## Tuning

Every number lives in `src/config.js`, each with a comment. The ones that matter most:

| Constant | Default | Effect |
|---|---|---|
| `GRAVITY` / `JUMP_VELOCITY` | -55 / 19 | Full-hold apex ≈ 3.3 u, airtime ≈ 0.69 s |
| `JUMP_MIN_HEIGHT` / `JUMP_CUT_VELOCITY` | 1.0 / 8 | Variable jump (hold sensitivity setting changes the first) |
| `COYOTE_TIME` / `INPUT_BUFFER` | 120 ms / 150 ms | Forgiveness windows |
| `SPEED_START` / `SPEED_ACCEL` / `SPEED_CAP` | 12 / 0.30 / kid 26, normal 34, nofail 26 | Difficulty curve |
| `HITBOX_SCALE` | kid 0.8, normal 0.9 | Collision boxes as a fraction of visual size |
| `GAP_FACTOR` | 1.4 | Minimum spacing = 1.4 × speed × airtime |
| `DAY_CYCLE_POINTS` | 700 | Lighting phase change, and Journey's world change |
| `PICKUP_EVERY` / `POWER_EVERY` | 12 / 22 | Obstacles between pickups / power-ups |
| `ASSIST_TIME` | 0.32 s | Jump Assist reaction window |

## How fairness is enforced

`src/spawn.js` is pure JavaScript with no Three.js so it can be unit-tested:

- `canSpawn` works in the *time* domain, so a chaser that moves faster than the scroll can
  never close the gap behind a static obstacle.
- `checkClearable` verifies every archetype's hitbox against the hop apex, full-jump apex
  or duck height for its declared action.
- `leadTime` is asserted at startup for every archetype at every speed cap.
- The `Spawner` class is the real runtime spawner; the tests drive it for 10,000 sequences
  per world per difficulty and validate every arrival pattern.

```sh
node --test test/      # 29 tests: physics, spacing maths, schema, 4 worlds × 3 difficulties × 10,000 sequences
node check.mjs         # headless Chrome smoke test (console errors, 404s, screenshots)
```

`check.mjs` options: `[seconds]`, `[query string]`, `--keys=Space,Space,ArrowRight`,
`--js="…"` (runs after the keys), `--eval="…"` (result printed, promises awaited),
`--shot=out.png`, `--size=W,H`, `--mobile` (Galaxy S24 Ultra viewport + touch),
`--touch` (drives a whole run by touch), `--gpu` (real GPU instead of SwiftShader, for
frame-time checks). Example verification commands:

```sh
node check.mjs 6 "q=low" --keys=Space --eval="JSON.stringify(bolt.contrastTest().pass)"
node check.mjs 10 --gpu --keys=Space --js="for(let i=0;i<10;i++)bolt.switchBiome(['city','jungle','frostpeak','desert'][i%4])" --eval="JSON.stringify(bolt.renderer.info.memory)"
```

## Files

```
index.html          import map, canvas, HUD, overlays (title, select, settings, robot, stickers, pause, photo, end)
style.css           HUD and card styles
src/config.js       every tunable constant
src/main.js         renderer, post-processing, camera, quality tiers, biome loading, journey hooks, settings hooks, loop
src/game.js         state machine, input, scoring, shields, power-ups, ghost, jump assist, records
src/physics.js      player jump/duck controller (pure, tested)
src/spawn.js        archetype table, gap maths, pattern validator, Spawner (pure, tested)
src/obstacles.js    pooled obstacle meshes fitted to archetypes, collision, health pickup recognition layer, power orb
src/journey.js      Journey scheduling, gateway of light, frame-time assertion
src/select.js       world carousel
src/settings.js     settings schema, DOM, persistence
src/cosmetics.js    paints, toppers, trails, unlock ladder
src/stickers.js     sticker definitions
src/palettes.js     pickup/heart colours incl. colourblind variants
src/robot.js        procedural robot rig, animations, cosmetics, ghost variant
src/world.js        lights, sky shader (sun, moon, stars, aurora), clouds, shafts, day/night blending, scrolling
src/textures.js     noise, canvas textures, normal maps, shared materials, High-Contrast shader injection
src/fx.js           pooled particles
src/audio.js        Web Audio synth SFX, impact timbres, music presets, ambient beds
src/hud.js          DOM HUD, power ring, sticker page
src/store.js        localStorage persistence (versioned key)
src/debug.js        contrast test harness
src/biomes/         schema.js, registry.js, index.js (loader/disposal), desert.js, city.js, jungle.js, frostpeak.js
test/               node:test unit tests
check.mjs           headless Chrome harness
```

## Quality tiers

High (shadows, bloom, all particles), Medium (shadows, no bloom), Low (no shadows, no
post-processing, fewer particles). Auto picks a tier from the GPU string and a one-second
FPS probe, and drops a tier if FPS stays under 45 for 3 seconds. The settings screen or the
title-screen button overrides it.
