import type { Mode, Params } from "./types";

export const DEFAULTS: Readonly<Params> = Object.freeze({
  holsterMs: 180, drawMs: 220, busyMs: 500, busyKind: "fire", busyPolicy: "buffer",
  bufferTtlMs: 650, cancelWindowStartMs: 500, cancelWindowEndMs: 500, cooldownMs: 1000,
});

export const STARTER: Readonly<Params> = Object.freeze({
  ...DEFAULTS, holsterMs: 140, cancelWindowStartMs: 250,
});

export const LIMITS = {
  holsterMs: 2000, drawMs: 2000, busyMs: 2000, bufferTtlMs: 2000,
  cancelWindowStartMs: 2000, cancelWindowEndMs: 2000, cooldownMs: 5000,
} as const;
export type NumericParam = keyof typeof LIMITS;

export function clampParams(input: unknown, fallback: Readonly<Params> = DEFAULTS): Params {
  const source = input !== null && typeof input === "object" ? input : {};
  const read = (key: keyof Params): unknown => Object.getOwnPropertyDescriptor(source, key)?.value;
  function number(key: NumericParam, max: number = LIMITS[key]): number {
    const value = read(key);
    const valid = typeof value === "number" && Number.isFinite(value) ? value : fallback[key];
    return Math.min(max, Math.max(0, Math.round(valid)));
  }
  const busyMs = number("busyMs");
  const cancelWindowEndMs = number("cancelWindowEndMs", busyMs);
  const busyKind = read("busyKind");
  const busyPolicy = read("busyPolicy");
  return {
    holsterMs: number("holsterMs"),
    drawMs: number("drawMs"),
    busyMs,
    busyKind: busyKind === "fire" || busyKind === "reload" ? busyKind : fallback.busyKind,
    busyPolicy: busyPolicy === "buffer" || busyPolicy === "interrupt" ? busyPolicy : fallback.busyPolicy,
    bufferTtlMs: number("bufferTtlMs"),
    cancelWindowStartMs: number("cancelWindowStartMs", cancelWindowEndMs),
    cancelWindowEndMs,
    cooldownMs: number("cooldownMs"),
  };
}

export function mineFieldBounds(mine: Readonly<Params>, key: NumericParam): { min: number; max: number } {
  const max = LIMITS[key];
  switch (key) {
    case "busyMs":
      return { min: mine.cancelWindowEndMs, max };
    case "cancelWindowEndMs":
      return { min: mine.cancelWindowStartMs, max: Math.min(max, mine.busyMs) };
    case "cancelWindowStartMs":
      return { min: 0, max: Math.min(max, mine.cancelWindowEndMs) };
    default:
      return { min: 0, max };
  }
}

export type MineFieldEdit =
  | [key: NumericParam, value: number]
  | [key: "busyKind", value: Params["busyKind"]]
  | [key: "busyPolicy", value: Params["busyPolicy"]];

export function editMineField(mine: Readonly<Params>, ...[key, value]: MineFieldEdit): Params {
  if (key === "busyKind") return { ...mine, busyKind: value };
  if (key === "busyPolicy") return { ...mine, busyPolicy: value };
  const { min, max } = mineFieldBounds(mine, key);
  const requested = Number.isFinite(value) ? Math.round(value) : mine[key];
  return { ...mine, [key]: Math.min(max, Math.max(min, requested)) };
}

export function paramsForMode(tune: Readonly<Params>, defaults: Readonly<Params>, mode: Mode): Params {
  return clampParams(mode === "default" ? defaults : tune, defaults);
}
