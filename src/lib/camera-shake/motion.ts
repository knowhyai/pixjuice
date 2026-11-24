import { clampParams } from "./params";
import type { MotionPreference, ShakeParams, ShakePose } from "./types";

export const REST: Readonly<ShakePose> = Object.freeze({
  x: 0, y: 0, rotation: 0, envelope: 0, active: false,
});

// A shake requires a user gesture on Trigger.
export function shouldAutoplay(): false {
  return false;
}

export function motionIsReduced(preference: MotionPreference, systemReduce: boolean): boolean {
  return preference === "reduce" || (preference === "auto" && systemReduce);
}

export function sampleShake(params: ShakeParams, elapsed: number, seed = 0, reduced = false): ShakePose {
  if (reduced || !Number.isFinite(elapsed) || elapsed < 0) return REST;
  return sampleClamped(clampParams(params), elapsed, seed);
}

function sampleClamped(params: ShakeParams, elapsed: number, seed: number): ShakePose {
  if (elapsed >= params.duration) return REST;
  const envelope = Math.exp(-2 * params.decay * elapsed);
  if (envelope < 0.001) return REST;

  const phase = 2 * Math.PI * params.frequency * elapsed;
  const seedPhase = (((seed >>> 0) * 0.618033988749895) % 1) * 2 * Math.PI;
  return {
    x: envelope * params.positionAmplitude * Math.sin(phase + seedPhase + 0.6),
    y: envelope * params.positionAmplitude * Math.sin(phase + seedPhase + 2.1) * 0.7,
    rotation: envelope * params.rotationAmplitude * Math.PI / 180
      * Math.sin(phase + seedPhase + 3.4),
    envelope,
    active: true,
  };
}

export function sampleTrace(params: ShakeParams, duration: number, segments = 320): ShakePose[] {
  const clamped = clampParams(params);
  return Array.from({ length: segments + 1 }, (_, index) =>
    sampleClamped(clamped, duration * index / segments, 0));
}

export class ShakeComparison {
  private event: { start: number; defaults: ShakeParams; mine: ShakeParams } | null = null;

  trigger(start: number, defaults: ShakeParams, mine: ShakeParams): void {
    this.event = { start, defaults: clampParams(defaults), mine: clampParams(mine) };
  }

  reset(): void {
    this.event = null;
  }

  sample(now: number, reduced = false): readonly [ShakePose, ShakePose] {
    if (!this.event || reduced || !Number.isFinite(now) || !Number.isFinite(this.event.start)) {
      this.reset();
      return [REST, REST];
    }
    const { start } = this.event;
    const elapsed = Math.max(0, now - start);
    const sample = (params: ShakeParams) => now >= start + params.duration
      ? REST : sampleClamped(params, elapsed, 0);
    const defaults = sample(this.event.defaults);
    const mine = sample(this.event.mine);
    if (!defaults.active && !mine.active) this.reset();
    return [defaults, mine];
  }
}
