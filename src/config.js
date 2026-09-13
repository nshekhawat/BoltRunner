// Every tunable number lives here. Units: "u" = world units (robot ≈ 1.8 u tall), seconds, u/s.
export const CONFIG = {
  // ---- Physics ------------------------------------------------------------
  GRAVITY: -55,          // u/s². Chrome-dino-like snappy arc.
  JUMP_VELOCITY: 19,     // u/s initial upward speed → apex ≈ 3.3 u, airtime ≈ 0.69 s.
  JUMP_MIN_HEIGHT: 1.0,  // u. Releasing the key above this height while rising clamps velocity...
  JUMP_CUT_VELOCITY: 8,  // u/s ...to this, giving a short hop for a tap and a full arc for a hold.
  FAST_FALL_MULT: 3,     // Down while airborne multiplies downward velocity by this.
  MAX_DT: 0.05,          // s. deltaTime clamp so a tab switch never teleports the robot.
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
  ASSIST_TIME: 0.32,     // s. Jump Assist acts when an obstacle would arrive within this time and the robot is still grounded.
  SHIELDS_MAX: 3,        // Hearts. Hit = lose one; zero = run ends.

  // ---- Scoring -------------------------------------------------------------
  POINTS_PER_UNIT: 1,    // Points per world unit. 1 ≈ the Chrome dino's ~10-25 pts/s. (10 = 1 pt per 0.1 u, but that
                         // scores 120+ pts/s and unlocks everything in seconds — bump MILESTONE etc. ×10 if you want it.)
  MILESTONE: 100,        // Points between chime + confetti.
  DAY_CYCLE_POINTS: 700, // Points per phase change (day → sunset → night → dawn).
  DAY_LERP_TIME: 4,      // s to blend between lighting phases.
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
  POWER_TIME: { shield: 8, magnet: 6, slowmo: 5, rocket: 6 }, // s each power-up lasts.

  // ---- Camera --------------------------------------------------------------
  CAMERA_POS: [-3.5, 3.8, 9.5],   // u, chase offset from the robot (behind, above, to the side).
  CAMERA_LOOK: [7.5, 1.4, 0],     // u, look-at target ahead of the robot so upcoming obstacles are visible early.
  MIN_ASPECT_FOV: 1.5,            // Below this aspect ratio (portrait), widen the vertical FOV to keep the same horizontal view.
  FOV_BASE: 50, FOV_PUSH: 10,     // deg; FOV rises by FOV_PUSH at speed cap.
  CAMERA_SPRING: 6,               // Higher = stiffer follow.
  SHAKE_AMOUNT: 0.35, SHAKE_TIME: 0.35, // u, s. Screen shake on impact.

  // ---- Audio ---------------------------------------------------------------
  VOLUME: 0.5,           // Default master volume (0..1).
  MUSIC_BPM: 128,        // Fallback tempo; each biome names a music preset in audio.js (tempo, voice, key) nudged up with speed.

  // ---- Performance ---------------------------------------------------------
  MAX_PIXEL_RATIO: 2,
  FPS_DOWNGRADE_BELOW: 45, FPS_DOWNGRADE_AFTER: 3, // Auto-drop a quality tier if FPS < x for y seconds.
  DEBUG_HITBOXES: false, // Render wireframe collision boxes.
};

// Derived helpers (don't tune these, tune the inputs above).
export const AIRTIME = 2 * CONFIG.JUMP_VELOCITY / -CONFIG.GRAVITY;                     // ≈ 0.69 s
export const APEX = CONFIG.JUMP_VELOCITY * CONFIG.JUMP_VELOCITY / (2 * -CONFIG.GRAVITY); // ≈ 3.28 u
