import { clampParams } from "./params";
import type { Mode, Params } from "./types";

export function exportJson(params: Readonly<Params>, mode: Mode): string {
  return JSON.stringify({
    name: "pixjuice-weapon-switch", version: 1, preview: "browser-local", mode, params: clampParams(params),
  }, null, 2) + "\n";
}

export function exportFilename(mode: Mode): string {
  return `pixjuice-weapon-switch-${mode}.json`;
}
