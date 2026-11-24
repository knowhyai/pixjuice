import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(name, imports = {}) {
  let source = readFileSync(new URL(`../src/lib/weapon-switch/${name}.ts`, import.meta.url), 'utf8');
  for (const [specifier, url] of Object.entries(imports)) {
    source = source.replaceAll(`from "${specifier}"`, `from "${url}"`);
  }
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return 'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64');
}

const deps = { './params': moduleUrl('params') };
const { DEFAULTS, STARTER, clampParams, editMineField, mineFieldBounds, paramsForMode } = await import(deps['./params']);
const { WeaponSwitchMachine, shouldAutoplay } = await import(moduleUrl('machine', deps));
const { buildShareUrl, decodeShare, encodeShare, initializeLabState, SHARE_PARAM } = await import(moduleUrl('share', deps));
const { exportJson, exportFilename } = await import(moduleUrl('export', deps));

const create = (edits = {}) => new WeaponSwitchMachine({ ...DEFAULTS, ...edits });
const switchEvents = machine => machine.log.filter(entry =>
  entry.outcome === 'executed' && entry.reason !== 'busyStarted');

test('W1: default idle switch runs full Holster and Draw before Fire is legal on slot 2', () => {
  const m = create();
  m.inputSwitch(2);
  assert.deepEqual(m.phase, { kind: 'holster', start: 0, end: 180, target: 2 });
  m.advance(179);
  assert.equal(m.phase.kind, 'holster');
  assert.equal(m.equipped, 1);
  m.advance(1);
  assert.deepEqual(m.phase, { kind: 'draw', start: 180, end: 400, target: 2 });
  m.advance(219);
  assert.equal(m.phase.kind, 'draw');
  m.advance(1);
  assert.deepEqual(m.phase, { kind: 'idle', start: 400 });
  assert.equal(m.equipped, 2);
  assert.equal(m.inputFire(), true);
});

test('W2: interrupt cancels Busy before the window and settles within one second', () => {
  const m = create({ busyPolicy: 'interrupt' });
  m.inputFire();
  m.advance(16);
  m.inputSwitch(2);
  assert.equal(m.phase.kind, 'holster');
  assert.equal(m.phase.start, 16);
  assert.equal(m.history.at(-1).end, 16);
  assert.equal(switchEvents(m)[0].reason, 'interrupted');
  m.advance(400);
  assert.equal(m.equipped, 2);
  assert.equal(m.phase.kind, 'idle');
});

test('W3: an instant input with Page default reaches the Busy endpoint with no Idle gap', () => {
  const m = new WeaponSwitchMachine(DEFAULTS);
  m.inputFire();
  m.inputSwitch(2);
  assert.deepEqual(m.pending, { slot: 2, expires: 650 });
  m.advance(499);
  assert.equal(m.phase.kind, 'busy');
  assert.equal(m.pending.slot, 2);
  m.advance(1);
  assert.deepEqual(m.phase, { kind: 'holster', start: 500, end: 680, target: 2 });
  assert.equal(m.history.at(-1).phase.kind, 'busy');
  assert.equal(m.history.at(-1).end, 500);
  assert.equal(switchEvents(m)[0].reason, 'atWindow');
  assert.equal(m.pending, null);
});

for (const [requestTime, switchTime, reason] of [[499, 500, 'atWindow'], [500, 500, 'fromIdle'], [501, 501, 'fromIdle']]) {
  test(`W3: Page default switch requested at ${requestTime} ms starts at ${switchTime} ms`, () => {
    const m = new WeaponSwitchMachine(DEFAULTS);
    m.inputFire();
    m.advance(requestTime);
    m.inputSwitch(2);
    assert.equal(m.pending?.slot, requestTime === 499 ? 2 : undefined);
    m.advance(switchTime - requestTime);
    assert.equal(m.phase.kind, 'holster');
    assert.deepEqual(switchEvents(m), [{ time: switchTime, slot: 2, outcome: 'executed', reason }]);
    m.advance(400);
    assert.equal(m.equipped, 2);
  });
}

test('earlier window opens at 200 ms regardless of step size', () => {
  const coarse = create({ cancelWindowStartMs: 200 });
  const fine = create({ cancelWindowStartMs: 200 });
  for (const m of [coarse, fine]) {
    m.inputFire();
    m.inputSwitch(2);
  }
  coarse.advance(603);
  for (let i = 0; i < 201; i++) fine.advance(3);
  assert.equal(switchEvents(coarse)[0].time, 200);
  assert.deepEqual(coarse.log, fine.log);
  assert.deepEqual(coarse.history, fine.history);
  assert.deepEqual(coarse.phase, fine.phase);
});

