import { WAVEFORMS, type Mode, type Patch } from "./types.ts";

export const SAMPLE_RATE = 44100;
export const MAX_PEAK = 0.35;
// 0.35 rounds down in float32. WAV encoding applies its own integer bound.
export const PCM_CEILING = Math.fround(MAX_PEAK);
export const MAX_DURATION_MS = 5000;
export const MAX_GAIN = 0.45;

export const LIMITS = {
  attack: [2, 1500, 1],
  decay: [1, 1500, 1],
  sustainLevel: [0, 1, 0.01],
  sustainTime: [0, 2500, 1],
  release: [2, 2500, 1],
  frequency: [80, 2000, 1],
  gain: [0, MAX_GAIN, 0.01],
} as const;

export const DEFAULT_PATCH: Readonly<Patch> = Object.freeze({
  attack: 12, decay: 80, sustainLevel: 0.42, sustainTime: 80, release: 145,
  frequency: 580, endFrequency: null, gain: 0.16, waveform: "sine",
});

const STAGES = ["attack", "decay", "sustainTime", "release"] as const;

export function clampPatch(input: Partial<Patch>): Patch {
  function bounded(key: keyof typeof LIMITS, value: number | undefined = input[key]): number {
    const [min, max, step] = LIMITS[key];
    const safe = typeof value === "number" && !Number.isNaN(value) ? value : DEFAULT_PATCH[key];
    const clamped = Math.min(max, Math.max(min, safe));
    return Math.round(clamped / step) / Math.round(1 / step);
  }

  const patch: Patch = {
    attack: bounded("attack"),
    decay: bounded("decay"),
    sustainLevel: bounded("sustainLevel"),
    sustainTime: bounded("sustainTime"),
    release: bounded("release"),
    frequency: bounded("frequency"),
    endFrequency: input.endFrequency == null ? null : bounded("frequency", input.endFrequency),
    gain: bounded("gain"),
    waveform: input.waveform && WAVEFORMS.includes(input.waveform) ? input.waveform : DEFAULT_PATCH.waveform,
  };

  const total = STAGES.reduce((sum, stage) => sum + patch[stage], 0);
  if (total > MAX_DURATION_MS) {
    const minimum = STAGES.reduce((sum, stage) => sum + LIMITS[stage][0], 0);
    const ratio = (MAX_DURATION_MS - minimum) / (total - minimum);
    for (const stage of STAGES) {
      const min = LIMITS[stage][0];
      patch[stage] = min + Math.floor((patch[stage] - min) * ratio);
    }
  }
  return patch;
}

export function paramsForMode(tune: Readonly<Patch>, defaults: Readonly<Patch>, mode: Mode): Patch {
  return clampPatch(mode === "default" ? defaults : tune);
}

export function shouldAutoplay(): false {
  // Playback requires a user gesture. Page initialization never creates an AudioContext.
  return false;
}
