import { DEFAULTS } from "./params";
import type { Mode, ReloadParams } from "./types";

export function exportJson(params: Readonly<ReloadParams>, mode: Mode) {
  return { v: 1, mode, params: { ...(mode === "default" ? DEFAULTS : params) } };
}
