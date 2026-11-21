// Shareable recipe state for the two feel recipes. A whole tune (every layer
// switch, sub-switch and number) packs into one short `?tune=` token so a
// retune can be bookmarked or sent to a teammate. Pure data in/out — no DOM,
// no history side effects; the pages own replaceState and the copy button.
//
// Token grammar (identical shape for both recipes):
//   <preset-id>                       shorthand when the state equals a named preset
//   1-<flags>-<n1>-<n2>…              v1: base36 bit mask of the switches, then
//                                     every slider number in a fixed order at its
//                                     own step precision (e.g. 4 / 0.25 / 26).
//                                     "-" separates fields — the numbers are plain
//                                     non-negative decimals, so it never collides.
// Parsing is defensive by contract: anything malformed, non-numeric or out of
// slider range rejects the whole token (null) and the page keeps its defaults.
// Numbers snap back onto the slider grid, so float noise can never survive a
// round-trip. reducedMotion is deliberately NOT serialized — it is a local
// accessibility preference of the demo, not part of the recipe.

import {
  cloneParams,
  DEFAULT_PARAMS,
  PRESETS,
  SLIDERS,
  type FeelParams,
  type PresetId,
} from "./params";
import {
  BOSS_DEFAULT_PARAMS,
  BOSS_PRESETS,
  BOSS_SLIDERS,
  cloneBossParams,
  type BossHpParams,
  type BossPresetId,
} from "./boss-params";

// ---- shared helpers -------------------------------------------------------------

const dec = (step: number): number => {
  const s = String(step);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
};

/** Format a number at its slider's step precision. Integer grids keep their
 *  trailing zeros ("40" must not collapse to "4"); decimal grids trim them. */
function numToStr(v: number, step: number): string {
  const d = dec(step);
  if (d === 0) return String(Math.round(v));
  return v.toFixed(d).replace(/0+$/, "").replace(/\.$/, "") || "0";
}

/** Plain decimal literal only — rejects "", "1e3", "0x10", "-1", "NaN", "Infinity". */
const PLAIN_NUM = /^[0-9]+(\.[0-9]+)?$/;

/** Snap onto the slider grid (min-anchored) and quantize — or null if invalid. */
function snap(raw: string, meta: { min: number; max: number; step: number }): number | null {
  if (!PLAIN_NUM.test(raw)) return null;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < meta.min - 1e-9 || v > meta.max + 1e-9) return null;
  const k = Math.round((v - meta.min) / meta.step);
  return Number((k * meta.step + meta.min).toFixed(dec(meta.step) + 1));
}

function flagsToInt(paths: string[], read: (p: string) => boolean): number {
  let n = 0;
  paths.forEach((p, i) => {
    if (read(p)) n |= 1 << i;
  });
  return n;
}

const toB36 = (n: number): string => (n === 0 ? "0" : n.toString(36));
const fromB36 = (s: string): number | null => (/^[0-9a-z]+$/.test(s) ? parseInt(s, 36) : null);

const getPath = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], obj);
const setPath = (obj: unknown, path: string, value: unknown): void => {
  const parts = path.split(".");
  let node: unknown = obj;
  for (let i = 0; i < parts.length - 1; i++) node = (node as Record<string, unknown>)[parts[i]];
  (node as Record<string, unknown>)[parts[parts.length - 1]] = value;
};

const sameParams = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// ---- hit recipe -------------------------------------------------------------------

const HIT_FLAGS = [
  "hitStop.on",
  "shake.on",
  "feedback.on",
  "feedback.flash",
  "feedback.squash",
  "feedback.numbers",
  "knockback.on",
  "vfx.on",
  "vfx.shockwave",
  "sfx.on",
  "sfx.low",
  "sfx.mid",
  "sfx.high",
  "heavyFinisher",
  "overdoneExtras",
] as const;

const HIT_NUMS: { path: string; key: keyof typeof SLIDERS }[] = [
  { path: "hitStop.frames", key: "frames" },
  { path: "shake.trauma", key: "trauma" },
  { path: "shake.decay", key: "decay" },
  { path: "feedback.flashIntensity", key: "flashIntensity" },
  { path: "feedback.squashAmount", key: "squashAmount" },
  { path: "feedback.numberScale", key: "numberScale" },
  { path: "knockback.distance", key: "distance" },
  { path: "knockback.stopTime", key: "stopTime" },
  { path: "vfx.sparks", key: "sparks" },
  { path: "sfx.volume", key: "volume" },
];

export function serializeFeel(params: FeelParams): string {
  for (const id of Object.keys(PRESETS) as PresetId[])
    if (sameParams(params, PRESETS[id])) return id;
  const flags = toB36(flagsToInt([...HIT_FLAGS], (p) => Boolean(getPath(params, p))));
  const nums = HIT_NUMS.map((s) => numToStr(Number(getPath(params, s.path)), SLIDERS[s.key].step));
  return `1-${flags}-${nums.join("-")}`;
}

