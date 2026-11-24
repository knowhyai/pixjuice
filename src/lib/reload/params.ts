import type { LabState, Mode, ReloadParams } from "./types";

export const DEFAULTS: Readonly<ReloadParams> = Object.freeze({
  magCapacity: 8, startMag: 3, startReserve: 16,
  magOutMs: 250, commitMs: 550, finishMs: 800, keepChamberRound: true,
});

export const STARTER: Readonly<ReloadParams> = Object.freeze({
  ...DEFAULTS, magOutMs: 180, commitMs: 700, finishMs: 1000,
});

export const NUMBER_FIELDS = [
  "magCapacity", "startMag", "startReserve", "magOutMs", "commitMs", "finishMs",
] as const;
export type NumberField = typeof NUMBER_FIELDS[number];
const MAX_TIME = 6000;

function integer(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

export function clampParams(input: unknown, fallback = DEFAULTS): ReloadParams {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const magCapacity = integer(raw.magCapacity, fallback.magCapacity, 1, 30);
  const magOutMs = integer(raw.magOutMs, fallback.magOutMs, 1, MAX_TIME - 2);
  const commitMs = integer(raw.commitMs, fallback.commitMs, magOutMs + 1, MAX_TIME - 1);
  return {
    magCapacity,
    startMag: integer(raw.startMag, fallback.startMag, 0, magCapacity),
    startReserve: integer(raw.startReserve, fallback.startReserve, 0, 99),
    magOutMs, commitMs,
    finishMs: integer(raw.finishMs, fallback.finishMs, commitMs + 1, MAX_TIME),
    keepChamberRound: typeof raw.keepChamberRound === "boolean" ? raw.keepChamberRound : fallback.keepChamberRound,
  };
}

export function mineFieldBounds(mine: ReloadParams): Record<NumberField, readonly [number, number]> {
  return {
    magCapacity: [Math.max(1, mine.startMag), 30],
    startMag: [0, mine.magCapacity],
    startReserve: [0, 99],
    magOutMs: [1, mine.commitMs - 1],
    commitMs: [mine.magOutMs + 1, mine.finishMs - 1],
    finishMs: [mine.commitMs + 1, MAX_TIME],
  };
}

export function editMineField(mine: ReloadParams, key: keyof ReloadParams, value: unknown): ReloadParams {
  if (key === "keepChamberRound") {
    return { ...mine, keepChamberRound: typeof value === "boolean" ? value : mine.keepChamberRound };
  }
  const [min, max] = mineFieldBounds(mine)[key];
  return { ...mine, [key]: integer(value, mine[key], min, max) };
}

export function editLabField(state: LabState, key: keyof ReloadParams, value: unknown): LabState {
  return { mine: editMineField(state.mine, key, value), mode: "mine" };
}

export function paramsForMode(mine: ReloadParams, defaults: Readonly<ReloadParams>, mode: Mode): Readonly<ReloadParams> {
  return mode === "default" ? defaults : mine;
}
