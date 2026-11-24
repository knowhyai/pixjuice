import { createEnvelope } from "./envelope.ts";
import { clampPatch, PCM_CEILING, SAMPLE_RATE } from "./params.ts";
import type { Patch, Waveform } from "./types.ts";

function whiteNoise(length: number): Float32Array<ArrayBuffer> {
  // Repeatable white noise gives preview and export the same source.
  const samples = new Float32Array(length);
  let state = 0x91e10da5;
  for (let i = 0; i < length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    samples[i] = (state >>> 0) / 0x80000000 - 1;
  }
  return samples;
}

// Smooth discontinuities over a sample on either side to reduce aliasing.
function polyBlep(phase: number, step: number): number {
  if (phase < step) {
    const x = phase / step;
    return 2 * x - x * x - 1;
  }
  if (phase > 1 - step) {
    const x = (phase - 1) / step;
    return x * x + 2 * x + 1;
  }
  return 0;
}

function oscillator(waveform: Exclude<Waveform, "noise">, phase: number, step: number): number {
  switch (waveform) {
    case "sine": return Math.sin(2 * Math.PI * phase);
    case "triangle": return 1 - 4 * Math.abs(((phase + 0.25) % 1) - 0.5);
    case "square":
      return (phase < 0.5 ? 1 : -1) + polyBlep(phase, step) - polyBlep((phase + 0.5) % 1, step);
    case "sawtooth": {
      const shifted = (phase + 0.5) % 1;
      return 2 * shifted - 1 - polyBlep(shifted, step);
    }
  }
}

export function renderPcm(input: Partial<Patch>) {
  const patch = clampPatch(input);
  const envelope = createEnvelope(patch);
  const { duration } = envelope;
  const length = Math.round(duration * SAMPLE_RATE);
  const samples = patch.waveform === "noise" ? whiteNoise(length) : new Float32Array(length);
  const sweep = ((patch.endFrequency ?? patch.frequency) - patch.frequency) / duration;
  let peak = 0;

  for (let i = 0; i < length; i++) {
    const time = i / SAMPLE_RATE;
    const phase = (time * (patch.frequency + sweep * time / 2)) % 1;
    const source = patch.waveform === "noise" ? samples[i]
      : oscillator(patch.waveform, phase, (patch.frequency + sweep * time) / SAMPLE_RATE);
    samples[i] = source * envelope.valueAt(time) * patch.gain;
    peak = Math.max(peak, Math.abs(samples[i]));
  }

  if (peak > PCM_CEILING) {
    const scale = PCM_CEILING / peak;
    peak = 0;
    for (let i = 0; i < length; i++) {
      samples[i] = Math.max(-PCM_CEILING, Math.min(PCM_CEILING, samples[i] * scale));
      peak = Math.max(peak, Math.abs(samples[i]));
    }
  }
  return { samples, sampleRate: SAMPLE_RATE, duration, peak };
}

export interface Voice {
  stop(): void;
  ended: Promise<void>;
}

const voices = new WeakMap<AudioContext, Voice>();

/** Start one finite voice on a context already resumed by a Play gesture. */
export function playWithWebAudio(ctx: AudioContext, input: Partial<Patch>): Voice {
  voices.get(ctx)?.stop();
  const { samples, sampleRate } = renderPcm(input);
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.copyToChannel(samples, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  let resolveEnded!: () => void;
  const ended = new Promise<void>((resolve) => { resolveEnded = resolve; });
  let active = true;
  function finish(): void {
    if (!active) return;
    active = false;
    source.disconnect();
    source.onended = null;
    if (voices.get(ctx) === voice) voices.delete(ctx);
    resolveEnded();
  }
  const voice: Voice = {
    ended,
    stop() {
      if (!active) return;
      source.stop();
      finish();
    },
  };
  source.onended = finish;
  try {
    source.start(ctx.currentTime + 0.005);
  } catch (error) {
    finish();
    throw error;
  }
  voices.set(ctx, voice);
  return voice;
}