export function parseFeelState(raw: string): { params: FeelParams; preset: PresetId | null } | null {
  const token = raw.trim();
  if (token in PRESETS) return { params: cloneParams(PRESETS[token as PresetId]), preset: token as PresetId };
  const parts = token.split("-");
  if (parts.length !== 2 + HIT_NUMS.length || parts[0] !== "1") return null;
  const bits = fromB36(parts[1]);
  if (bits === null || bits >= 1 << HIT_FLAGS.length) return null;
  const params = cloneParams(DEFAULT_PARAMS);
  HIT_FLAGS.forEach((p, i) => setPath(params, p, Boolean(bits & (1 << i))));
  for (let i = 0; i < HIT_NUMS.length; i++) {
    const spec = HIT_NUMS[i];
    const v = snap(parts[2 + i], SLIDERS[spec.key]);
    if (v === null) return null;
    setPath(params, spec.path, v);
  }
  // a full token that happens to equal a preset restores that highlight too
  for (const id of Object.keys(PRESETS) as PresetId[])
    if (sameParams(params, PRESETS[id])) return { params, preset: id };
  return { params, preset: null };
}

// ---- boss recipe -------------------------------------------------------------------

const BOSS_FLAGS = [
  "lag.on",
  "react.on",
  "ticks.on",
  "ticks.markers",
  "layers.on",
  "alarm.on",
  "alarm.edge",
] as const;

const BOSS_NUMS: { path: string; key: keyof typeof BOSS_SLIDERS }[] = [
  { path: "lag.wait", key: "wait" },
  { path: "lag.catch", key: "catch" },
  { path: "react.shakeDecay", key: "shakeDecay" },
  { path: "react.shakeMax", key: "shakeMax" },
  { path: "react.flash", key: "flash" },
  { path: "ticks.step", key: "step" },
  { path: "alarm.threshold", key: "threshold" },
  { path: "alarm.pulseHz", key: "pulseHz" },
  { path: "layers.count", key: "count" },
];

export function serializeBoss(params: BossHpParams): string {
  const recipeOnly: BossHpParams = { ...cloneBossParams(params), reducedMotion: "auto" };
  for (const id of Object.keys(BOSS_PRESETS) as BossPresetId[])
    if (sameParams(recipeOnly, BOSS_PRESETS[id])) return id;
  const flags = toB36(flagsToInt([...BOSS_FLAGS], (p) => Boolean(getPath(recipeOnly, p))));
  const nums = BOSS_NUMS.map((s) => numToStr(Number(getPath(recipeOnly, s.path)), BOSS_SLIDERS[s.key].step));
  return `1-${flags}-${nums.join("-")}`;
}

export function parseBossState(raw: string): { params: BossHpParams; preset: BossPresetId | null } | null {
  const token = raw.trim();
  if (token in BOSS_PRESETS)
    return { params: cloneBossParams(BOSS_PRESETS[token as BossPresetId]), preset: token as BossPresetId };
  const parts = token.split("-");
  if (parts.length !== 2 + BOSS_NUMS.length || parts[0] !== "1") return null;
  const bits = fromB36(parts[1]);
  if (bits === null || bits >= 1 << BOSS_FLAGS.length) return null;
  const params = cloneBossParams(BOSS_DEFAULT_PARAMS);
  BOSS_FLAGS.forEach((p, i) => setPath(params, p, Boolean(bits & (1 << i))));
  for (let i = 0; i < BOSS_NUMS.length; i++) {
    const spec = BOSS_NUMS[i];
    const v = snap(parts[2 + i], BOSS_SLIDERS[spec.key]);
    if (v === null) return null;
    setPath(params, spec.path, v);
  }
  params.reducedMotion = "auto"; // local accessibility preference, never shared
  for (const id of Object.keys(BOSS_PRESETS) as BossPresetId[])
    if (sameParams(params, BOSS_PRESETS[id])) return { params, preset: id };
  return { params, preset: null };
}

// ---- URL plumbing (used by both pages) ----------------------------------------------

export const TUNE_PARAM = "tune";

/** The `?tune=` value of the current URL, or null. Pure read, no side effects. */
export function readTuneParam(search: string): string | null {
  const v = new URLSearchParams(search).get(TUNE_PARAM);
  return v && v.length > 0 && v.length <= 512 && !/[^\w.-]/.test(v) ? v : null;
}

/** Build the share URL for a token: same page, ?tune= replaced, other params and hash kept. */
export function buildShareUrl(origin: string, pathname: string, search: string, hash: string, token: string): string {
  const sp = new URLSearchParams(search);
  sp.delete(TUNE_PARAM);
  if (token) sp.set(TUNE_PARAM, token);
  const q = sp.toString();
  return `${origin}${pathname}${q ? `?${q}` : ""}${hash}`;
}
