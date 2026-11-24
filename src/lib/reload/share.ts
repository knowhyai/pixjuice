import { clampParams, NUMBER_FIELDS, STARTER } from "./params";
import type { LabState, Mode, ReloadParams } from "./types";

export const SHARE_PARAM = "reload";

export function encodeShare(mine: ReloadParams, mode: Mode): string {
  return btoa(JSON.stringify({ v: 1, mine: clampParams(mine), mode }))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeShare(token: string | null | undefined): LabState | null {
  if (!token || token.length > 1024 || !/^[\w-]+$/.test(token)) return null;
  try {
    const decoded: unknown = JSON.parse(atob(token.replaceAll("-", "+").replaceAll("_", "/")));
    if (!decoded || typeof decoded !== "object") return null;
    const { v, mode, mine: rawMine } = decoded as Record<string, unknown>;
    if (v !== 1 || (mode !== "mine" && mode !== "default")) return null;
    if (!rawMine || typeof rawMine !== "object") return null;
    const mine = rawMine as Record<string, unknown>;
    if (!NUMBER_FIELDS.every(field => Number.isFinite(mine[field]))
      || typeof mine.keepChamberRound !== "boolean") return null;
    return { mine: clampParams(mine), mode };
  } catch {
    return null;
  }
}

export function initializeLabState({ token, storedMine }: { token?: string | null; storedMine?: unknown } = {}): LabState {
  return decodeShare(token) ?? { mine: clampParams(storedMine, STARTER), mode: "default" };
}

export function buildShareUrl(href: string, mine: ReloadParams, mode: Mode): string {
  const url = new URL(href);
  url.searchParams.set(SHARE_PARAM, encodeShare(mine, mode));
  return url.href;
}
