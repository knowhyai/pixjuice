import { DEFAULT_PATCH } from "./params.ts";
import type { Patch } from "./types.ts";

export const PRESETS = [
  { id: "tap", params: { attack: 3, decay: 24, sustainLevel: 0.15, sustainTime: 0,
    release: 32, frequency: 760, waveform: "triangle" } },
  { id: "confirm", params: { attack: 7, decay: 65, sustainLevel: 0.52, sustainTime: 65,
    release: 105, frequency: 520, endFrequency: 880, waveform: "sine" } },
  { id: "notify", params: { attack: 27, decay: 115, sustainLevel: 0.48, sustainTime: 95,
    release: 245, frequency: 660, waveform: "sine", gain: 0.13 } },
  { id: "caution", params: { attack: 8, decay: 88, sustainLevel: 0.36, sustainTime: 60,
    release: 128, frequency: 285, waveform: "square", gain: 0.11 } },
  { id: "sweep", params: { attack: 11, decay: 91, sustainLevel: 0.55, sustainTime: 145,
    release: 155, frequency: 1130, endFrequency: 210, waveform: "sine" } },
  { id: "air", params: { attack: 19, decay: 55, sustainLevel: 0.24, sustainTime: 26,
    release: 182, waveform: "noise", gain: 0.15 } },
] as const satisfies readonly { id: string; params: Partial<Patch> }[];

export function patchForPreset(preset: typeof PRESETS[number]): Patch {
  return { ...DEFAULT_PATCH, ...preset.params };
}
