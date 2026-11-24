import type { ShakeMode, ShakeParams } from "./types";

export const DEFAULTS: Readonly<ShakeParams> = Object.freeze({
  positionAmplitude: 10, rotationAmplitude: 3, frequency: 18, decay: 3, duration: 0.4,
});

export const STARTER: Readonly<ShakeParams> = Object.freeze({
  positionAmplitude: 17, rotationAmplitude: 5, frequency: 13, decay: 2, duration: 0.55,
});

export const LIMITS = {
  positionAmplitude: [0, 48, 0.1],
  rotationAmplitude: [0, 12, 0.1],
  frequency: [1, 40, 0.1],
  decay: [0.5, 8, 0.1],
  duration: [0.05, 2, 0.01],
} as const;

export const PARAM_KEYS = Object.keys(LIMITS) as (keyof ShakeParams)[];

export function clampParams(input: Partial<ShakeParams>): ShakeParams {
  const result = { ...DEFAULTS };
  for (const key of PARAM_KEYS) {
    const [min, max, step] = LIMITS[key];
    const value = input[key];
    if (typeof value !== "number" || Number.isNaN(value)) continue;
    const bounded = Math.min(max, Math.max(min, value));
    result[key] = Number((Math.round(bounded / step) * step).toFixed(2));
  }
  return result;
}

export function paramsForMode(tune: ShakeParams, defaults: ShakeParams, mode: ShakeMode): ShakeParams {
  return clampParams(mode === "default" ? defaults : tune);
}