test('W4: TTL zero discards before the window but accepts a command inside it', () => {
  const m = create({ bufferTtlMs: 0, cancelWindowStartMs: 200, cancelWindowEndMs: 350 });
  m.inputFire();
  m.inputSwitch(2);
  assert.equal(m.pending, null);
  assert.equal(m.log.at(-1).outcome, 'discarded');
  assert.equal(m.log.at(-1).reason, 'noBuffer');
  m.advance(200);
  assert.equal(m.phase.kind, 'busy');
  assert.equal(m.equipped, 1);
  assert.equal(switchEvents(m).length, 0);
  m.inputSwitch(3);
  assert.equal(switchEvents(m)[0].reason, 'inWindow');
  assert.equal(m.phase.target, 3);
});

test('after the window closes during Busy there is no deferred switch', () => {
  const m = create({ cancelWindowStartMs: 200, cancelWindowEndMs: 250 });
  m.inputFire();
  m.advance(251);
  m.inputSwitch(3);
  assert.equal(m.log.at(-1).reason, 'afterWindow');
  m.advance(1000);
  assert.equal(m.pending, null);
  assert.equal(m.equipped, 1);
  assert.equal(switchEvents(m).length, 0);
});

test('W5: newer pending switch overwrites the original and refreshes the deadline', () => {
  const m = create();
  m.inputFire();
  m.inputSwitch(2);
  m.advance(150);
  m.inputSwitch(3);
  assert.deepEqual(m.pending, { slot: 3, expires: 800 });
  assert.equal(m.log.find(entry => entry.outcome === 'overwritten').slot, 2);
  m.advance(350);
  assert.deepEqual(switchEvents(m).map(entry => entry.slot), [3]);
  assert.equal(m.phase.target, 3);
});

test('TTL expiry is logged at the deadline and does not trigger a switch', () => {
  const m = create({ bufferTtlMs: 80 });
  m.inputFire();
  m.inputSwitch(2);
  m.advance(79);
  assert.deepEqual(m.pending, { slot: 2, expires: 80 });
  m.advance(1);
  assert.equal(m.phase.kind, 'busy');
  assert.equal(m.pending, null);
  assert.deepEqual(m.log.at(-1), { time: 80, slot: 2, outcome: 'expired', reason: 'ttl' });
  m.advance(1);
  assert.equal(m.pending, null);
  m.advance(600);
  assert.equal(m.equipped, 1);
  assert.equal(switchEvents(m).length, 0);
});

for (const opens of [79, 80, 81]) {
  test(`an 80 ms TTL with a window opening at ${opens} ms`, () => {
    const m = create({ bufferTtlMs: 80, cancelWindowStartMs: opens });
    m.inputFire();
    m.inputSwitch(2);
    m.advance(81);
    assert.equal(m.pending, null);
    const expected = opens <= 80
      ? { time: opens, slot: 2, outcome: 'executed', reason: 'atWindow' }
      : { time: 80, slot: 2, outcome: 'expired', reason: 'ttl' };
    assert.deepEqual(m.log.at(-1), expected);
    m.advance(900);
    assert.equal(m.equipped, opens <= 80 ? 2 : 1);
  });
}

test('reset clears clock, timeline, log, pending, and every cooldown while keeping the tune', () => {
  const mine = Object.freeze({ ...STARTER, cooldownMs: 3200, holsterMs: 150 });
  const m = new WeaponSwitchMachine(paramsForMode(mine, DEFAULTS, 'mine'));
  m.inputFire();
  m.inputSwitch(2);
  m.advance(50);
  assert.equal(m.pending.slot, 2);
  m.resetDemo();
  assert.equal(m.now, 0);
  assert.deepEqual(m.phase, { kind: 'idle', start: 0 });
  assert.equal(m.equipped, 1);
  assert.equal(m.pending, null);
  assert.deepEqual(m.history, []);
  assert.deepEqual(m.log, []);
  for (const slot of [1, 2, 3]) assert.deepEqual(m.cooldown(slot), { remaining: 0, duration: 0 });
  assert.equal(mine.holsterMs, 150);
  m.inputSwitch(2);
  assert.equal(m.phase.end, 150);
});

test('mode isolates preview data from stored tune and starter visibly differs', () => {
  const mine = Object.freeze({ ...STARTER, cooldownMs: 2400 });
  assert.deepEqual(paramsForMode(mine, DEFAULTS, 'default'), DEFAULTS);
  assert.deepEqual(paramsForMode(mine, DEFAULTS, 'mine'), mine);
  assert.notDeepEqual(STARTER, DEFAULTS);
  assert.equal(mine.cooldownMs, 2400);
});

