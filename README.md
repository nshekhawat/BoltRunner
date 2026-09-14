# Bolt Runner

**Play it: https://bolt-runner-delta.vercel.app**

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

## Deploying

The game is static files, so any static host works. It is deployed on Vercel's free (Hobby)
tier; `vercel.json` sets the project to no framework, no build command and the repository root
as the output directory.

```sh
npx vercel deploy --prod --token "$VERCEL_TOKEN"
```

Two things about that setup are deliberate:

- **Nothing is cached beyond a revalidation** (`Cache-Control: public, max-age=0,
  must-revalidate` for every path). With no build step there are no hashed filenames, so a
  cached `src/main.js` served against a fresh `index.html` would break the import map. ETags
  still make repeat visits `304`s.
- **`.vercelignore` replaces `.gitignore`** for CLI uploads rather than adding to it, so `.env`
  is listed there explicitly. Without that line the file would be uploaded and served at
  `/.env`. The dev tooling (`test/`, `perf/`, `check.mjs`) is excluded too: it belongs in the
  repository, not on the site.

A Worker (`src/noise-worker.js`) is loaded through `new URL(..., import.meta.url)`, so the site
must be served from the root of its domain, as it is here.

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Jump (hold for a higher jump) | Space, ↑, W (+ one remappable key) | Tap anywhere |
| Pause / resume | P, Escape | Tap the overlay |
| Browse worlds | ← → then Space / Enter | Swipe the cards, tap to pick |
| Mute | M | Speaker icon |

One-button play: on the select screen the highlight walks along by itself after a few
quiet seconds, so a single button (or tap) can pick a world and play.

