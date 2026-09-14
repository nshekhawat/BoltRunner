// Adaptive quality controller: one owner for every quality lever (tier: shadows, post chain, particle budget, parallax layers, pixel
// ratio cap; plus dynamic render scale). Policy lives here; main.js supplies the two appliers. Rules: a tier never changes more than once
// every 5 s, never during a Journey transition, never when the user picked a tier by hand (render scale still adapts unless the
// Dynamic resolution setting is off), and every change is logged to the debug overlay with its reason.
export const TIERS = ['high', 'medium', 'low'];
export const SCALES = [1, 0.85, 0.7];              // render-scale steps (multiplies the pixel ratio; the canvas size never changes)
const BAD_SECONDS = 2, GOOD_SECONDS = 5, TIER_COOLDOWN = 5, DROP_RATIO = 1.5, CLEAN_RATIO = 1.2, MIN_SAMPLES = 90;

export class QualityController {
  constructor({ perf, applyTier, applyScale, log }) {
    this.perf = perf; this.applyTier = applyTier; this.applyScale = applyScale; this.log = log ?? (() => {});
    this.tier = 'high'; this.manual = false; this.dynamic = true; this.scaleIdx = 0;
    this.t = 0; this.lastTierChange = -1e9; this.lastScaleChange = -1e9; this.badT = 0; this.goodT = 0;
  }
  get scale() { return SCALES[this.scaleIdx]; }
  setTier(tier, { manual = this.manual, reason = 'set' } = {}) {
    this.manual = manual; if (tier === this.tier && reason === 'set') { this.applyTier(tier); return; }
    this.log(`tier ${this.tier} → ${tier} (${reason})`); this.tier = tier; this.lastTierChange = this.t; this.applyTier(tier); this.badT = this.goodT = 0;
  }
  setScale(idx, reason) { idx = Math.max(0, Math.min(SCALES.length - 1, idx)); if (idx === this.scaleIdx) return; this.log(`render scale ${SCALES[this.scaleIdx]} → ${SCALES[idx]} (${reason})`); this.scaleIdx = idx; this.lastScaleChange = this.t; this.applyScale(SCALES[idx]); this.badT = this.goodT = 0; }
  setDynamic(on) { this.dynamic = on; if (!on) this.setScale(0, 'dynamic resolution off'); }
  // dt = real seconds. playing: only judge while the game runs; transitioning: Journey gate / build in flight (never change then).
  tick(dt, playing, transitioning) {
    this.t += dt; if (!playing || transitioning) { this.badT = this.goodT = 0; return; }
    const w = this.perf.window(); if (w.n < MIN_SAMPLES) return;
    const nominal = Math.min(w.frameP50, 16.7); // the display's frame at 60+ Hz; below 60 the p50 itself is the reality
    const dropped = w.frameP95 > nominal * DROP_RATIO, clean = w.frameP95 < nominal * CLEAN_RATIO;
    if (dropped) { this.badT += dt; this.goodT = 0; } else if (clean) { this.goodT += dt; this.badT = 0; }
    if (this.badT >= BAD_SECONDS) {
      this.badT = 0; const why = `p95 ${w.frameP95.toFixed(1)} ms vs ${nominal.toFixed(1)} for ${BAD_SECONDS} s`;
      // GPU-bound (fill rate) → resolution first; CPU-bound → a tier step (fewer particles/shadows also cuts JS and draw calls).
      const gpuBound = w.gpuP95 > 0 ? w.gpuP95 > nominal * 0.8 : w.cpuP95 < nominal * 0.5;
      if (this.dynamic && gpuBound && this.scaleIdx < SCALES.length - 1) this.setScale(this.scaleIdx + 1, why);
      else if (!this.manual && this.tier !== 'low' && this.t - this.lastTierChange >= TIER_COOLDOWN) this.setTier(TIERS[TIERS.indexOf(this.tier) + 1], { reason: why + (gpuBound ? ', scale exhausted' : ', cpu-bound') });
      else if (this.dynamic && this.scaleIdx < SCALES.length - 1) this.setScale(this.scaleIdx + 1, why);
    }
    if (this.goodT >= GOOD_SECONDS) { this.goodT = 0; if (this.scaleIdx > 0) this.setScale(this.scaleIdx - 1, `p95 ${w.frameP95.toFixed(1)} ms clean for ${GOOD_SECONDS} s`); } // tiers only ever step down: stepping back up would oscillate on a borderline device
  }
}
