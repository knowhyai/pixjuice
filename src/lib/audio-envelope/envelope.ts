import { clampPatch } from "./params.ts";
import type { Patch } from "./types.ts";

export function createEnvelope(input: Partial<Patch>) {
  const { attack, decay, sustainLevel, sustainTime, release } = clampPatch(input);
  const peakTime = attack / 1000;
  const decayEnd = (attack + decay) / 1000;
  const releaseStart = (attack + decay + sustainTime) / 1000;
  const duration = (attack + decay + sustainTime + release) / 1000;

  return {
    duration,
    peakTime,
    decayEnd,
    releaseStart,
    sustainLevel,
    valueAt(time: number): number {
      if (!(time > 0 && time < duration)) return 0;
      if (time < peakTime) return time / peakTime;
      if (time < decayEnd) return 1 + (sustainLevel - 1) * (time - peakTime) / (decayEnd - peakTime);
      if (time <= releaseStart) return sustainLevel;
      return sustainLevel * (duration - time) / (duration - releaseStart);
    },
  };
}

export function valueAt(time: number, params: Partial<Patch>): number {
  return createEnvelope(params).valueAt(time);
}

export function envelopePoints(params: Partial<Patch>) {
  const envelope = createEnvelope(params);
  return [0, envelope.peakTime, envelope.decayEnd, envelope.releaseStart, envelope.duration]
    .map((time) => ({ time, level: envelope.valueAt(time) }));
}

type GainAutomation = Pick<AudioParam, "cancelScheduledValues" | "setValueAtTime" | "linearRampToValueAtTime">;

export function scheduleGain(gain: GainAutomation, start: number, params: Partial<Patch>): number {
  const { peakTime, decayEnd, releaseStart, sustainLevel, duration } = createEnvelope(params);
  gain.cancelScheduledValues(start);
  gain.setValueAtTime(0, start);
  gain.linearRampToValueAtTime(1, start + peakTime);
  gain.linearRampToValueAtTime(sustainLevel, start + decayEnd);
  if (releaseStart > decayEnd) gain.setValueAtTime(sustainLevel, start + releaseStart);
  gain.linearRampToValueAtTime(0, start + duration);
  return duration;
}
