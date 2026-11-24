import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(name, imports = {}) {
  let source = readFileSync(new URL(`../src/lib/typewriter/${name}.ts`, import.meta.url), 'utf8');
  for (const [specifier, url] of Object.entries(imports)) {
    source = source.replaceAll(`from "${specifier}"`, `from "${url}"`);
  }
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return 'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64');
}

const paramsUrl = moduleUrl('params');
const graphemesUrl = moduleUrl('graphemes');
const imports = { './params': paramsUrl, './graphemes': graphemesUrl };
const shareUrl = moduleUrl('share', imports);
const { DEFAULT, STARTER, paramsForMode, updateParam } = await import(paramsUrl);
const { checkText, INPUT_CAPS, visibleText } = await import(graphemesUrl);
const { PUNCTUATION, punctuation, revealTimes, visibleIndex } = await import(moduleUrl('timing'));
const { IDLE, playback, previewElapsed, motionIsReduced } = await import(moduleUrl('playback'));
const { buildShareUrl, decodeShare, readShareUrl, resolveIncomingShare, parseConfiguration, serialize, SHARE_CAPS, SHARE_PARAM } =
  await import(shareUrl);
const { exportJson } = await import(moduleUrl('export', { ...imports, './share': shareUrl }));

const base = 'http://127.0.0.1:4199/typewriter/';
const mixed = ['A', '你', 'e\u0301', '👩🏽‍🚀', '🇪🇸', '文'];
const tune = text => ({ ...STARTER, text });
function clusters(text) {
  const checked = checkText(text);
  assert.equal(checked.kind, 'complete');
  return checked.clusters;
}

