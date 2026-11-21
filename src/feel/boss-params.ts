// The single source of truth for the boss HP bar recipe: five layers, each
// with an on/off switch and a few numbers, plus a global reduced-motion mode.
// The demo bar, the sliders and the generated Godot/web code all read from
// this shape. Pure data — no DOM.

export interface BossHpParams {
  /** 1 — delayed white bar: lost HP lingers, then chases the current value. */
  lag: { on: boolean; wait: number; catch: number };
  /** 2 — hit reaction: decaying shake of the bar plus a short white flash. */
  react: { on: boolean; shakeDecay: number; shakeMax: number; flash: number };
  /** 3 — scale ticks every step%, triangle markers at 25/50/75. */
  ticks: { on: boolean; step: number; markers: boolean };
  /** 4 — layered HP: bar drains purple → orange → red, ×N shows layers left. */
  layers: { on: boolean; count: number };
  /** 5 — low-HP alarm: pulsing glow under the threshold + red screen edge. */
  alarm: { on: boolean; threshold: number; pulseHz: number; edge: boolean };
  /** demo-only accessibility mode: "auto" follows the OS preference. */
  reducedMotion: "auto" | "on" | "off";
}

export const BOSS_LAYER_IDS = ["lag-bar", "hit-react", "scale-ticks", "hp-layers", "low-alarm"] as const;

/** Layer colors, first (outermost) to last. Purple → orange → red by default. */
export const BOSS_LAYER_COLORS = ["#9d7bff", "#ff9a3d", "#ff4d5e"] as const;

/** Slider metadata: range, step and the tunable default shown next to it. */
export const BOSS_SLIDERS = {
  wait: { min: 0.1, max: 0.8, step: 0.01, rec: 0.35, heavyRec: 0.35 },
  catch: { min: 0.1, max: 1, step: 0.01, rec: 0.45, heavyRec: 0.45 },
  shakeDecay: { min: 0.08, max: 0.6, step: 0.01, rec: 0.27, heavyRec: 0.27 },
  shakeMax: { min: 2, max: 28, step: 1, rec: 14, heavyRec: 14 },
  flash: { min: 0.02, max: 0.25, step: 0.01, rec: 0.08, heavyRec: 0.08 },
  step: { min: 5, max: 25, step: 5, rec: 10, heavyRec: 10 },
  threshold: { min: 5, max: 50, step: 5, rec: 25, heavyRec: 25 },
  pulseHz: { min: 0.5, max: 5, step: 0.1, rec: 2.5, heavyRec: 2.5 },
  count: { min: 1, max: 5, step: 1, rec: 3, heavyRec: 3 },
} as const;

export type BossPresetId = "light" | "heavy";

export const BOSS_PRESETS: Record<BossPresetId, BossHpParams> = {
  /** 克制：能读清血量即可 —— 白条追得快、抖动小、单层血、告警不铺满屏幕。 */
  light: {
    lag: { on: true, wait: 0.22, catch: 0.3 },
    react: { on: true, shakeDecay: 0.16, shakeMax: 7, flash: 0.05 },
    ticks: { on: true, step: 10, markers: true },
    layers: { on: false, count: 1 },
    alarm: { on: true, threshold: 25, pulseHz: 1.5, edge: false },
    reducedMotion: "auto",
  },
  /** 全开（即页面默认配方）：五层全在，数值为可调默认值起点。 */
  heavy: {
    lag: { on: true, wait: 0.35, catch: 0.45 },
    react: { on: true, shakeDecay: 0.27, shakeMax: 14, flash: 0.08 },
    ticks: { on: true, step: 10, markers: true },
    layers: { on: true, count: 3 },
    alarm: { on: true, threshold: 25, pulseHz: 2.5, edge: true },
    reducedMotion: "auto",
  },
}

export const BOSS_DEFAULT_PARAMS: BossHpParams = structuredClone(BOSS_PRESETS.heavy);

export function cloneBossParams(p: BossHpParams): BossHpParams {
  return structuredClone(p);
}
