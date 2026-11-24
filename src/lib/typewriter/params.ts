export type Mode = "default" | "mine";
export type Params = Readonly<{ speed: number; shortPause: number; sentencePause: number }>;
export type Tune = Readonly<{ params: Params; text: string }>;
export type Configuration = Readonly<{ mode: Mode; mine: Tune }>;

export const PARAM_KEYS = ["speed", "shortPause", "sentencePause"] as const;
export const LIMITS = {
  speed: [1, 80, 1],
  shortPause: [0, 600, 10],
  sentencePause: [0, 1500, 10],
} as const;

const sample = "等等，听见了吗？\nWait, listen… The lanterns are waking up. 🏮✨";
export const DEFAULT: Tune = { params: { speed: 24, shortPause: 120, sentencePause: 300 }, text: sample };
export const STARTER: Tune = { params: { speed: 36, shortPause: 240, sentencePause: 560 }, text: sample };

function clamp(key: keyof Params, value: number): number {
  const [min, max, step] = LIMITS[key];
  if (!Number.isFinite(value)) return DEFAULT.params[key];
  return Math.min(max, Math.max(min, Math.round(value / step) * step));
}

export function updateParam(mine: Tune, key: keyof Params, value: number): Tune {
  return { ...mine, params: { ...mine.params, [key]: clamp(key, value) } };
}

export function paramsForMode(mine: Tune, mode: Mode): Tune {
  return mode === "default" ? DEFAULT : mine;
}

export function parseParams(value: unknown): Params | null {
  if (typeof value !== "object" || value === null) return null;
  const fields = Object.fromEntries(Object.entries(value));
  const speed: unknown = fields.speed;
  const shortPause: unknown = fields.shortPause;
  const sentencePause: unknown = fields.sentencePause;
  if (typeof speed !== "number" || typeof shortPause !== "number" || typeof sentencePause !== "number") return null;
  if (speed !== clamp("speed", speed) || shortPause !== clamp("shortPause", shortPause)
    || sentencePause !== clamp("sentencePause", sentencePause)) return null;
  return { speed, shortPause, sentencePause };
}