test('Start label meets WCAG 2 contrast in both themes', () => {
  const labCss = readFileSync(new URL('../src/pages/typewriter.css', import.meta.url), 'utf8');
  const themeCss = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const light = ':root[data-theme="light"]';
  const primary = '.typewriter-lab .tw-primary';
  const rule = (css, selector) => css.split(selector).slice(1)
    .map(rest => rest.match(/^\s*\{([^}]*)\}/)?.[1]).find(body => body !== undefined);
  const value = (body, property) => body?.match(new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`))?.[1].trim();
  const luminance = hex => {
    assert.match(hex, /^#(?:[\da-f]{3}|[\da-f]{6})$/i);
    const digits = hex.slice(1);
    const channels = digits.length === 3 ? [...digits].map(digit => digit.repeat(2)) : digits.match(/../g);
    const linear = channels.map(channel => {
      const srgb = parseInt(channel, 16) / 255;
      return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const defaultRule = rule(labCss, primary);
  for (const theme of ['dark', 'light']) {
    const override = theme === 'light' ? rule(labCss, `${light} ${primary}`) : undefined;
    const accent = value(rule(themeCss, theme === 'light' ? light : ':root'), '--acc');
    const background = value(override, 'background') ?? value(defaultRule, 'background');
    const foreground = value(override, 'color') ?? value(defaultRule, 'color');
    const colors = [background === 'var(--acc)' ? accent : background, foreground].map(luminance);
    const ratio = (Math.max(...colors) + 0.05) / (Math.min(...colors) + 0.05);
    assert.ok(ratio >= 4.5, `${theme} Start contrast is ${ratio.toFixed(2)}:1`);
  }
});

test('mixed text reveals only whole extended grapheme clusters', () => {
  const result = clusters(mixed.join(''));
  assert.deepEqual(result, mixed);
  for (let n = 0; n <= mixed.length; n++) {
    assert.equal(visibleText(result, n), mixed.slice(0, n).join(''));
  }
});

test('punctuation sets distinguish short and sentence pauses', () => {
  assert.equal(PUNCTUATION.short, ',;:，；：、');
  assert.equal(PUNCTUATION.sentence, '.?!…。？！');
  for (const mark of PUNCTUATION.short) assert.equal(punctuation(mark), 'short');
  for (const mark of PUNCTUATION.sentence) assert.equal(punctuation(mark), 'sentence');
  for (const part of [...mixed, ' ', '\n', '', '?!']) assert.equal(punctuation(part), 'none');
});

test('speed and punctuation set the deadlines, including the first base interval', () => {
  const text = clusters('A，B。C');
  const params = { speed: 10, shortPause: 120, sentencePause: 300 };
  const slow = revealTimes(text, params);
  const fast = revealTimes(text, { ...params, speed: 20 });
  assert.deepEqual(slow, [100, 200, 420, 520, 920]);
  for (const [ms, count] of [[0, 0], [100, 1], [419, 2], [420, 3], [919, 4], [920, 5]]) {
    assert.equal(visibleIndex(slow, ms), count);
  }
  assert.ok(visibleIndex(fast, 400) > visibleIndex(slow, 400));
});

test('pause freezes and resume preserves remaining punctuation delay; skip, reset and replay work', () => {
  const mine = Object.freeze({ text: 'A,B', params: Object.freeze({ speed: 10, shortPause: 120, sentencePause: 300 }) });
  const times = revealTimes(clusters(mine.text), mine.params);
  const duration = times.at(-1);
  let state = IDLE;
  const act = (action, now) => { state = playback(state, action, now, duration, false); };
  const visible = now => visibleIndex(times, previewElapsed(state, now, false));
  assert.equal(visible(2000), 0);
  act('start', 2000);
  assert.equal(visible(2000), 0);
  act('pause', 2250);
  assert.equal(visible(7000), 2);
  act('resume', 7000);
  assert.equal(visible(7169), 2);
  assert.equal(visible(7170), 3);
  act('tick', 7170);
  assert.equal(state.kind, 'done');
  act('reset', 7200);
  assert.equal(visible(7200), 0);
  act('start', 7300);
  assert.equal(visible(7400), 1);
  act('skip', 7400);
  assert.equal(visible(7400), 3);
  act('reset', 7500);
  assert.equal(state.kind, 'idle');
  assert.equal(visible(8500), 0);
  assert.deepEqual(mine, { text: 'A,B', params: { speed: 10, shortPause: 120, sentencePause: 300 } });
});

test('reduced motion shows the full dialogue without starting or resuming playback', () => {
  assert.equal(motionIsReduced('auto', true), true);
  assert.equal(motionIsReduced('auto', false), false);
  assert.equal(motionIsReduced('on', false), true);
  assert.equal(motionIsReduced('off', true), false);
  const times = revealTimes(mixed, DEFAULT.params);
  const duration = times.at(-1);
  for (const action of ['start', 'resume', 'reset']) {
    const state = playback(IDLE, action, 100, duration, true);
    assert.equal(state.kind, 'idle');
    assert.equal(visibleIndex(times, previewElapsed(state, 100, true)), mixed.length);
  }
  const playing = playback(IDLE, 'start', 100, duration, false);
  assert.equal(playback(playing, 'tick', 140, duration, true).kind, 'idle');
});

test('editing one slider from default retains the other mine fields and mine dialogue', () => {
  const mine = tune('自己的对话');
  assert.equal(paramsForMode(mine, 'default'), DEFAULT);
  assert.equal(paramsForMode(mine, 'mine'), mine);
  const edited = updateParam(mine, 'speed', 200);
  assert.deepEqual(edited, { ...mine, params: { ...mine.params, speed: 80 } });
  assert.equal(paramsForMode(edited, 'default'), DEFAULT);
  assert.notEqual(mine.params.speed, edited.params.speed);
});

test('share round-trips mode and complete mine, without serializing reduced motion', () => {
  const config = { mode: 'default', mine: tune(mixed.join('')), reducedMotion: 'on' };
  const url = new URL(buildShareUrl(base + '?shake=old#preview', config));
  assert.deepEqual([...url.searchParams.keys()], ['typewriter']);
  assert.equal(url.hash, '');
  assert.deepEqual(readShareUrl(url), { mode: 'default', mine: config.mine });
  assert.deepEqual(parseConfiguration(serialize(config)), { mode: 'default', mine: config.mine });
  const token = url.searchParams.get(SHARE_PARAM);
  for (const cut of [1, 2, 4, Math.floor(token.length / 2)]) {
    assert.equal(decodeShare(token.slice(0, -cut)), null);
  }
  url.searchParams.append(SHARE_PARAM, token);
  assert.equal(readShareUrl(url), null);
});

test('legacy CRLF and CR dialogue becomes LF in preview, JSON, storage and new shares', () => {
  for (const ending of ['\r\n', '\r']) {
    const text = 'First\nSecond';
    const canonical = { mode: 'mine', mine: tune(text) };
    const legacy = serialize(canonical).replace('\\n', JSON.stringify(ending).slice(1, -1));
    const token = Buffer.from(legacy).toString('base64url');
    assert.deepEqual(parseConfiguration(legacy), canonical);
    const restored = decodeShare(token);
    assert.deepEqual(restored, canonical);
    const segmented = clusters(restored.mine.text);
    assert.equal(visibleText(segmented, segmented.length), text);
    assert.equal(JSON.parse(exportJson(restored, base)).text, text);
    assert.equal(JSON.parse(serialize(restored)).mine.text, text);
    assert.equal(buildShareUrl(base, restored), buildShareUrl(base, canonical));
    assert.equal(decodeShare(token.slice(0, -1)), null);
    assert.equal(decodeShare(Buffer.from(legacy + ' ').toString('base64url')), null);
  }
});

test('failed incoming shares keep their notice and clear the stale token before creating a current link', () => {
  const original = new URL(buildShareUrl(base, { mode: 'mine', mine: tune('Original') }));
  const truncated = original.searchParams.get(SHARE_PARAM).slice(0, -2);
  for (const token of [truncated, '', 'invalid!', 'a'.repeat(SHARE_CAPS.tokenChars + 1)]) {
    const location = new URL(base + '?keep=1#preview');
    location.searchParams.append(SHARE_PARAM, token);
    const incoming = resolveIncomingShare(location);
    assert.equal(incoming.config, null);
    assert.equal(incoming.notice, 'invalidShare');
    assert.equal(incoming.cleanedUrl.href, base + '?keep=1#preview');
    assert.equal(resolveIncomingShare(incoming.cleanedUrl).notice, null);

    const current = { mode: 'mine', mine: tune('Saved dialogue') };
    const link = buildShareUrl(incoming.cleanedUrl.href, current);
    assert.equal(link, buildShareUrl(base, current));
    assert.deepEqual(resolveIncomingShare(new URL(link)), { config: current, notice: null, cleanedUrl: null });
    assert.equal(incoming.notice, 'invalidShare');

    const oversized = { mode: 'mine', mine: tune('你'.repeat(INPUT_CAPS.graphemes)) };
    assert.equal(buildShareUrl(incoming.cleanedUrl.href, oversized), null);
    assert.equal(JSON.parse(exportJson(oversized, incoming.cleanedUrl.href)).text, oversized.mine.text);
  }
});

test('HTML-looking dialogue stays literal in the visible prefix, share and JSON', () => {
  const text = '<script>alert(1)</script><img src=x onerror=alert(1)>&amp;';
  const config = { mode: 'mine', mine: tune(text) };
  const segmented = clusters(text);
  assert.equal(visibleText(segmented, 8), '<script>');
  assert.equal(visibleText(segmented, segmented.length), text);
  assert.deepEqual(readShareUrl(new URL(buildShareUrl(base, config))), config);
  const exported = JSON.parse(exportJson(config, base));
  assert.deepEqual(exported, {
    name: 'pixjuice-typewriter', version: 1, preview: 'browser-local',
    mode: 'mine', params: config.mine.params, text, inputCaps: INPUT_CAPS, shareCaps: SHARE_CAPS,
    graphemeCount: segmented.length, shareWouldBeComplete: true,
  });
  const defaults = JSON.parse(exportJson({ ...config, mode: 'default' }, base));
  assert.equal(defaults.text, DEFAULT.text);
  assert.deepEqual(defaults.params, DEFAULT.params);
});

test('input rejects excess graphemes and excess UTF-16 units without returning a partial string', () => {
  assert.equal(checkText('a'.repeat(INPUT_CAPS.graphemes)).kind, 'complete');
  assert.deepEqual(checkText('a'.repeat(INPUT_CAPS.graphemes + 1)), { kind: 'incomplete' });
  const exactUnits = 'e' + '\u0301'.repeat(INPUT_CAPS.utf16Units - 1);
  assert.equal(clusters(exactUnits).length, 1);
  assert.deepEqual(checkText(exactUnits + '\u0301'), { kind: 'incomplete' });
  assert.equal(parseConfiguration(serialize({ mode: 'mine', mine: tune(exactUnits + '\u0301') })), null);
});

test('overlong shares fail whole while accepted text remains available in JSON', () => {
  const text = '你'.repeat(INPUT_CAPS.graphemes);
  const config = { mode: 'mine', mine: tune(text) };
  const oversizedToken = Buffer.from(serialize(config)).toString('base64url');
  assert.ok(oversizedToken.length > SHARE_CAPS.tokenChars);
  assert.equal(decodeShare(oversizedToken), null);
  assert.equal(buildShareUrl(base, config), null);
  const exported = JSON.parse(exportJson(config, base));
  assert.equal(exported.text, text);
  assert.equal(exported.shareWouldBeComplete, false);
  const short = { ...config, mine: tune('short') };
  const longBase = base + 'p'.repeat(SHARE_CAPS.urlChars);
  const valid = new URL(buildShareUrl(base, short));
  assert.equal(buildShareUrl(longBase, short), null);
  assert.equal(readShareUrl(new URL(longBase + valid.search)), null);
});

test('malformed stored or shared configurations are rejected at the boundary', () => {
  const malformed = [
    null, { version: 2, mode: 'mine', mine: STARTER }, { version: 1, mode: [], mine: STARTER },
    { version: 1, mode: 'mine', mine: { ...STARTER, text: { html: '<b>' } } },
    { version: 1, mode: 'mine', mine: { ...STARTER, params: { ...STARTER.params, speed: 999 } } },
  ];
  for (const value of malformed) {
    const serialized = JSON.stringify(value);
    assert.equal(parseConfiguration(serialized), null);
    assert.equal(decodeShare(Buffer.from(serialized).toString('base64url')), null);
  }
});
