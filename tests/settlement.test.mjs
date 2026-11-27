import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import '../src/templates/settlement/settle-core.js';
import '../src/templates/settlement/strings.js';

const P = globalThis.PixSettle;

test('settlement: defaults and example describe a victory with independent data', () => {
  const { ok, config } = P.validateConfig();
  assert.equal(ok, true);
  assert.equal(config.outcome, 'victory');
  assert.equal(config.look, 'rite');
  assert.equal(P.gradeFromScore(config.score), 'S');
  assert.equal(config.stars, 3);
  assert.ok(config.stats.length && config.rewards.length);
  const example = JSON.parse(readFileSync(new URL('../src/templates/settlement/standalone/config.example.json', import.meta.url)));
  assert.deepEqual(example, config);
  config.rewards[0].count = 0;
  assert.equal(P.validateConfig().config.rewards[0].count, 250);
});

test('settlement: outcomes, grades, stars and score normalize', () => {
  for (const outcome of ['victory', 'defeat', 'clear']) {
    assert.equal(P.validateConfig({ outcome }).config.outcome, outcome);
  }
  const { config } = P.validateConfig({ outcome: 'other', grade: 'a', stars: 20, starMax: 10, score: -12.4 });
  assert.equal(config.outcome, 'victory');
  assert.equal(P.validateConfig({ look: 'unknown' }).config.look, 'rite');
  assert.equal(config.grade, 'A');
  assert.equal(config.starMax, 5);
  assert.equal(config.stars, 5);
  assert.equal(config.score, 0);
  assert.equal(P.validateConfig({ stars: -2 }).config.stars, 0);
});

test('settlement: switching from either success preset yields a failed result', () => {
  for (const outcome of ['victory', 'clear']) {
    const success = P.validateConfig(P.outcomePreset(outcome)).config;
    // Row property order can differ after a JSON import.
    success.rewards[0] = { count: 250, name: 'Gold', id: 'gold' };
    const { config: defeat } = P.validateConfig(P.applyOutcome(success, 'defeat'));
    assert.equal(defeat.outcome, 'defeat');
    assert.equal(defeat.subtitle, 'Chapter 3 · Failed');
    assert.equal(defeat.grade || P.gradeFromScore(defeat.score), 'D');
    assert.ok(defeat.stars < defeat.starMax);
    assert.ok(defeat.rewards.length < success.rewards.length);
    assert.ok(defeat.rewards.every(reward => reward.rarity !== 'SR'));
    assert.deepEqual(P.validateConfig(P.applyOutcome(defeat, outcome)).config, success);
  }
});

test('settlement: outcome switches preserve edits and update stock fields', () => {
  const victory = P.validateConfig().config;
  const edited = { ...victory, title: '暮雨关卡', stars: 1, look: 'honor' };
  const { config: defeat } = P.validateConfig(P.applyOutcome(edited, 'defeat'));
  assert.equal(defeat.title, '暮雨关卡');
  assert.equal(defeat.look, 'honor');
  assert.equal(defeat.stars, 1);
  assert.equal(defeat.subtitle, 'Chapter 3 · Failed');
  assert.equal(defeat.score, P.outcomePreset('defeat').score);
  assert.deepEqual(P.validateConfig(P.applyOutcome(defeat, 'victory')).config, edited);

  const custom = { ...defeat, grade: 'S', subtitle: 'A narrow escape', score: 1800, stats: [], rewards: [] };
  const { config: renamed } = P.validateConfig({ ...custom, title: 'Second attempt' });
  assert.equal(renamed.grade, 'S');
  assert.deepEqual(P.applyOutcome(renamed, 'clear'), { ...renamed, outcome: 'clear' });
});

test('settlement: a partial defeat config uses the defeat preset', () => {
  const { config } = P.validateConfig({ outcome: 'defeat' });
  assert.deepEqual(config, P.outcomePreset('defeat'));
  assert.equal(config.stars, 0);
  assert.equal(P.gradeFromScore(config.score), 'D');
});

test('settlement: legacy defeat correction updates stock fields independently', () => {
  const legacy = P.validateConfig({ outcome: 'defeat', subtitle: 'A narrow escape', grade: 'S', stars: 1 }).config;
  const { config } = P.validateConfig(P.applyOutcome({ ...legacy, outcome: 'victory' }, 'defeat'));
  assert.deepEqual(config, { ...P.outcomePreset('defeat'), subtitle: 'A narrow escape', grade: 'S', stars: 1 });
  assert.equal(P.applyOutcome({ ...legacy, subtitle: 'Chapter 3 · Clear' }, 'defeat').subtitle, 'Chapter 3 · Failed');
});

test('settlement: grade threshold boundaries and duration', () => {
  for (const [score, grade] of [[12000, 'S'], [11999, 'A'], [9000, 'A'], [8999, 'B'], [6000, 'B'], [5999, 'C'], [3000, 'C'], [2999, 'D'], [NaN, 'D']]) {
    assert.equal(P.gradeFromScore(score), grade);
  }
  assert.equal(P.formatDuration(252.9), '04:12');
  assert.equal(P.formatDuration(3662), '1:01:02');
  assert.equal(P.formatDuration(-1), '00:00');
});

test('settlement: imports discard unknown fields, cap data and reject invalid counts', () => {
  assert.equal(P.validateConfig(null).ok, false);
  assert.equal(P.validateConfig([]).ok, false);
  const imported = JSON.parse('{"look":"report","unknown":true,"__proto__":{"custom":1},"rewards":[{"name":"Gold","count":1e309},{"name":"Relic","count":99999999999,"rarity":" SR ","unknown":0},{"name":"None","count":-2},{"name":"Text","count":"3"}]}');
  imported.title = 'X'.repeat(100);
  imported.stats = Array.from({ length: 30 }, () => ({ label: 'L'.repeat(100), value: '0', unknown: 'dropped' }));
  const { config } = P.validateConfig(imported);
  assert.equal(config.look, 'report');
  assert.equal(config.title.length, 64);
  assert.equal(config.unknown, undefined);
  assert.equal(config.custom, undefined);
  assert.equal(config.stats.length, 12);
  assert.equal(config.stats[0].label.length, 40);
  assert.equal(config.stats[0].unknown, undefined);
  assert.deepEqual(config.rewards, [
    { id: 'reward-2', name: 'Relic', count: P.NUMBER_LIMIT, rarity: 'SR' },
    { id: 'reward-3', name: 'None', count: 0 },
  ]);
  assert.deepEqual(P.validateConfig(JSON.parse(JSON.stringify(config))).config, config);
});

test('settlement: standalone and site locale strings match in all five languages', async () => {
  function flatten(data, prefix = 'se.') {
    return Object.entries(data).flatMap(([key, value]) => typeof value === 'string'
      ? [[prefix + key, value]]
      : flatten(value, prefix + key + '.'));
  }
  for (const locale of ['en', 'zh', 'ja', 'ko', 'es']) {
    const source = readFileSync(new URL(`../src/lib/locales/${locale}.ts`, import.meta.url), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
    const { default: dictionary } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
    assert.deepEqual(Object.fromEntries(Object.entries(globalThis.PixStrings[locale]).filter(([key]) => key.startsWith("se."))), Object.fromEntries(flatten(dictionary.se)));
  }
});
