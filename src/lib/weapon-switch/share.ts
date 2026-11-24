import { clampParams, STARTER } from "./params";
import type { Mode, Params } from "./types";

export const SHARE_PARAM = "swap";

export function encodeShare(input: Readonly<Params>, mode: Mode): string {
  const p = clampParams(input);
  return [
    1, mode === "mine" ? 1 : 0, p.holsterMs, p.drawMs, p.busyMs, p.busyKind === "reload" ? 1 : 0,
    p.busyPolicy === "interrupt" ? 1 : 0, p.bufferTtlMs, p.cancelWindowStartMs, p.cancelWindowEndMs, p.cooldownMs,
  ].map(value => value.toString(36)).join(".");
}

export function decodeShare(token: unknown): { mode: Mode; params: Params } | null {
  if (typeof token !== "string" || token.length > 100 || !/^[a-z0-9]+(?:\.[a-z0-9]+){10}$/.test(token)) return null;
  const [version, mode, holsterMs, drawMs, busyMs, kind, policy, bufferTtlMs,
    cancelWindowStartMs, cancelWindowEndMs, cooldownMs] = token.split(".").map(value => parseInt(value, 36));
  if (version !== 1 || mode > 1 || kind > 1 || policy > 1) return null;
  return {
    mode: mode === 1 ? "mine" : "default",
    params: clampParams({
      holsterMs, drawMs, busyMs, busyKind: kind === 1 ? "reload" : "fire",
      busyPolicy: policy === 1 ? "interrupt" : "buffer", bufferTtlMs,
      cancelWindowStartMs, cancelWindowEndMs, cooldownMs,
    }),
  };
}

export function initializeLabState({ token, storedMine }: { token: unknown; storedMine: unknown }): { mine: Params; mode: Mode } {
  const shared = decodeShare(token);
  if (shared) return { mine: shared.params, mode: shared.mode };
  return { mine: clampParams(storedMine, STARTER), mode: "default" };
}

export function buildShareUrl(href: string, mine: Readonly<Params>, mode: Mode): string {
  const url = new URL(href);
  url.hash = "";
  url.searchParams.set(SHARE_PARAM, encodeShare(mine, mode));
  return url.href;
}
