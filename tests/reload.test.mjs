import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(name, imports = {}) {
  let source = readFileSync(new URL(`../src/lib/reload/${name}.ts`, import.meta.url), 'utf8');
  for (const [specifier, url] of Object.entries(imports)) {
    source = source.replaceAll(`from "${specifier}"`, `from "${url}"`);
  }
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return 'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64');
}

const paramsUrl = moduleUrl('params');
const { DEFAULTS, STARTER, clampParams, editLabField, mineFieldBounds, paramsForMode } = await import(paramsUrl);
const imports = { './params': paramsUrl };
const { createReloadMachine, shouldAutoplay } = await import(moduleUrl('machine'));
const { buildShareUrl, decodeShare, encodeShare, initializeLabState, SHARE_PARAM } =
  await import(moduleUrl('share', imports));
const { exportJson } = await import(moduleUrl('export', imports));

function ammo(machine) {
  const { mag, reserve, chamber } = machine.snapshot();
  return [mag, reserve, chamber];
}

function lastEvent(machine) {
  return machine.snapshot().log.at(-1).event;
}

test('demo starts idle and mag-out returns unchambered leftovers exactly once', () => {
  const machine = createReloadMachine(DEFAULTS);
  assert.equal(shouldAutoplay(), false);
  assert.equal(machine.phase, 'idle');
  assert.deepEqual(ammo(machine), [3, 16, 0]);
  machine.input('reload');
  assert.equal(machine.snapshot().startedWithMag, 3);
  machine.advance(249);
  assert.deepEqual(ammo(machine), [2, 16, 1]);
  assert.equal(machine.snapshot().hasMagazine, true);
  machine.advance(1);
  assert.deepEqual(ammo(machine), [0, 18, 1]);
  assert.equal(machine.snapshot().hasMagazine, false);
  assert.equal(machine.phase, 'waitCommit');
  assert.equal(lastEvent(machine), 'removed');
  machine.advance(100);
  assert.deepEqual(ammo(machine), [0, 18, 1]);
});

test('commit at exact equality and finish at exact equality each mutate at most once', () => {
  const machine = createReloadMachine(DEFAULTS);
  machine.input('reload');
  machine.advance(549);
  assert.equal(machine.snapshot().committed, false);
  machine.advance(1);
  assert.equal(machine.snapshot().committed, true);
  assert.equal(machine.snapshot().hasMagazine, true);
  assert.equal(machine.phase, 'finish');
  assert.deepEqual(ammo(machine), [8, 10, 1]);
  machine.advance(1);
  assert.deepEqual(ammo(machine), [8, 10, 1]);
  machine.advance(249);
  assert.equal(machine.phase, 'idle');
  assert.deepEqual(ammo(machine), [8, 10, 1]);
  assert.equal(lastEvent(machine), 'completed');
  machine.advance(1000);
  assert.equal(machine.snapshot().timeMs, 800);
});

test('one large advance records each crossed checkpoint at its own time and respects available reserve', () => {
  const machine = createReloadMachine({ ...DEFAULTS, startMag: 0, startReserve: 2 });
  machine.input('reload');
  machine.advance(900);
  assert.deepEqual(ammo(machine), [2, 0, 0]);
  assert.deepEqual(machine.snapshot().log.slice(-3).map(({ event, timeMs }) => [event, timeMs]), [
    ['removed', 250], ['committed', 550], ['completed', 800],
  ]);
});

for (const [time, event, expected, hasMagazine] of [
  [249, 'beforeOut', [3, 16, 0], true],
  [250, 'beforeCommit', [0, 18, 1], false],
  [251, 'beforeCommit', [0, 18, 1], false],
  [549, 'beforeCommit', [0, 18, 1], false],
  [550, 'afterCommit', [8, 10, 1], true],
  [551, 'afterCommit', [8, 10, 1], true],
]) {
  test(`cancel at ${time} ms applies ${event}`, () => {
    const machine = createReloadMachine(DEFAULTS);
    machine.input('reload');
    machine.advance(time);
    machine.input('cancel');
    assert.equal(machine.phase, 'idle');
    assert.equal(lastEvent(machine), event);
    assert.deepEqual(ammo(machine), expected);
    assert.equal(machine.snapshot().hasMagazine, hasMagazine);
    assert.equal(machine.snapshot().committed, time >= DEFAULTS.commitMs);
    machine.advance(1000);
    assert.equal(machine.snapshot().timeMs, time);
    assert.deepEqual(ammo(machine), expected);
  });
}

