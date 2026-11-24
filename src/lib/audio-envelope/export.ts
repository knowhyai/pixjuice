import { clampPatch } from "./params.ts";
import { renderPcm } from "./synth.ts";
import type { Patch } from "./types.ts";

export function patchJson(name: string, input: Partial<Patch>): string {
  const params = clampPatch(input);
  const { sampleRate, duration, peak } = renderPcm(params);
  return JSON.stringify({ name, version: 1, sampleRate, duration, peak, params }, null, 2) + "\n";
}

export function downloadPatch(name: string, extension: "wav" | "json", blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `pixjuice-envelope-${name}.${extension}`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
