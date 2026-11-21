// The hit-feel sim clock: hit stop and heavy-finisher slow motion both count
// down on REAL seconds, so a freeze can time out (and screen shake decay) while
// the world itself is frozen at timeScale 0. Pure state transitions — no DOM,
// no three.js — so the freeze-lifetime rules are unit-testable headlessly.

export interface SimClock {
  /** Real seconds of hit stop remaining. */
  freezeLeft: number;
  /** Real seconds of heavy-finisher slow motion remaining (chains after a freeze). */
  slowLeft: number;
  /** Multiplier applied to real dt to get sim dt (0 frozen, 0.3 slow, 1 normal). */
  timeScale: number;
}

/** One real-time step of the freeze / slow-motion bookkeeping, mirroring the demo loop's order. */
export function advanceClock(clock: SimClock, realDt: number): SimClock {
  if (clock.freezeLeft > 0) {
    const freezeLeft = clock.freezeLeft - realDt;
    if (freezeLeft <= 0) {
      // freeze over — heavy finisher chains its slow motion here
      return { freezeLeft: 0, slowLeft: clock.slowLeft, timeScale: clock.slowLeft > 0 ? 0.3 : 1 };
    }
    return { freezeLeft, slowLeft: clock.slowLeft, timeScale: clock.timeScale };
  }
  if (clock.slowLeft > 0) {
    const slowLeft = clock.slowLeft - realDt;
    if (slowLeft <= 0) return { freezeLeft: 0, slowLeft: 0, timeScale: 1 };
    return { freezeLeft: 0, slowLeft, timeScale: clock.timeScale };
  }
  return clock;
}
