export type Playback =
  | { kind: "idle" }
  | { kind: "playing"; origin: number }
  | { kind: "paused"; elapsed: number }
  | { kind: "done" };

export type Action = "start" | "pause" | "resume" | "skip" | "reset" | "tick";
export const IDLE: Playback = { kind: "idle" };

export function motionIsReduced(preference: string, system: boolean): boolean {
  return preference === "on" || (preference === "auto" && system);
}

export function elapsedTime(state: Playback, now: number): number {
  switch (state.kind) {
    case "idle": return 0;
    case "playing": return Math.max(0, now - state.origin);
    case "paused": return state.elapsed;
    case "done": return Infinity;
  }
}

export function playback(state: Playback, action: Action, now: number, duration: number, reduced: boolean): Playback {
  if (action === "reset") return IDLE;
  if (reduced) return IDLE;
  switch (action) {
    case "skip": return { kind: "done" };
    case "start":
      if (state.kind !== "idle") return state;
      return duration ? { kind: "playing", origin: now } : { kind: "done" };
    case "resume":
      return state.kind === "paused" ? { kind: "playing", origin: now - state.elapsed } : state;
    case "pause":
    case "tick": {
      if (state.kind !== "playing") return state;
      const elapsed = elapsedTime(state, now);
      if (elapsed >= duration) return { kind: "done" };
      return action === "pause" ? { kind: "paused", elapsed } : state;
    }
  }
}

export function previewElapsed(state: Playback, now: number, reduced: boolean): number {
  return reduced ? Infinity : elapsedTime(state, now);
}
