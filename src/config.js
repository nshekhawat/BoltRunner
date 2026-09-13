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
  SPEED_CAP: { kid: 26, normal: 34 }, // u/s. The promise: hard, never impossible.
  DIFFICULTY_DEFAULT: 'kid',

  // ---- Forgiveness (Kid mode) ---------------------------------------------
  COYOTE_TIME: 0.120,    // s. Jump still fires shortly after running off the ground.
  INPUT_BUFFER: 0.150,   // s. Jump pressed just before landing fires on touchdown.
  HITBOX_SCALE: { kid: 0.8, normal: 0.9 }, // Collision boxes as a fraction of visual size.
  INVULN_TIME: 0.5,      // s of invulnerability (flashing) after a hit.
  SHIELDS_MAX: 3,        // Hearts. Hit = lose one; zero = run ends.

  // ---- Scoring -------------------------------------------------------------
  POINTS_PER_UNIT: 10,   // 1 point per 0.1 u travelled.
  MILESTONE: 100,        // Points between chime + confetti.
  DAY_CYCLE_POINTS: 700, // Points per phase change (day → sunset → night → dawn).
  DAY_LERP_TIME: 4,      // s to blend between lighting phases.
  STORAGE_KEY: 'boltrunner.v1', // localStorage key (bump the version to reset saves).

  // ---- Obstacles -----------------------------------------------------------
  GAP_FACTOR: 1.4,       // Min spacing = GAP_FACTOR × speed × airtime → always clearable.
  GAP_RANDOM: 1.6,       // Max spacing = min spacing × this.
  SPAWN_X: 42,           // u ahead of the robot where obstacles appear.
  DESPAWN_X: -14,        // u behind the robot where obstacles are recycled.
  REACTION_TIME: 0.45,   // s a child needs to see an obstacle before it can hit them (asserted).
  ROBOT_X: 0,            // Robot's fixed world x.
  POOL_PER_TYPE: 6,      // Pre-allocated meshes per obstacle type.
  WHEEL_SPEED_BONUS: 1.25,      // Rolling wheel moves at scroll speed × this.
  VENT_TELEGRAPH: 0.6,   // s of hissing before a steam vent erupts.
  VENT_ERUPT: 1.2,       // s the vent stays dangerous.
  BATTERY_EVERY: 12,     // Roughly one battery pickup per this many obstacles.

  // ---- Camera --------------------------------------------------------------
  CAMERA_POS: [6.5, 4.2, 12.5],   // u, chase offset from the robot.
  CAMERA_LOOK: [3.0, 2.0, 0],     // u, look-at target.
  FOV_BASE: 50, FOV_PUSH: 10,     // deg; FOV rises by FOV_PUSH at speed cap.
  CAMERA_SPRING: 6,               // Higher = stiffer follow.
  SHAKE_AMOUNT: 0.35, SHAKE_TIME: 0.35, // u, s. Screen shake on impact.

  // ---- Audio ---------------------------------------------------------------
  VOLUME: 0.5,           // Default master volume (0..1).
  MUSIC_BPM: 128,        // Base tempo; nudged up with speed.

  // ---- Performance ---------------------------------------------------------
  MAX_PIXEL_RATIO: 2,
  FPS_DOWNGRADE_BELOW: 45, FPS_DOWNGRADE_AFTER: 3, // Auto-drop a quality tier if FPS < x for y seconds.
  DEBUG_HITBOXES: false, // Render wireframe collision boxes.
};

// Derived helpers (don't tune these, tune the inputs above).
export const AIRTIME = 2 * CONFIG.JUMP_VELOCITY / -CONFIG.GRAVITY;                     // ≈ 0.69 s
export const APEX = CONFIG.JUMP_VELOCITY * CONFIG.JUMP_VELOCITY / (2 * -CONFIG.GRAVITY); // ≈ 3.28 u