const customMine = Object.freeze({
  ...STARTER, busyMs: 500, cancelWindowStartMs: 350, cancelWindowEndMs: 450,
  busyKind: 'reload', busyPolicy: 'interrupt', cooldownMs: 3200,
});

test('editing one My tune control from Page default preserves the other saved fields', () => {
  const defaultsBefore = { ...DEFAULTS };
  const state = initializeLabState({ token: null, storedMine: customMine });
  assert.equal(state.mode, 'default');
  assert.deepEqual(state.mine, customMine);
  const edited = editMineField(state.mine, 'drawMs', 310);
  assert.deepEqual(edited, { ...customMine, drawMs: 310 });
  assert.deepEqual(editMineField(state.mine, 'busyMs', 300), { ...customMine, busyMs: 450 });
  assert.deepEqual(state.mine, customMine);
  assert.deepEqual(DEFAULTS, defaultsBefore);
  assert.ok(Object.isFrozen(DEFAULTS));
});

test('Busy edits stop at the saved cancel window end', () => {
  assert.deepEqual(mineFieldBounds(customMine, 'busyMs'), { min: 450, max: 2000 });
  assert.deepEqual(editMineField(customMine, 'busyMs', 450), { ...customMine, busyMs: 450 });
  assert.deepEqual(editMineField(customMine, 'busyMs', 449), { ...customMine, busyMs: 450 });
});

test('cancel window end edits stay between the saved start and Busy', () => {
  assert.deepEqual(mineFieldBounds(customMine, 'cancelWindowEndMs'), { min: 350, max: 500 });
  assert.deepEqual(editMineField(customMine, 'cancelWindowEndMs', 350), { ...customMine, cancelWindowEndMs: 350 });
  assert.deepEqual(editMineField(customMine, 'cancelWindowEndMs', 349), { ...customMine, cancelWindowEndMs: 350 });
  assert.deepEqual(editMineField(customMine, 'cancelWindowEndMs', 501), { ...customMine, cancelWindowEndMs: 500 });
});

test('cancel window start edits stay between zero and the saved end', () => {
  assert.deepEqual(mineFieldBounds(customMine, 'cancelWindowStartMs'), { min: 0, max: 450 });
  assert.deepEqual(editMineField(customMine, 'cancelWindowStartMs', 450), { ...customMine, cancelWindowStartMs: 450 });
  assert.deepEqual(editMineField(customMine, 'cancelWindowStartMs', 451), { ...customMine, cancelWindowStartMs: 450 });
  assert.deepEqual(editMineField(customMine, 'cancelWindowStartMs', -1), { ...customMine, cancelWindowStartMs: 0 });
});

test('cooldown counts down during Holster, Draw, and time spent on another weapon', () => {
  const m = create({ busyPolicy: 'interrupt' });
  m.inputFire();
  m.advance(20);
  m.inputSwitch(2);
  assert.equal(m.cooldown(1).remaining, 980);
  m.advance(400);
  assert.equal(m.equipped, 2);
  assert.equal(m.cooldown(1).remaining, 580);
  assert.equal(m.cooldown(2).remaining, 0);
  m.advance(80);
  assert.equal(m.cooldown(1).remaining, 500);
  m.inputSwitch(1);
  m.advance(400);
  assert.equal(m.inputFire(), false);
  assert.equal(m.log.at(-1).reason, 'cooling');
  m.advance(100);
  assert.equal(m.inputFire(), true);
});

test('phase boundaries reject Fire and discard switch requests while a switch is in flight', () => {
  const m = create();
  m.inputSwitch(1);
  assert.equal(m.phase.kind, 'idle');
  assert.equal(m.log.at(-1).reason, 'sameSlot');
  m.inputSwitch(2);
  assert.equal(m.inputFire(), false);
  m.inputSwitch(3);
  assert.equal(m.log.at(-1).reason, 'switching');
  m.advance(180);
  assert.equal(m.inputFire(), false);
  m.inputSwitch(2);
  assert.equal(m.phase.target, 2);
  m.advance(220);
  assert.equal(m.inputFire(), true);
  assert.equal(m.inputFire(), false);
});

