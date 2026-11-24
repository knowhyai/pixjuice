import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const urls = new Map();
function moduleUrl(name) {
  if (urls.has(name)) return urls.get(name);
  const source = readFileSync(new URL(`../src/lib/audio-envelope/${name}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const rewritten = outputText.replace(/from "\.\/([a-z]+)\.ts"/g, (_, dep) => `from "${moduleUrl(dep)}"`);
  const url = 'data:text/javascript;base64,' + Buffer.from(rewritten).toString('base64');
  urls.set(name, url);
  return url;
}

const { DEFAULT_PATCH, LIMITS, MAX_GAIN, MAX_PEAK, SAMPLE_RATE, clampPatch, paramsForMode, shouldAutoplay } =
  await import(moduleUrl('params'));
const { createEnvelope, envelopePoints, scheduleGain, valueAt } = await import(moduleUrl('envelope'));
const { playWithWebAudio, renderPcm } = await import(moduleUrl('synth'));
const { encodeWavPcm, wavBlob } = await import(moduleUrl('wav'));
const { patchJson } = await import(moduleUrl('export'));
const { PRESETS, patchForPreset } = await import(moduleUrl('presets'));
const { WAVEFORMS } = await import(moduleUrl('types'));

function assertSafe({ samples, sampleRate, duration, peak }) {
  assert.equal(sampleRate, SAMPLE_RATE);
  assert.ok(duration >= 0.005 && duration <= 5);
  assert.equal(samples.length, Math.round(duration * SAMPLE_RATE));
  let measured = 0;
  for (const sample of samples) {
    assert.ok(Number.isFinite(sample) && Math.abs(sample) <= MAX_PEAK);
    measured = Math.max(measured, Math.abs(sample));
  }
  assert.equal(peak, measured);
}

test('default patch is a short, quiet one-shot with no autoplay', () => {
  const result = renderPcm(DEFAULT_PATCH);
  assertSafe(result);
  assert.ok(DEFAULT_PATCH.gain >= 0.12 && DEFAULT_PATCH.gain <= 0.20);
  assert.ok(result.peak > 0 && result.peak <= DEFAULT_PATCH.gain);
  assert.equal(shouldAutoplay(), false);
});

test('clamps unbounded stages and frequency, then normalizes peak and duration', () => {
  const input = { attack: Infinity, decay: 1e8, sustainLevel: 2, sustainTime: 1e8,
    release: 1e8, frequency: 1e6, endFrequency: -Infinity, gain: 1, waveform: 'square' };
  const patch = clampPatch(input);
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    assert.ok(patch[key] >= min && patch[key] <= max, key);
  }
  assert.equal(patch.gain, MAX_GAIN);
  assert.equal(patch.frequency, 2000);
  assert.equal(patch.endFrequency, 80);
  assert.deepEqual(clampPatch(patch), patch);
  const result = renderPcm(input);
  assertSafe(result);
  assert.ok(result.peak > 0.349 && result.peak <= MAX_PEAK);
  const minimum = renderPcm({ attack: 0, decay: -1, sustainTime: -1, release: -Infinity, gain: NaN });
  assertSafe(minimum);
  assert.equal(minimum.duration, 0.005);
});

test('gain tops out at the peak ceiling and default sine peaks increase across the range', () => {
  assert.equal(MAX_GAIN, MAX_PEAK);
  assert.deepEqual(LIMITS.gain, [0, MAX_GAIN, 0.01]);
  assert.equal(DEFAULT_PATCH.gain, 0.16);
  let previousPeak = -1;
  for (const gain of [0, 0.08, DEFAULT_PATCH.gain, 0.24, MAX_GAIN]) {
    const result = renderPcm({ ...DEFAULT_PATCH, gain });
    assertSafe(result);
    assert.ok(result.peak > previousPeak, `gain ${gain}`);
    previousPeak = result.peak;
  }
});

test('legacy gain 0.45 exports the same patch and audio as max gain', async () => {
  const legacy = { waveform: 'square', gain: 0.45 };
  const capped = { ...legacy, gain: MAX_GAIN };
  assert.equal(clampPatch(legacy).gain, MAX_GAIN);
  assert.equal(JSON.parse(patchJson('custom', legacy)).params.gain, MAX_GAIN);
  const legacyPcm = renderPcm(legacy);
  const cappedPcm = renderPcm(capped);
  assert.deepEqual(legacyPcm, cappedPcm);
  assert.deepEqual(await wavBlob(legacyPcm.samples, legacyPcm.sampleRate).arrayBuffer(),
    await wavBlob(cappedPcm.samples, cappedPcm.sampleRate).arrayBuffer());
});

test('envelope math, canvas knees, and gain automation agree', () => {
  const patch = { attack: 20, decay: 30, sustainLevel: 0.4, sustainTime: 60, release: 40 };
  const expected = [
    { time: 0, level: 0 }, { time: 0.02, level: 1 }, { time: 0.05, level: 0.4 },
    { time: 0.11, level: 0.4 }, { time: 0.15, level: 0 },
  ];
  assert.deepEqual(envelopePoints(patch), expected);
  for (const [time, level] of [[0.01, 0.5], [0.035, 0.7], [0.06, 0.4], [0.13, 0.2], [1, 0]]) {
    assert.ok(Math.abs(valueAt(time, patch) - level) < 1e-9);
  }
  const events = [];
  const gain = {
    cancelScheduledValues: (time) => events.push(['cancel', time]),
    setValueAtTime: (value, time) => events.push(['set', value, time]),
    linearRampToValueAtTime: (value, time) => events.push(['ramp', value, time]),
  };
  assert.equal(scheduleGain(gain, 1, patch), 0.15);
  assert.deepEqual(events, [
    ['cancel', 1], ['set', 0, 1], ['ramp', 1, 1.02], ['ramp', 0.4, 1.05],
    ['set', 0.4, 1.11], ['ramp', 0, 1.15],
  ]);
  events.length = 0;
  scheduleGain(gain, 1, { ...patch, sustainTime: 0 });
  assert.equal(events.length, 5);
});

test('WAV has a valid mono PCM header and quantized samples respect the peak ceiling', () => {
  const { samples, sampleRate } = renderPcm({ waveform: 'square', gain: 0.45 });
  const bytes = encodeWavPcm(samples, sampleRate);
  const view = new DataView(bytes.buffer);
  const ascii = (offset) => Buffer.from(bytes.subarray(offset, offset + 4)).toString('ascii');
  assert.deepEqual([ascii(0), ascii(8), ascii(12), ascii(36)], ['RIFF', 'WAVE', 'fmt ', 'data']);
  assert.deepEqual([4, 16, 24, 28, 40].map((offset) => view.getUint32(offset, true)),
    [bytes.length - 8, 16, 44100, 88200, samples.length * 2]);
  assert.deepEqual([20, 22, 32, 34].map((offset) => view.getUint16(offset, true)), [1, 1, 2, 16]);
  assert.equal(bytes.length, 44 + samples.length * 2);
  for (let i = 44; i < bytes.length; i += 2) {
    assert.ok(Math.abs(view.getInt16(i, true)) / 32767 <= MAX_PEAK);
  }
});

test('JSON describes the exact clamped patch and deterministic export render', () => {
  const input = { waveform: 'noise', gain: 50, frequency: 56 };
  const { duration, peak, sampleRate } = renderPcm(input);
  assert.deepEqual(JSON.parse(patchJson('custom', input)), {
    name: 'custom', version: 1, sampleRate, duration, peak, params: clampPatch(input),
  });
});

test('page default mode keeps the stored tune intact', () => {
  const tune = Object.freeze({ ...DEFAULT_PATCH, frequency: 350, release: 740 });
  assert.deepEqual(paramsForMode(tune, DEFAULT_PATCH, 'default'), DEFAULT_PATCH);
  assert.deepEqual(paramsForMode(tune, DEFAULT_PATCH, 'mine'), tune);
  assert.notEqual(paramsForMode(tune, DEFAULT_PATCH, 'mine'), tune);
});

test('presets are distinct, peak-safe short one-shots with matching JSON and WAV', async () => {
  assert.equal(PRESETS.length, 6);
  const captures = new Set();
  for (const preset of PRESETS) {
    const input = patchForPreset(preset);
    const params = clampPatch(input);
    const result = renderPcm(params);
    const { duration, peak, sampleRate, samples } = result;
    assert.deepEqual(JSON.parse(patchJson(preset.id, input)), {
      name: preset.id, version: 1, sampleRate, duration, peak, params,
    });
    const pcm = renderPcm(input);
    const wav = await wavBlob(pcm.samples, pcm.sampleRate).arrayBuffer();
    assert.deepEqual(new Uint8Array(wav), encodeWavPcm(samples, sampleRate));
    assertSafe(result);
    assert.ok(result.duration < 0.6 && result.peak > 0);
    captures.add(Buffer.from(result.samples.buffer).toString('base64'));
  }
  assert.equal(captures.size, PRESETS.length);
});

test('every waveform renders a non-silent buffer at 44100 Hz', () => {
  for (const waveform of WAVEFORMS) {
    const result = renderPcm({ ...DEFAULT_PATCH, waveform });
    assertSafe(result);
    assert.equal(result.duration, createEnvelope(DEFAULT_PATCH).duration);
    assert.ok(result.peak > 0.05, waveform);
    assert.equal(result.samples[0], 0);
  }
});

test('downward sweep slows across the rendered buffer', () => {
  const patch = patchForPreset(PRESETS.find(({ id }) => id === 'sweep'));
  const result = renderPcm(patch);
  assertSafe(result);
  function crossings(from, to) {
    let count = 0;
    for (let i = Math.round(from * SAMPLE_RATE); i < to * SAMPLE_RATE; i++) {
      if (result.samples[i - 1] <= 0 && result.samples[i] > 0) count++;
    }
    return count;
  }
  assert.ok(crossings(0.025, 0.075) > 2 * crossings(0.30, 0.35));
});

function stubAudioContext() {
  const sources = [];
  const context = {
    currentTime: 3,
    destination: {},
    createBuffer(channels, length, sampleRate) {
      assert.equal(channels, 1);
      const samples = new Float32Array(length);
      return {
        samples, sampleRate,
        duration: length / sampleRate,
        copyToChannel(data, channel) {
          assert.equal(channel, 0);
          samples.set(data);
        },
      };
    },
    createBufferSource() {
      const source = {
        disconnected: false,
        stops: 0,
        connect(destination) { this.destination = destination; },
        disconnect() { this.disconnected = true; },
        start(time) { this.startTime = time; },
        stop() { this.stops++; },
      };
      sources.push(source);
      return source;
    },
  };
  return { context, sources };
}

test('Web Audio plays the exact renderPcm buffer, including at zero gain', () => {
  for (const input of [DEFAULT_PATCH, { waveform: 'noise', gain: 0.45 }, { gain: 0 }]) {
    const pcm = renderPcm(input);
    if (input.gain === 0) {
      assert.equal(pcm.peak, 0);
      assert.ok(pcm.samples.every((sample) => sample === 0));
    }
    const { context, sources } = stubAudioContext();
    const voice = playWithWebAudio(context, input);
    const [source] = sources;
    assert.equal(source.buffer.sampleRate, pcm.sampleRate);
    assert.deepEqual(source.buffer.samples, pcm.samples);
    assert.equal(source.destination, context.destination);
    voice.stop();
  }
});

test('Web Audio schedules finite voices, replaces prior playback, and cleans up', async () => {
  const { context, sources } = stubAudioContext();
  const first = playWithWebAudio(context, DEFAULT_PATCH);
  assert.equal(sources[0].startTime, context.currentTime + 0.005);
  assert.ok(sources[0].buffer.duration > 0 && sources[0].buffer.duration <= 5);
  const next = playWithWebAudio(context, DEFAULT_PATCH);
  await first.ended;
  assert.equal(sources[0].disconnected, true);
  assert.equal(sources[0].stops, 1);
  sources[1].onended();
  await next.ended;
  next.stop();
  assert.equal(sources[1].disconnected, true);
  assert.equal(sources[1].stops, 0);
});