test('after completion, a rejected Reload stays at 800 ms and a successful Reload starts at 0 ms', () => {
  const machine = createReloadMachine(DEFAULTS);
  machine.input('reload');
  machine.advance(800);
  machine.input('reload');
  assert.equal(machine.timeMs, 800);
  assert.deepEqual(machine.snapshot().log.slice(-3).map(({ event, timeMs }) => [event, timeMs]), [
    ['completed', 800], ['reload', 800], ['full', 800],
  ]);

  machine.input('fire');
  machine.input('reload');
  assert.equal(machine.timeMs, 0);
  assert.deepEqual(machine.snapshot().log.slice(-2).map(({ event, timeMs }) => [event, timeMs]), [
    ['reload', 0], ['started', 0],
  ]);
});

test('after cancellation, a successful Reload records its receipt and start at 0 ms', () => {
  const machine = createReloadMachine(DEFAULTS);
  machine.input('reload');
  machine.advance(450);
  machine.input('cancel');
  assert.equal(machine.timeMs, 450);
  machine.input('reload');
  assert.deepEqual(machine.snapshot().log.slice(-3).map(({ event, timeMs }) => [event, timeMs]), [
    ['beforeCommit', 450], ['reload', 0], ['started', 0],
  ]);
});

test('repeat Reload is discarded without restarting the playhead', () => {
  const machine = createReloadMachine(DEFAULTS);
  machine.input('reload');
  machine.advance(450);
  machine.input('reload');
  assert.deepEqual(machine.snapshot().log.slice(-2).map(({ event, timeMs }) => [event, timeMs]), [
    ['reload', 450], ['busy', 450],
  ]);
  assert.equal(machine.snapshot().timeMs, 450);
  machine.advance(100);
  assert.equal(lastEvent(machine), 'committed');
});

for (const [patch, reason, expected] of [
  [{ startReserve: 0 }, 'noReserve', [3, 0, 0]],
  [{ startMag: 8 }, 'full', [8, 16, 0]],
]) {
  test(`Reload rejects ${reason} without altering ammo`, () => {
    const machine = createReloadMachine({ ...DEFAULTS, ...patch });
    machine.input('reload');
    assert.equal(lastEvent(machine), reason);
    assert.equal(machine.phase, 'idle');
    assert.deepEqual(ammo(machine), expected);
  });
}

test('Fire cancels first and uses the magazine when present', () => {
  for (const [time, event, expected] of [
    [249, 'beforeOut', [2, 16, 0]],
    [550, 'afterCommit', [7, 10, 1]],
  ]) {
    const machine = createReloadMachine(DEFAULTS);
    machine.input('reload');
    machine.advance(time);
    machine.input('fire');
    assert.deepEqual(ammo(machine), expected);
    assert.deepEqual(machine.snapshot().log.slice(-3).map(({ event }) => event), ['fire', event, 'firedMag']);
    assert.equal(machine.phase, 'idle');
  }
});

test('with the closed-bolt model assumption, partial interrupts leave one fireable chamber round', () => {
  for (const cancelFirst of [true, false]) {
    const machine = createReloadMachine(DEFAULTS);
    machine.input('reload');
    machine.advance(250);
    if (cancelFirst) machine.input('cancel');
    machine.input('fire');
    assert.equal(machine.phase, 'idle');
    assert.equal(lastEvent(machine), 'firedChamber');
    assert.deepEqual(ammo(machine), [0, 18, 0]);
    machine.input('fire');
    assert.equal(lastEvent(machine), 'empty');
  }
});

test('an interrupted empty-start reload creates no chamber round', () => {
  const machine = createReloadMachine({ ...DEFAULTS, startMag: 0 });
  machine.input('reload');
  machine.advance(250);
  machine.input('fire');
  assert.equal(lastEvent(machine), 'empty');
  assert.deepEqual(ammo(machine), [0, 16, 0]);
});

test('with chamber disabled every checkpoint leaves the chamber empty', () => {
  const machine = createReloadMachine({ ...DEFAULTS, keepChamberRound: false });
  machine.input('reload');
  assert.deepEqual(ammo(machine), [3, 16, 0]);
  machine.advance(250);
  assert.deepEqual(ammo(machine), [0, 19, 0]);
  machine.input('fire');
  assert.equal(lastEvent(machine), 'empty');
  machine.input('reload');
  machine.advance(800);
  assert.deepEqual(ammo(machine), [8, 11, 0]);
  assert.ok(machine.snapshot().log.every(entry => entry.chamber === 0));
});

test('cancelling a later reload preserves an existing chamber without duplicating it', () => {
  const machine = createReloadMachine(DEFAULTS);
  machine.input('reload');
  machine.advance(800);
  machine.input('fire');
  machine.input('reload');
  assert.deepEqual(ammo(machine), [7, 10, 1]);
  machine.input('cancel');
  assert.deepEqual(ammo(machine), [7, 10, 1]);
});

