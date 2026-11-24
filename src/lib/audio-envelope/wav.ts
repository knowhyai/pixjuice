import { MAX_PEAK } from "./params.ts";

export function encodeWavPcm(samples: Float32Array, sampleRate: number): Uint8Array<ArrayBuffer> {
  const dataLength = samples.length * 2;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  function tag(offset: number, value: string): void {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  }

  tag(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, dataLength, true);

  const maxInt = Math.floor(MAX_PEAK * 32767);
  for (let i = 0; i < samples.length; i++) {
    const sample = Number.isFinite(samples[i]) ? samples[i] : 0;
    const quantized = Math.round(sample * (sample < 0 ? 32768 : 32767));
    view.setInt16(44 + i * 2, Math.max(-maxInt, Math.min(maxInt, quantized)), true);
  }
  return bytes;
}

export function wavBlob(samples: Float32Array, sampleRate: number): Blob {
  return new Blob([encodeWavPcm(samples, sampleRate)], { type: "audio/wav" });
}
