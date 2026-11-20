/**
 * Beat detector (pure). A "hit" is a bass value clearly above its own slow average (≥ 190 ms apart);
 * `beat` is a 0..1 pulse that decays after each hit (~0.33 s). Same rule the background scenes use.
 */
export function createBeatDetector() {
  let avg = 0;
  let lastHit = -1e9;
  const out = { beat: 0, hit: false, strength: 0 };
  return {
    out,
    /** @param {number} nowMs @param {number} dt seconds @param {number} bass 0..1 @param {boolean} active */
    update(nowMs, dt, bass, active) {
      out.hit = false;
      if (!active) {
        out.beat = Math.max(0, out.beat - dt * 3);
        avg *= 0.98;
        return out;
      }
      avg += (bass - avg) * 0.04;
      if (bass > 0.2 && bass > avg * 1.3 + 0.05 && nowMs - lastHit > 190) {
        lastHit = nowMs;
        out.hit = true;
        out.beat = 1;
        out.strength = Math.min(1.2, Math.max(0.3, (bass - avg) * 2 + 0.4));
      } else out.beat = Math.max(0, out.beat - dt * 3);
      return out;
    },
  };
}