test('reset clears machine history and restores active starting ammo while preserving lab state', () => {
  const state = initializeLabState({ token: encodeShare({ ...STARTER, startMag: 5 }, 'mine') });
  const machine = createReloadMachine(paramsForMode(state.mine, DEFAULTS, state.mode));
  machine.input('reload');
  machine.advance(STARTER.commitMs);
  machine.resetDemo();
  const snapshot = machine.snapshot();
  assert.equal(snapshot.phase, 'idle');
  assert.equal(snapshot.timeMs, 0);
  assert.equal(snapshot.committed, false);
  assert.deepEqual(snapshot.log, []);
  assert.deepEqual(ammo(machine), [5, 16, 0]);
  assert.equal(state.mode, 'mine');
  assert.deepEqual(state.mine, { ...STARTER, startMag: 5 });
});

test('editing from default patches saved mine and selects mine', () => {
  const state = initializeLabState({ storedMine: { ...STARTER, startReserve: 50 } });
  assert.equal(state.mode, 'default');
  assert.equal(paramsForMode(state.mine, DEFAULTS, state.mode), DEFAULTS);
  const first = editLabField(state, 'startMag', 4);
  const second = editLabField(first, 'keepChamberRound', false);
  assert.equal(second.mode, 'mine');
  assert.equal(paramsForMode(second.mine, DEFAULTS, second.mode), second.mine);
  assert.deepEqual(second.mine, { ...STARTER, startReserve: 50, startMag: 4, keepChamberRound: false });
  assert.deepEqual(state.mine, { ...STARTER, startReserve: 50 });
});

test('field edits clamp only the edited field against the saved tune', () => {
  const state = initializeLabState();
  assert.deepEqual(mineFieldBounds(state.mine).commitMs, [181, 999]);
  for (const [field, value, result] of [
    ['commitMs', 0, 181], ['finishMs', 0, 701], ['magOutMs', 5000, 699],
    ['magCapacity', 1, 3], ['startMag', 30, 8],
  ]) {
    assert.deepEqual(editLabField(state, field, value).mine, { ...STARTER, [field]: result });
  }
});

test('ingest orders and clamps extreme values using the intended fallbacks', () => {
  assert.notDeepEqual(STARTER, DEFAULTS);
  assert.deepEqual(initializeLabState({ storedMine: { startReserve: 40 } }), {
    mine: { ...STARTER, startReserve: 40 }, mode: 'default',
  });
  assert.deepEqual(clampParams({ magCapacity: 35, startMag: 42, startReserve: 200, magOutMs: 9000, commitMs: 0 }), {
    magCapacity: 30, startMag: 30, startReserve: 99, magOutMs: 5998, commitMs: 5999,
    finishMs: 6000, keepChamberRound: true,
  });
});

test('share URL round-trips mine in either mode, wins over storage, and preserves URL context', () => {
  const mine = { ...STARTER, keepChamberRound: false };
  const before = { ...DEFAULTS };
  for (const mode of ['default', 'mine']) {
    const url = new URL(buildShareUrl('https://example.org/reload/?ref=demo&reload=old#lab', mine, mode));
    assert.equal(SHARE_PARAM, 'reload');
    assert.equal(url.searchParams.get('ref'), 'demo');
    assert.equal(url.hash, '#lab');
    const token = url.searchParams.get('reload');
    assert.equal(token, encodeShare(mine, mode));
    assert.deepEqual(decodeShare(token), { mine, mode });
    const state = initializeLabState({ token, storedMine: { ...STARTER, startMag: 0 } });
    assert.deepEqual(state, { mine, mode });
    assert.deepEqual(exportJson(state.mine, state.mode), {
      v: 1, mode, params: mode === 'default' ? before : mine,
    });
    assert.equal(paramsForMode(state.mine, DEFAULTS, 'default'), DEFAULTS);
  }
  assert.ok(Object.isFrozen(DEFAULTS));
  assert.deepEqual(DEFAULTS, before);
});

test('hand-built v1 share payload round-trips and is clamped at ingest', () => {
  const mine = { ...STARTER, startReserve: 24 };
  const handBuilt = payload => Buffer.from(JSON.stringify(payload)).toString('base64url');
  const expected = { mine, mode: 'default' };
  const decoded = decodeShare(handBuilt({ v: 1, ...expected }));
  assert.deepEqual(decoded, expected);
  assert.deepEqual(decodeShare(encodeShare(decoded.mine, decoded.mode)), expected);
  assert.deepEqual(decodeShare(handBuilt({ v: 1, mode: 'mine', mine: { ...mine, commitMs: 2 } })), {
    mine: { ...mine, commitMs: mine.magOutMs + 1 }, mode: 'mine',
  });
  for (const token of ['!!!', 'abc', handBuilt({ v: 0, ...expected }), handBuilt({ v: 1, mode: 'mine', mine: {} })]) {
    assert.equal(decodeShare(token), null);
    assert.deepEqual(initializeLabState({ token }), { mine: STARTER, mode: 'default' });
  }
});
