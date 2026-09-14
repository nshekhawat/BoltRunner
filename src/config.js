// Every tunable number lives here. Units: "u" = world units (robot ≈ 1.8 u tall), seconds, u/s.
export const CONFIG = {
  // ---- Physics ------------------------------------------------------------
  GRAVITY: -55,          // u/s². Chrome-dino-like snappy arc.
  JUMP_VELOCITY: 19,     // u/s initial upward speed → apex ≈ 3.3 u, airtime ≈ 0.69 s.
  JUMP_MIN_HEIGHT: 1.0,  // u. Releasing the key above this height while rising clamps velocity...
  JUMP_CUT_VELOCITY: 8,  // u/s ...to this, giving a short hop for a tap and a full arc for a hold.
  FAST_FALL_MULT: 3,     // Down while airborne multiplies downward velocity by this.
  TICK_RATE: 120,        // Hz. Fixed simulation step (physics, collision, spawning, scoring). Render interpolates between ticks.
  MAX_ACCUM: 0.25,       // s. Accumulator clamp: a backgrounded tab never runs a death spiral of catch-up ticks.
  MAX_DT: 0.05,          // s. Clamp for per-frame visual updates (scrolling, particles, camera).
  GROUND_Y: 0,           // u. Robot feet rest here.

  // ---- Speed / difficulty --------------------------------------------------
  SPEED_START: 12,       // u/s scroll speed at the start of a run.
  SPEED_ACCEL: 0.30,     // u/s gained per second of play.
  SPEED_CAP: { kid: 26, normal: 34, nofail: 26 }, // u/s. The promise: hard, never impossible. nofail = practice: hits only cost score.
  DIFFICULTY_DEFAULT: 'kid',

  // ---- Forgiveness (Kid mode) ---------------------------------------------
  COYOTE_TIME: 0.120,    // s. Jump still fires shortly after running off the ground.
  INPUT_BUFFER: 0.150,   // s. Jump pressed just before landing fires on touchdown.
  HITBOX_SCALE: { kid: 0.8, normal: 0.9, nofail: 0.8 }, // Collision boxes as a fraction of visual size.
  NOFAIL_HIT_COST: 25,   // Points lost per hit in No-Fail practice mode.
  INVULN_TIME: 0.5,      // s of invulnerability (flashing) after a hit.
  SHIELDS_MAX: 3,        // Hearts. Hit = lose one; zero = run ends.

  // ---- Scoring -------------------------------------------------------------
  POINTS_PER_UNIT: 1,    // Points per world unit. 1 ≈ the Chrome dino's ~10-25 pts/s. (10 = 1 pt per 0.1 u, but that
                         // scores 120+ pts/s and unlocks everything in seconds — bump MILESTONE etc. ×10 if you want it.)
  MILESTONE: 100,        // Points between chime + confetti.
  DAY_CYCLE_POINTS: 700, // Journey: points per world change. Lighting itself stays at each world's start phase.
  DAY_LERP_TIME: 4,      // s to blend lighting when the world changes.
  STORAGE_KEY: 'boltrunner.v2', // localStorage key (bump the version to reset saves).

  // ---- Obstacles -----------------------------------------------------------
  GAP_FACTOR: 1.4,       // Min spacing = GAP_FACTOR × speed × airtime → always clearable.
  GAP_RANDOM: 1.6,       // Max spacing = min spacing × this.
  SPAWN_X: 55,           // u ahead of the robot where obstacles appear.
  DESPAWN_X: -14,        // u behind the robot where obstacles are recycled.
  REACTION_TIME: 0.45,   // s a child needs to see an obstacle before it can hit them (asserted).
  ROBOT_X: 0,            // Robot's fixed world x.
  ROBOT_TURN: 0.45,      // rad the robot is turned toward the camera (0 = pure side view, for the 3/4 look).
  POOL_PER_TYPE: 6,      // Pre-allocated meshes per obstacle type.
  CHASER_SPEED_MULT: 1.15, // Chaser archetype (tumbleweed, trolley, boulder, snowball) moves at scroll speed × this.
  HAZARD_TELEGRAPH: 0.6, // s of warning (hiss/rumble) before a hazard erupts.
  PICKUP_EVERY: 12,      // Roughly one health pickup per this many obstacles (only while a shield is missing).
  PICKUP_HEIGHT: 1.2,    // u. Pickup centre height: always in the jump path, never on the ground.
  PICKUP_BEAM_LEAD: 2,   // s before arrival that the vertical light beam telegraphs a pickup.
  POWER_EVERY: 22,       // Roughly one power-up per this many obstacles (never two at once).
  POWER_TIME: { shield: 8, slowmo: 5, rocket: 6 }, // s each power-up lasts.

  // ---- Camera --------------------------------------------------------------
  CAMERA_POS: [-3.5, 3.8, 9.5],   // u, chase offset from the robot (behind, above, to the side).
  CAMERA_LOOK: [7.5, 1.4, 0],     // u, look-at target ahead of the robot so upcoming obstacles are visible early.
  MIN_ASPECT_FOV: 1.5,            // Below this aspect ratio (portrait), widen the vertical FOV to keep the same horizontal view.
  FOV_BASE: 50, FOV_PUSH: 10,     // deg; FOV rises by FOV_PUSH at speed cap.
  CAMERA_SPRING: 6,               // Higher = stiffer follow.
  // ---- Game feel ("juice"): every player action gets a simultaneous visual, audio and motion response, all specified here ----
  HITSTOP_MS: 70,              // ms the simulation freezes on an obstacle impact (audio keeps playing). Weight.
  SQUASH_LAUNCH: [1.15, 0.9],  // [vertical, horizontal] scale at jump launch …
  SQUASH_LAUNCH_MS: 80,        // … reached over this many ms, then eased back over SQUASH_RELEASE_MS.
  SQUASH_LAND: [0.85, 1.15],   // inverted on landing …
  SQUASH_LAND_MS: 80,          // … over this long …
  SQUASH_RELEASE_MS: 120,      // … then eased back.
  TRAUMA_HIT: 0.55,            // trauma (0–1) added by an obstacle impact. Shake amplitude = trauma² × SHAKE_MAX.
  TRAUMA_LAND: 0.12,           // trauma added by a landing (barely felt: a thump, not a quake).
  TRAUMA_DECAY: 1.5,           // trauma lost per second.
  SHAKE_MAX: 0.22,             // u. Camera offset at trauma 1. Reduce Motion disables shake entirely.
  SPEED_TIER_STEP: 4,          // u/s between "speed tiers" (16, 20, 24 …): each gets an anticipation beat …
  ANTICIPATION_LEAD: 0.5,      // … this many seconds before the tier: a FOV pull-back and a rising audio sweep.
  FOV_PULLBACK: 4,             // deg the FOV narrows during the anticipation, released as the tier is crossed.
  NEAR_MISS_DIST: 0.2,         // u. Clearing an obstacle by less than this = a near miss: soft whoosh + bonus.
  NEAR_MISS_BONUS: 10,         // points per near miss.
  PITCH_VARIATION: 0.02,       // ±fraction of random pitch on every sound layer so repeats never machine-gun.

  // ---- Audio ---------------------------------------------------------------
  VOLUME: 0.5,           // Default master volume (0..1).
  MUSIC_BPM: 128,        // Fallback tempo; each biome names a music preset in audio.js (tempo, voice, key) nudged up with speed.

  // ---- Performance ---------------------------------------------------------
  MAX_PIXEL_RATIO: 2, MOBILE_PIXEL_RATIO: 1.5, // caps; phones/tablets get the lower one (fill-rate is the bottleneck there)
  // Adaptive quality thresholds (dropped-frame ratio, cooldowns, render-scale steps) live in src/quality.js next to the policy.
  DEBUG_HITBOXES: false, // Render wireframe collision boxes.
};

// Derived helpers (don't tune these, tune the inputs above).
export const AIRTIME = 2 * CONFIG.JUMP_VELOCITY / -CONFIG.GRAVITY;                     // ≈ 0.69 s
export const APEX = CONFIG.JUMP_VELOCITY * CONFIG.JUMP_VELOCITY / (2 * -CONFIG.GRAVITY); // ≈ 3.28 u