test('clamping orders the window within Busy and zero-duration phases settle immediately', () => {
  const p = clampParams({
    holsterMs: -20, drawMs: 1e9, busyMs: 200, cancelWindowStartMs: 9000,
    cancelWindowEndMs: 100, cooldownMs: 1e9, bufferTtlMs: -12,
  });
  assert.deepEqual(p, {
    holsterMs: 0, drawMs: 2000, busyMs: 200, cancelWindowStartMs: 100, cancelWindowEndMs: 100,
    cooldownMs: 5000, bufferTtlMs: 0, busyKind: 'fire', busyPolicy: 'buffer',
  });
  const m = create({ holsterMs: 0, drawMs: 0, busyMs: 0 });
  m.inputSwitch(2);
  assert.equal(m.phase.kind, 'idle');
  assert.equal(m.equipped, 2);
  assert.equal(m.inputFire(), true);
  assert.equal(m.phase.kind, 'idle');
  m.advance(10000);
  assert.equal(m.cooldown(2).remaining, 0);
});

test('editing settings preserves running durations and deadlines, and affects new actions', () => {
  const m = create();
  m.inputFire();
  m.advance(140);
  m.inputSwitch(2);
  m.configure({ ...DEFAULTS, busyMs: 0, bufferTtlMs: 0, holsterMs: 60, drawMs: 90 });
  m.advance(360);
  assert.equal(m.phase.start, 500);
  assert.equal(m.phase.end, 560);
  m.configure({ ...DEFAULTS, drawMs: 10 });
  m.advance(60);
  assert.equal(m.phase.end, 650);
});

test('JSON reports browser-local preview and active mode and values', () => {
  const p = paramsForMode(STARTER, DEFAULTS, 'default');
  assert.deepEqual(JSON.parse(exportJson(p, 'default')), {
    name: 'pixjuice-weapon-switch', version: 1, preview: 'browser-local', mode: 'default', params: DEFAULTS,
  });
  assert.equal(exportFilename('mine'), 'pixjuice-weapon-switch-mine.json');
});

test('share URL restores clamped numbers and mode and uses a lab-specific parameter', () => {
  for (const [input, mode] of [[{ ...STARTER, busyKind: 'reload', busyPolicy: 'interrupt', cooldownMs: 7000 }, 'mine'], [DEFAULTS, 'default']]) {
    const href = buildShareUrl('https://example.test/weapon-switch/?keep=1#log', input, mode);
    const url = new URL(href);
    assert.equal(url.origin, 'https://example.test');
    assert.equal(url.pathname, '/weapon-switch/');
    assert.equal(url.searchParams.get('keep'), '1');
    assert.equal(url.hash, '');
    assert.equal(url.searchParams.get('swap'), encodeShare(input, mode));
    assert.deepEqual(decodeShare(url.searchParams.get(SHARE_PARAM)), { params: clampParams(input), mode });
  }
  assert.equal(decodeShare('garbage'), null);
  assert.equal(decodeShare(encodeShare(DEFAULTS, 'default').replace(/^1/, '2')), null);
});

for (const mode of ['default', 'mine']) {
  test(`initializing from a ${mode}-mode share restores My tune independently of preview and export`, () => {
    const defaultsBefore = { ...DEFAULTS };
    const url = new URL(buildShareUrl('https://example.test/weapon-switch/', customMine, mode));
    const state = initializeLabState({ token: url.searchParams.get(SHARE_PARAM), storedMine: STARTER });
    assert.deepEqual(state, { mine: customMine, mode });
    const active = paramsForMode(state.mine, DEFAULTS, state.mode);
    const expected = mode === 'default' ? defaultsBefore : customMine;
    assert.deepEqual(active, expected);
    assert.deepEqual(JSON.parse(exportJson(active, state.mode)).params, expected);
    assert.deepEqual(DEFAULTS, defaultsBefore);
  });
}

test('initializing from a legacy v1 default share preserves its original 400 ms TTL in My tune', () => {
  const state = initializeLabState({ token: '1.0.50.64.dw.0.0.b4.dw.dw.rs', storedMine: customMine });
  assert.deepEqual(state, { mine: { ...DEFAULTS, bufferTtlMs: 400 }, mode: 'default' });
  assert.deepEqual(paramsForMode(state.mine, DEFAULTS, state.mode), DEFAULTS);
});

test('initializing with an invalid token validates stored fields and falls back to the starter tune', () => {
  assert.deepEqual(initializeLabState({
    token: 'invalid', storedMine: { drawMs: 600, busyPolicy: 'invalid', cooldownMs: '123' },
  }), { mine: { ...STARTER, drawMs: 600 }, mode: 'default' });
  assert.deepEqual(initializeLabState({ token: 2, storedMine: null }), { mine: STARTER, mode: 'default' });
});

test('Fire and Switch require a user gesture and the demo remains idle without input', () => {
  assert.equal(shouldAutoplay(), false);
  const m = create();
  m.advance(10000);
  assert.equal(m.phase.kind, 'idle');
  assert.equal(m.equipped, 1);
  assert.deepEqual(m.log, []);
});
