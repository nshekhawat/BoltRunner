// Player vertical physics. Pure JS (no three) so it is unit-testable.
import { CONFIG as C } from './config.js';

export class Player {
  constructor() { this.reset(); }
  reset() {
    this.y = C.GROUND_Y; this.vy = 0; this.grounded = true; this.ducking = false;
    this.jumpHeld = false; this.duckHeld = false;
    this.coyote = 0;   // s left in which a jump still counts after leaving the ground
    this.buffer = 0;   // s left in which a buffered jump press still fires on landing
    this.airtime = 0;  // s since takeoff (for animation)
  }
  pressJump() { this.jumpHeld = true; this.buffer = C.INPUT_BUFFER; }
  releaseJump() { this.jumpHeld = false; }
  setDuck(on) { this.duckHeld = on; }

  // Returns { jumped, landed } events for audio/animation. Must be called with clamped dt.
  update(dt) {
    let jumped = false, landed = false;
    this.coyote = Math.max(0, this.coyote - dt);
    this.buffer = Math.max(0, this.buffer - dt);
    if (this.buffer > 0 && (this.grounded || this.coyote > 0)) {
      this.vy = C.JUMP_VELOCITY; this.grounded = false; this.coyote = 0; this.buffer = 0;
      this.ducking = false; this.airtime = 0; jumped = true;
    }
    if (!this.grounded) {
      // Variable height: releasing early (above min height, still rising) clamps upward speed.
      if (!this.jumpHeld && this.vy > C.JUMP_CUT_VELOCITY && this.y - C.GROUND_Y > C.JUMP_MIN_HEIGHT) this.vy = C.JUMP_CUT_VELOCITY;
      const g = C.GRAVITY * (this.duckHeld && this.vy < 0 ? C.FAST_FALL_MULT : 1);
      this.vy += g * dt; this.y += this.vy * dt; this.airtime += dt;
      if (this.y <= C.GROUND_Y) { this.y = C.GROUND_Y; this.vy = 0; this.grounded = true; landed = true; }
    } else {
      this.coyote = C.COYOTE_TIME; // refreshed while grounded; counts down once we leave (see leaveGround)
    }
    this.ducking = this.grounded && this.duckHeld;
    return { jumped, landed };
  }
  // Call when the ground disappears under the player (not used yet: the runner has no pits; kept for coyote semantics).
  leaveGround() { if (this.grounded) { this.grounded = false; this.coyote = C.COYOTE_TIME; } }
}
