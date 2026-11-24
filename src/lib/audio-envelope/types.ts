export const WAVEFORMS = ["sine", "square", "triangle", "sawtooth", "noise"] as const;
export type Waveform = typeof WAVEFORMS[number];
export type Mode = "mine" | "default";

export interface Patch {
  // Times are in milliseconds, frequencies are in Hz, levels are linear.
  attack: number;
  decay: number;
  sustainLevel: number;
  sustainTime: number;
  release: number;
  frequency: number;
  endFrequency: number | null;
  gain: number;
  waveform: Waveform;
}
