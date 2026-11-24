import { clampParams, PARAM_KEYS } from "./params";
import type { ShakeMode, ShakeParams } from "./types";

export const SHARE_PARAM = "shake";

export function encodeShare(mode: ShakeMode, tune: ShakeParams): string {
  const params = clampParams(tune);
  return ["1", mode === "mine" ? "m" : "d", ...PARAM_KEYS.map(key => params[key])].join("_");
}

export function decodeShare(token: string | null): { mode: ShakeMode; tune: ShakeParams } | null {
  if (!token || token.length > 96) return null;
  const [version, mode, ...values] = token.split("_");
  if (version !== "1" || (mode !== "d" && mode !== "m") || values.length !== PARAM_KEYS.length
    || !values.every(value => /^-?\d+(\.\d+)?$/.test(value))) return null;

  const tune = Object.fromEntries(PARAM_KEYS.map((key, index) => [key, Number(values[index])]));
  return { mode: mode === "m" ? "mine" : "default", tune: clampParams(tune) };
}

export function buildShareUrl(href: string, mode: ShakeMode, tune: ShakeParams): string {
  const url = new URL(href);
  url.searchParams.set(SHARE_PARAM, encodeShare(mode, tune));
  return url.href;
}
