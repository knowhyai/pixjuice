import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(name, imports = {}) {
  let source = readFileSync(new URL(`../src/lib/camera-shake/${name}.ts`, import.meta.url), 'utf8');
  for (const [specifier, url] of Object.entries(imports)) {
    source = source.replaceAll(`from "${specifier}"`, `from "${url}"`);
  }
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return 'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64');
}

const paramsUrl = moduleUrl('params');
const { DEFAULTS, STARTER, LIMITS, PARAM_KEYS, clampParams, paramsForMode } = await import(paramsUrl);
const imports = { './params': paramsUrl };
const { REST, ShakeComparison, sampleShake, sampleTrace, motionIsReduced, shouldAutoplay } =
  await import(moduleUrl('motion', imports));
const { encodeShare, decodeShare, buildShareUrl, SHARE_PARAM } = await import(moduleUrl('share', imports));
const { patchJson, patchFilename } = await import(moduleUrl('export', imports));

test('defaults are modest and within bounds, and the first comparison differs', () => {
  assert.deepEqual(clampParams(DEFAULTS), DEFAULTS);
  assert.ok(DEFAULTS.positionAmplitude <= 16);
  assert.ok(DEFAULTS.rotationAmplitude <= 6);
  assert.ok(DEFAULTS.duration <= 0.8);
  assert.notDeepEqual(STARTER, DEFAULTS);
  assert.notDeepEqual(sampleShake(STARTER, 0.1), sampleShake(DEFAULTS, 0.1));
  assert.equal(sampleShake(DEFAULTS, DEFAULTS.duration).active, false);
});

test('each parameter clamps at both limits and extreme inputs finish at rest', () => {
  for (const value of [-1e100, 1e100]) {
    const input = Object.fromEntries(PARAM_KEYS.map(key => [key, value]));
    const bounded = clampParams(input);
    for (const key of PARAM_KEYS) assert.equal(bounded[key], LIMITS[key][value < 0 ? 0 : 1]);
    assert.deepEqual(sampleShake(input, bounded.duration), REST);
  }
  assert.deepEqual(clampParams({ duration: NaN }), DEFAULTS);
});

test('comparison begins at rest, only moves on Trigger, and stops at each deadline', () => {
  const comparison = new ShakeComparison();
  assert.equal(shouldAutoplay(), false);
  assert.deepEqual(comparison.sample(10), [REST, REST]);
  comparison.trigger(10, DEFAULTS, STARTER);
  assert.ok(comparison.sample(10.01).every(pose => pose.active && pose.x !== 0));
  const [defaults, mine] = comparison.sample(10 + DEFAULTS.duration);
  assert.deepEqual(defaults, REST);
  assert.equal(mine.active, true);
  assert.deepEqual(comparison.sample(10 + STARTER.duration), [REST, REST]);
  assert.deepEqual(comparison.sample(11), [REST, REST]);
});

test('retrigger restarts the event with a snapshot of each patch', () => {
  const comparison = new ShakeComparison();
  const tune = { ...STARTER };
  comparison.trigger(10, DEFAULTS, tune);
  comparison.trigger(10.3, DEFAULTS, tune);
  tune.positionAmplitude = 0;
  assert.deepEqual(comparison.sample(10.3), [sampleShake(DEFAULTS, 0), sampleShake(STARTER, 0)]);
});

test('higher decay weakens the envelope and can stop before the duration cap', () => {
  const patch = { ...DEFAULTS, duration: 2 };
  const low = sampleShake({ ...patch, decay: 0.5 }, 0.2);
  const high = sampleShake({ ...patch, decay: 8 }, 0.2);
  assert.ok(high.envelope < low.envelope);
  assert.deepEqual(sampleShake({ ...patch, decay: 8 }, 0.5), REST);
});

test('higher frequency produces more zero crossings with the same seed', () => {
  function crossings(frequency) {
    const params = { ...DEFAULTS, frequency, decay: 0.5, duration: 2 };
    const xs = Array.from({ length: 240 }, (_, n) => sampleShake(params, n / 240, 31).x);
    return xs.slice(1).filter((x, i) => x * xs[i] < 0).length;
  }
  assert.ok(crossings(30) > crossings(5));
  assert.deepEqual(sampleTrace(DEFAULTS, 0.4).at(-1), REST);
});

test('default mode and reset preserve the stored mine tune', () => {
  const tune = Object.freeze({ ...STARTER, frequency: 26.5 });
  const comparison = new ShakeComparison();
  assert.deepEqual(paramsForMode(tune, DEFAULTS, 'default'), DEFAULTS);
  assert.deepEqual(paramsForMode(tune, DEFAULTS, 'mine'), tune);
  comparison.trigger(0, DEFAULTS, tune);
  comparison.reset();
  assert.deepEqual(comparison.sample(0.05), [REST, REST]);
  assert.deepEqual(tune, { ...STARTER, frequency: 26.5 });
});

test('JSON identifies the browser-local preview and exports the active five parameters', () => {
  const tune = { ...STARTER, reducedMotion: true };
  for (const [mode, params] of [['default', DEFAULTS], ['mine', STARTER]]) {
    assert.deepEqual(JSON.parse(patchJson(mode, paramsForMode(tune, DEFAULTS, mode))), {
      name: 'pixjuice-camera-shake', version: 1, preview: 'browser-local', mode, params,
    });
    assert.equal(patchFilename(mode), `pixjuice-camera-shake-${mode}.json`);
  }
});

test('share restores canonical mine values and mode, excluding local motion preference', () => {
  const tune = { ...STARTER, decay: 99, duration: 0.376, reducedMotion: true };
  for (const mode of ['default', 'mine']) {
    const token = encodeShare(mode, tune);
    assert.deepEqual(decodeShare(token), { mode, tune: clampParams(tune) });
    const url = new URL(buildShareUrl('https://example.test/camera-shake/?keep=1', mode, tune));
    assert.equal(url.origin, 'https://example.test');
    assert.equal(url.pathname, '/camera-shake/');
    assert.equal(url.searchParams.get('keep'), '1');
    assert.equal(url.searchParams.get(SHARE_PARAM), token);
    assert.equal(url.searchParams.has('tune'), false);
  }
  for (const invalid of [null, '2_m_10_3_18_3_0.4', '1_m_10_3_18_3_NaN', '1_m_10_3_18_3_0.4_true']) {
    assert.equal(decodeShare(invalid), null);
  }
});

test('reduced motion overrides OS when forced and cancels a requested event', () => {
  assert.equal(motionIsReduced('auto', true), true);
  assert.equal(motionIsReduced('auto', false), false);
  assert.equal(motionIsReduced('reduce', false), true);
  assert.equal(motionIsReduced('allow', true), false);
  assert.deepEqual(sampleShake(DEFAULTS, 0.05, 0, true), REST);
  const comparison = new ShakeComparison();
  comparison.trigger(0, DEFAULTS, STARTER);
  assert.deepEqual(comparison.sample(0.05, true), [REST, REST]);
  assert.deepEqual(comparison.sample(0.06), [REST, REST]);
});
