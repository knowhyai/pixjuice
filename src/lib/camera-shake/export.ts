import { clampParams } from "./params";
import type { ShakeMode, ShakeParams } from "./types";

export function patchJson(mode: ShakeMode, params: ShakeParams): string {
  return JSON.stringify({
    name: "pixjuice-camera-shake",
    version: 1,
    preview: "browser-local",
    mode,
    params: clampParams(params),
  }, null, 2) + "\n";
}

export function patchFilename(mode: ShakeMode): string {
  return `pixjuice-camera-shake-${mode}.json`;
}
