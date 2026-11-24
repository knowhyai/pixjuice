import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { DEFAULT_PATCH, MAX_PEAK, SAMPLE_RATE } from '../src/lib/audio-envelope/params.ts';
import { patchForPreset, PRESETS } from '../src/lib/audio-envelope/presets.ts';
import { renderPcm } from '../src/lib/audio-envelope/synth.ts';
import { encodeWavPcm } from '../src/lib/audio-envelope/wav.ts';

const output = new URL('file:///workspace/pixjuice-briefs/audio-envelope-20261124/wav-samples/');
const patches = [['default', DEFAULT_PATCH], ...PRESETS.map((preset) => [preset.id, patchForPreset(preset)])];
await mkdir(output, { recursive: true });

for (const [name, patch] of patches) {
  const { samples, sampleRate, duration, peak } = renderPcm(patch);
  const wav = Buffer.from(encodeWavPcm(samples, sampleRate));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), wav.length - 8);
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(wav.readUInt32LE(16), 16);
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), SAMPLE_RATE);
  assert.equal(wav.readUInt32LE(28), SAMPLE_RATE * 2);
  assert.equal(wav.readUInt16LE(32), 2);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), samples.length * 2);
  assert.equal(wav.length, 44 + samples.length * 2);
  assert.ok(peak > 0 && peak <= MAX_PEAK && duration >= 0.005 && duration <= 5);
  let encodedPeak = 0;
  for (let offset = 44; offset < wav.length; offset += 2) {
    encodedPeak = Math.max(encodedPeak, Math.abs(wav.readInt16LE(offset)) / 32767);
  }
  assert.ok(encodedPeak <= MAX_PEAK);
  const filename = `pixjuice-envelope-${name}.wav`;
  await writeFile(new URL(filename, output), wav);
  console.log(`${filename}  ${sampleRate} Hz  ${duration.toFixed(3)} s  peak ${peak.toFixed(6)}  PCM peak ${encodedPeak.toFixed(6)}  RIFF/WAVE header OK`);
}
