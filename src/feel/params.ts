// The single source of truth for the hit-feel recipe: six layers, each with an
// on/off switch and a few numbers. The demo, the sliders and the generated
// Godot/Unity code all read from this shape, so a preset switch updates
// everything at once. Pure data — no DOM, no three.js.

export type HitZone = "head" | "chest" | "belly";

export interface FeelParams {
  /** 1 — hit stop: freeze the simulation for a few frames on impact. */
  hitStop: { on: boolean; frames: number };
  /** 2 — screen shake: trauma-based, biased along the attack direction. */
  shake: { on: boolean; trauma: number; decay: number };
  /** 3 — hit feedback: flash + local squash + damage numbers (sub-toggles). */
  feedback: {
    on: boolean;
    flash: boolean;
    flashIntensity: number;
    squash: boolean;
    squashAmount: number;
    numbers: boolean;
    numberScale: number;
  };
  /** 4 — knockback: fast push out, hard stop, no uniform glide. */
  knockback: { on: boolean; distance: number; stopTime: number };
  /** 5 — directional VFX: sparks and a shockwave that follow the force. */
  vfx: { on: boolean; sparks: number; shockwave: boolean };
  /** 6 — three-band impact sound: low weight, mid texture, high crisp. */
  sfx: { on: boolean; low: boolean; mid: boolean; high: boolean; volume: number };
  /** heavy hits may add slow motion after the freeze and an inverted flash. */
  heavyFinisher: boolean;
  /** the overdone preset stacks every loud extra on purpose — it is the warning. */
  overdoneExtras: boolean;
}

export const LAYER_IDS = ["hit-stop", "screen-shake", "hit-feedback", "knockback", "directional-vfx", "impact-sfx"] as const;

/** Slider metadata: range, step and the heuristic default shown next to it. */
export const SLIDERS = {
  frames: { min: 0, max: 30, step: 1, rec: 4, heavyRec: 12 },
  trauma: { min: 0, max: 1, step: 0.01, rec: 0.25, heavyRec: 0.6 },
  decay: { min: 0.5, max: 6, step: 0.1, rec: 2.6 },
  flashIntensity: { min: 0, max: 1, step: 0.01, rec: 0.5 },
  squashAmount: { min: 0, max: 1, step: 0.01, rec: 0.45 },
  numberScale: { min: 0.5, max: 3, step: 0.1, rec: 1 },
  distance: { min: 0, max: 3, step: 0.05, rec: 0.8, heavyRec: 2 },
  stopTime: { min: 0.05, max: 0.8, step: 0.01, rec: 0.18 },
  sparks: { min: 0, max: 200, step: 5, rec: 60 },
  volume: { min: 0, max: 1, step: 0.01, rec: 0.7 },
} as const;

export type PresetId = "light" | "heavy" | "overdone";

export const PRESETS: Record<PresetId, FeelParams> = {
  /** 快、紧凑：短顿帧、小震屏、短击退、克制的数字和闪光。 */
  light: {
    hitStop: { on: true, frames: 4 },
    shake: { on: true, trauma: 0.18, decay: 3.4 },
    feedback: { on: true, flash: true, flashIntensity: 0.35, squash: true, squashAmount: 0.3, numbers: true, numberScale: 1 },
    knockback: { on: true, distance: 0.55, stopTime: 0.14 },
    vfx: { on: true, sparks: 40, shockwave: false },
    sfx: { on: true, low: true, mid: false, high: true, volume: 0.5 },
    heavyFinisher: false,
    overdoneExtras: false,
  },
  /** 重锤：顿帧长、震屏大、击退远，加反色冲击和慢动作。 */
  heavy: {
    hitStop: { on: true, frames: 14 },
    shake: { on: true, trauma: 0.62, decay: 1.9 },
    feedback: { on: true, flash: true, flashIntensity: 0.85, squash: true, squashAmount: 0.7, numbers: true, numberScale: 1.6 },
    knockback: { on: true, distance: 1.9, stopTime: 0.3 },
    vfx: { on: true, sparks: 130, shockwave: true },
    sfx: { on: true, low: true, mid: true, high: false, volume: 0.85 },
    heavyFinisher: true,
    overdoneExtras: false,
  },
  /** 反面教材：什么都开到最大，演示“嘈杂”本身。 */
  overdone: {
    hitStop: { on: true, frames: 26 },
    shake: { on: true, trauma: 1, decay: 0.6 },
    feedback: { on: true, flash: true, flashIntensity: 1, squash: true, squashAmount: 1, numbers: true, numberScale: 2.6 },
    knockback: { on: true, distance: 3, stopTime: 0.5 },
    vfx: { on: true, sparks: 200, shockwave: true },
    sfx: { on: true, low: true, mid: true, high: true, volume: 1 },
    heavyFinisher: true,
    overdoneExtras: true,
  },
};

export const DEFAULT_PARAMS: FeelParams = structuredClone(PRESETS.light);

export function cloneParams(p: FeelParams): FeelParams {
  return structuredClone(p);
}