Debug keys: `F` shows the frame-time panel (FPS, p50/p95 frame, CPU and GPU ms, render
scale, rolling graph); `F3` the debug overlay (`renderer.info` draw calls, triangles,
geometries, textures, programs, active obstacles, particles, pooled objects, ticks per
frame, render scale, tier, and the quality controller's log); `H` toggles wireframe
hitboxes; `D` cycles Kid / Normal / No-Fail on the title screen. URL parameters:
`?q=low|medium|high` forces a quality tier, `?biome=city` starts in a world, `?bench=1`
runs the benchmark (see Performance), `?latency=1` measures press-to-pixel latency,
`?webgpu=1` renders with the WebGPU renderer (evaluation only, see
`perf/webgpu-report.md`).
`window.bolt` exposes `game`, `world`, `journey`, `perf`, `qc` (quality controller),
`switchBiome(id)` and `contrastTest()` in the console.

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
| `flyer` | 1.0 × 0.8 at 0.85 / 1.45 u | hop / full jump | 500 |
| `hazard` | 1.2 × 2.0, telegraphed 0.6 s | full jump (only while erupting) | 800 |
| `chaser` | 1.1 × 1.1, moves at speed × 1.15 | hop | 1000 |

**Journey** switches world every 700 points. The next world (textures, materials, obstacle
pools, compiled shaders) is built on idle callbacks during the previous segment — its noise
fields come from a Worker first, so each idle step is a few milliseconds — then every new
mesh is drawn once, hidden, into a 4×4 target so the swap frame compiles and uploads
nothing; the robot then runs through an enclosed gateway of light and the swap happens
while the view is enclosed (about 2 ms of scene operations). Each world keeps its own fixed lighting (its
`startPhase` preset); the swap blends between them.
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

- Gameplay: Kid / Normal / No-Fail practice (hits only cost points), starting speed.
- Visual: quality tier, Reduce motion (no screen shake or camera pulses), Dynamic
  resolution (the render scale drops for a moment when frames are dropped), High-Contrast
  Mode (scenery desaturated 60 %, obstacles and pickup saturated, scenery bloom off),
  colourblind palettes (deuteranopia / protanopia / tritanopia), FPS, camera distance.
- Audio: music and SFX sliders, master mute.
- Controls: extra jump key, hold-to-jump sensitivity.
- Parent: break reminder at 15 / 30 / 45 minutes (pauses with a gentle card, never locks),
  Reset All Progress behind a confirm.

## Progression

- Per-world records (best distance, time, most cleared, longest combo) on the select cards.
- Cosmetics unlock by lifetime distance: paints, antenna toppers, trail colours. The select
  screen shows the next unlock and a progress bar. Nothing is for sale.
- Ghost: a translucent robot replays your best run in that world (y sampled at 10 Hz,
  stored per world). Toggle in settings.
- Power-ups (5–8 s, on-screen timer ring, never two at once, same beam telegraph):
  Shield Bubble, Slow-Mo, Rocket Boost.
- Characters: Bolt, Cubo, Pip and Tank share one rig and the same hitboxes; pick one on
  the title screen or in the robot panel.
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
  dayNight: [dawn, noon, dusk, night],         // lighting presets (only startPhase is shown; the others are kept for Journey blends and tools): top, horizon, fog, sun, sunI, hemiSky, hemiGround,
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
  audio:    { musicPreset, impactTimbre, footstepTimbre },
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
| `TICK_RATE` / `MAX_ACCUM` | 120 Hz / 250 ms | Fixed simulation step and the accumulator clamp |
| `HITSTOP_MS`, `SQUASH_*`, `TRAUMA_*`, `SHAKE_MAX`, `ANTICIPATION_LEAD`, `FOV_PULLBACK`, `NEAR_MISS_*`, `PITCH_VARIATION` | see file | Game feel: every response is a number here, none is a vibe |
| `CHUNK_RULES` (`src/chunks.js`) | | Difficulty band, easy-after-hit cap, repeat/skill caps, rest beat cadence |

## Level generation and how fairness is enforced

Obstacles come from **authored chunks**, not per-obstacle randomness. `src/chunks.js` holds 30
short patterns (archetype + gap pairs, gaps in units of the minimum clearable spacing so they
are valid at every speed), each tagged with a difficulty 1–10 and a skill (`jump`, `timing`,
`rhythm`). Because hitboxes and physics are identical in every world, one library serves all
four; a world weights the skills (`chunkWeights` in its definition).

The `Spawner` in `src/spawn.js` draws from a weighted bag inside a difficulty band that
widens with score (`band = 1 + score / 110`), only from chunks whose archetypes are unlocked.
Rules: the same chunk never repeats within the last two; a skill tag never runs more than
twice; **after every hit the next chunk has difficulty ≤ 2**; a health pickup arrives on its
fixed cadence whenever a shield is missing; a rest beat (an empty 1.5–2 s) lands every
~20 s. `checkChunks()` expands every chunk at every speed cap through the pattern validator at
load time and the game refuses to start if any fails.

`src/spawn.js` is pure JavaScript with no Three.js so it can be unit-tested:

- `canSpawn` works in the *time* domain, so a chaser that moves faster than the scroll can
  never close the gap behind a static obstacle. It remains the safety net under the chunks.
- `checkClearable` verifies every archetype's hitbox against the hop apex or full-jump apex
  for its declared action.
- `leadTime` is asserted at startup for every archetype at every speed cap.
- The tests drive the real `Spawner` for 10,000 sequences per world per difficulty, validate
  every arrival pattern, and check chunk coverage (every chunk of the band is reached, rest
  beats occur, the easy-after-hit and repeat rules hold).

```sh
node --test test/      # 34 tests: physics + fixed tick, spacing maths, chunks, schema, 4 worlds × 3 difficulties × 10,000 sequences
node check.mjs         # headless Chrome smoke test (console errors, 404s, screenshots)
```

`check.mjs` options: `[seconds]`, `[query string]`, `--keys=Space,Space,ArrowRight`,
`--js="…"` (runs after the keys), `--eval="…"` (result printed, promises awaited),
`--shot=out.png`, `--size=W,H`, `--mobile` (Galaxy S24 Ultra viewport + touch),
`--touch` (drives a whole run by touch), `--gpu` (real GPU instead of SwiftShader, for
frame-time checks), `--uncapped` (vsync off), `--heap` (live allocations by call site at the
end: the leak hunter), `--cpuprofile` (self time by function), `--webgpu`,
`--url=https://host` (smoke-test a deployed site instead of this working copy — no local server
is started). Every run gets its own HTTP port and DevTools port (from Chrome's
`DevToolsActivePort` file), so runs can overlap and a stray Chrome can never be picked up by
mistake. Example verification commands:

```sh
node check.mjs 6 "q=low" --keys=Space --eval="JSON.stringify(bolt.contrastTest().pass)"
node check.mjs 10 --gpu --keys=Space --js="for(let i=0;i<10;i++)bolt.switchBiome(['city','jungle','frostpeak','desert'][i%4])" --eval="JSON.stringify(bolt.renderer.info.memory)"
node check.mjs 14 "q=medium" --gpu --url=https://bolt-runner-delta.vercel.app --keys=Space,Space,Space --shot=/tmp/live.png   # the deployed site
```

## Files

```
index.html          import map, canvas, CSS vignette, HUD, overlays (title, select, settings, robot, stickers, pause, photo, end)
style.css           HUD and card styles, perf panels
src/config.js       every tunable constant (physics, tick rate, difficulty, camera, game feel, performance)
src/main.js         renderer (WebGL / WebGPU eval), post chain, camera, tier appliers, warm-up, biome loading, journey hooks, settings hooks, the loop
src/quality.js      adaptive quality controller: tier + dynamic render scale policy
src/perf.js         frame/CPU/GPU ring buffers, percentiles, F panel, F3 overlay, latency probe, benchmark recording
src/bench.js        deterministic benchmark mode (?bench=1): autopilot, per-biome report
src/seed.js         seeded Math.random for benchmark determinism (imported first)
src/game.js         state machine, latched input, fixed tick / frame split, scoring, shields, power-ups, ghost, records
src/physics.js      player jump controller (pure, tested)
src/spawn.js        archetype table, gap maths, pattern validator, chunk Spawner, checkChunks (pure, tested)
src/chunks.js       the 30 authored level chunks and the generator rules
src/merge.js        mergeStatic / doubleAlongX: static geometry → one mesh per material (+ merged outline)
src/noise.js        tileable fBm, noise cache, Worker prefetch (learned per-biome field lists)
src/noise-worker.js module Worker computing noise fields off the main thread
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

## Performance

### Budgets (per frame, Medium tier, integrated graphics)

| Metric | Budget |
|---|---|
| frame time | p95 under 16.6 ms, p99 under 25 ms, 1 % low above 50 FPS |
| JS main thread | under 6 ms |
| draw calls | under 100 (every biome, shadow pass included) |
| GC pauses over 5 ms | zero during a 60 s run |
| heap / `renderer.info.memory` | flat between 0 s and 60 s; flat across ten biome switches |
| press-to-pixel latency | under 2 frames, measured (`?latency=1`) |
| Journey transition | never over 20 ms per frame |

### How the frame works

- **Fixed 120 Hz simulation** (`TICK_RATE`) on an accumulator clamped to 250 ms: physics,
  collision, spawning and scoring run in `Game.tick`; the render transform interpolates
  between the previous and current tick (`Game.frame`, `Obstacles.render`, the Journey gate),
  so the jump arc is bit-identical on every machine and motion is smooth at 144 Hz and at
  45 FPS. Input is polled per tick with latched press/release edges, so a tap between two
  ticks is never swallowed and never fires twice. Coyote time and the input buffer are now
  measured in ticks (15 and 18 at 120 Hz). Slow-mo scales the time fed to the accumulator;
  hit-stop starves it for 70 ms.
- **Zero allocation in the loop**: scratch vectors and state objects are module-level, the
  HUD only touches a DOM node when its value changes, robot/ghost/trail/world updates are
  plain loops, obstacle part animation uses lists cached at build time (no `traverse`).
- **Draw calls**: everything static is merged per material (`mergeStatic`): each obstacle
  and pickup shell is one mesh per material plus one merged back-face outline; each parallax
  layer holds two periods in one mesh; each prop type is one scrolling band; clouds are one
  `InstancedMesh`; far scenery casts no shadow; light shafts are hidden when off; the sky is
  drawn after every other opaque object.
- **Programs are warmed** at biome apply and at every tier change: every pooled mesh is drawn
  once, hidden, into a 4×4 target (or a 4×4 scissor on the direct path). This removed the
  150–280 ms stalls on the first obstacle of each new type. Journey prepares the next biome
  with `compileAsync` first, then the same warm-up in an idle slot.
- **Textures**: noise fields (the expensive part of every procedural texture) are computed in
  a module Worker; each biome's field list is learned on its first build and persisted, so
  later builds (Journey, select screen) prefetch them and every idle step is a few ms.
- **Fill rate**: only High uses a render-target chain (4× MSAA target → bloom → output);
  Medium and Low draw straight to the canvas with browser MSAA and a CSS vignette. Shadows:
  one directional light, 1024 / 512 px maps, off on Low; the robot has a blob shadow on every
  tier. `shadowMap.autoUpdate` stays on because the whole world scrolls every frame — a
  frozen shadow map would be visibly wrong within one frame. Additive, depth-write-off
  particles; the pickup's background readback (a pipeline flush) happens once per pickup
  telegraph and once per biome change, never on a timer.
- **Adaptive quality** (`src/quality.js`): one controller owns tier (shadows, post chain,
  particle budget, parallax layer count, pixel-ratio cap) and dynamic render scale
  (1 → 0.85 → 0.7). If p95 exceeds 1.5× the display frame for 2 s it lowers the render scale
  when GPU-bound or steps the tier when CPU-bound; after 5 s clean it raises the scale. Tiers
  never change more than once per 5 s, never during a Journey transition, never when the user
  picked a tier; every change is logged to the F3 overlay with its reason.
- **Audio**: one lookahead scheduler (25 ms interval, 120 ms ahead on the `AudioContext`
  clock); AudioParam automation for the mood filter runs at 10 Hz, not per frame.

### Running the benchmark

```sh
node perf/bench.mjs                       # all tiers, 4 biomes × 60 s + Journey 90 s, vsync off → perf/current.json
node perf/bench.mjs --vsync               # real presentation timing: the mode for judging stutter (p99, max, Journey)
node perf/bench.mjs --tiers=medium --secs=20 --biomes=city,jungle --out=/tmp/x.json
node perf/bench.mjs --webgpu --tiers=medium --secs=20
node check.mjs 60 "bench=1&q=low&secs=300&biomes=city" --gpu --uncapped --heap       # leak hunt
node check.mjs 30 "bench=1&q=medium&secs=300&biomes=jungle" --gpu --uncapped --cpuprofile
```

`?bench=1` seeds `Math.random`, drives the robot with an autopilot (full jump half an airtime
before the nearest obstacle), plays No-Fail so the workload is identical every run, records
every frame for exactly 60 s of PLAYING per biome (Journey 90 s), and reports percentiles:
p50/p95/p99/max frame time, 1 % low FPS, CPU p50/p95/p99, GPU p50/p95 (timer query), draw
calls, triangles, heap at 0 s and 60 s after a forced GC, GC events (heap drops) and how
many coincided with a frame over 5 ms, `renderer.info.memory` at start and end, Journey
transition count and worst frame. Two modes matter:

- **vsync off** (default): frame time = throughput. A fast GPU queues frames without bound,
  so isolated 100+ ms gaps with ~1 ms of CPU are queue flushes, not stutter, and GL calls
  absorb GPU back-pressure (CPU numbers inflate when the GPU is the bottleneck).
- **`--vsync`**: real presentation. On a 60 Hz headless display every clean frame reads
  16.7 ms, so p50/p95 pin there and only spikes, max and 1 % low carry information.

### Results

Apple M3, Chrome headless with the real GPU, 1280×720. `perf/baseline.json` is v2.1
(vsync off, 60 s); `perf/current.json` is the finished pass. Medium tier, per milestone
(20 s runs for the intermediate rows, vsync off):

| Milestone | draw calls (desert / city / jungle / frost) | CPU p95 ms | GPU p50 ms | worst frame ms | 1 % low FPS |
|---|---|---|---|---|---|
| v2.1 baseline (60 s) | 172 / 210 / 445 / 477 | 4.8 / 5.4 / 6.6 / 6.8 | 3.1 / 3.4 / 3.6 / 3.4 | 161 / 90 / 70 / 58 | 46 / 48 / 44 / 47 |
| M3 fixed timestep | — | 3.2 / — / 4.3 / — | | | 65 / — / 85 / — |
| M4 draw-call collapse | 66 / 92 / 81 / 70 | 3.1 / 3.1 / 3.2 / 3.8 | 2.8 / 2.8 / 2.6 / 3.1 | 222 / 153 / 188 / 216 | 33 / 41 / 31 / 25 |
| M5 warm-up, worker noise, hygiene | 65 / 92 / 82 / 69 | 3.0 / 3.1 / 3.6 / — | | 6.8 / 7.7 / 14 / — | 173 / 172 / 158 / — |
| M6–M9 fill rate, controller, juice, chunks | 62 / 92 / 81 / 68 | 2.6 / 2.6 / 2.7 / 2.5 | 1.6 / 1.6 / 1.1 / 1.2 | 114 / 86 / 83 / 98 | 140 / 189 / 203 / 230 |
| **v3 final (60 s, `perf/current.json`)** | 63 / 91 / 81 / 70 | 2.9 / 2.6 / 2.6 / 2.5 | 1.4 / 1.3 / 0.9 / 0.8 | 394 / 81 / 66 / 67 | 111 / 239 / 172 / 215 |

Definition-of-done run with **vsync** (`perf/current-vsync.json`, 60 s per biome + 90 s Journey, all
three tiers): every one of the 15 tier × biome combinations reports frame p50 / p95 / p99 / max =
16.7 / 16.7 / 16.8 / 16.8 ms, 1 % low 59.5 FPS, zero frames over 25 ms, zero GC frames over 5 ms,
`renderer.info.memory` identical at 0 s and 60 s, Journey worst frame 16.8 ms across two
transitions. CPU p95 is 2.8–3.4 ms on every tier; GPU p50 is 1.5–1.9 ms (Low), 2.1–2.6 ms
(Medium), 6.5–9.3 ms (High, bloom + 1024 px shadows). Draw calls: 52–77 (Low), 64–91 (Medium),
78–104 (High; the bloom chain alone is 12).

(The M4 worst frames are the first-draw shader stalls that M5 removed; the M6–M9 worst
frames are uncapped queue flushes — with vsync the same runs have no frame over 16.8 ms.)
Journey with vsync: 90 s, two transitions, worst frame 16.8 ms, swap 2.2 ms.

The v2.1 baseline **with vsync** (`perf/baseline-vsync.json`) is the honest comparison, and it
shows what this hardware hides: on the M3 the old build already presented cleanly at 60 Hz
(p99 16.8 ms everywhere, a handful of 33 ms frames, Journey worst 16.8 ms — the 66–116 ms
transition frames in the uncapped baseline were queue flushes). What changed is headroom, which
is the whole story on an integrated GPU that has a quarter of this one's fill rate:

| Medium tier, vsync, 60 s | v2.1 | v3 |
|---|---|---|
| GPU per frame p50 (desert / city / jungle / frost) | 5.0 / 5.2 / 5.3 / 5.2 ms | 2.1 / 2.4 / 2.6 / 2.4 ms |
| draw calls | 176 / 209 / 445 / 492 | 64 / 91 / 79 / 68 |
| CPU p95 | 3.5 / 3.9 / 4.0 / 4.3 ms | 3.1 / 3.3 / 3.4 / 3.0 ms |
| frames over 25 ms in 60 s | 1 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| High tier GPU p50 | 9.6 / 10.6 / 10.6 / 10.6 ms | 8.9 / 9.3 / 6.5 / 6.7 ms |

At four times the per-pixel cost, v2.1 Medium would sit at ~20 ms of GPU time per frame on an
integrated part and v3 at ~10 ms; that is the difference between the p95 budget and a
permanently dropped frame. **This has not yet been measured on such a device** — the
benchmark is ready for it (`node perf/bench.mjs --vsync`). Press-to-pixel: 1 frame (`?latency=1`, keydown to render
submit 4–20 ms at 60 Hz). Heap: the sampling profiler finds no per-frame retention in game
code; the remaining slow growth (~0.1 MB/s, flattening) is V8 code/feedback space attributed
to three.js internals. `renderer.info.memory` returns to identical numbers every cycle of
four biome switches (it drifted before: three's shared shadow depth material re-uploaded a
disposed texture through a stale `map` uniform; a permanent shadow sentinel fixes it).

### What from the standard checklist does not apply here

This game generates every asset in code. Do not re-add:

- **KTX2 / Basis, Draco / Meshopt** — there are no texture or model files to compress.
- **Baked lightmaps** — no external tooling; lighting is three lights and a sky shader.
- **`LOD` swapping** — geometry is primitives with a few thousand triangles per biome; the
  cost was draw calls and fill rate, never vertex count (jungle draws 40k triangles at
  1.1 ms of GPU time).
- **A frozen shadow map** (`shadowMap.autoUpdate = false`) — the world scrolls every frame.
- **A texture atlas / material family consolidation** — after merging, a biome renders in
  60–90 draw calls with ~25 textures resident; texture binds are not on the profile.
- **A vignette pass** — it is a CSS gradient (not in photo-mode PNGs, by design).

Applied from that checklist: draw-call reduction, DPR cap (2 desktop, 1.5 touch, 1 on
Low, times the dynamic render scale), shadow discipline, `matrixAutoUpdate = false` for
static objects, object pooling, transparency/overdraw control, disposal.

### Quality tiers

High (1024 px shadows, bloom through a 4× MSAA target, all particles, all layers), Medium
(512 px shadows, direct render with browser MSAA, no post), Low (no shadows, direct render,
40 % particles, two parallax layers, pixel ratio 1). Auto picks a tier from the GPU string
and a one-second FPS probe; the controller above adapts from there. The settings screen or
the title-screen button overrides it.
