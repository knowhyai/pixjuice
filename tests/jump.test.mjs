import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(file, imports = {}) {
  let source = readFileSync(file, 'utf8');
  for (const [specifier, url] of Object.entries(imports)) {
    source = source.replaceAll(`from "${specifier}"`, `from "${url}"`);
  }
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return 'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64');
}
const loadTs = (file, imports) => import(moduleUrl(file, imports));

const { JUMP_DEFAULTS, JumpRoom, JumpControls, JumpClock, JumpTrial, STEP, ROOM, readJumpTune,
  serializeJumpTune, jumpParamsForMode } =
  await loadTs('src/feel/jump.ts');
const { godotJump, jumpJson } = await loadTs('src/feel/jump-codegen.ts');
const { buildShareUrl, readTuneParam } = await loadTs('src/feel/share.ts', {
  './params': moduleUrl('src/feel/params.ts'),
  './boss-params': moduleUrl('src/feel/boss-params.ts'),
});
const idle = { direction: 0, pressed: false, held: false };
const press = { ...idle, pressed: true, held: true };
const walk = { ...idle, direction: 1 };
const tune = (overrides = {}) => ({ ...JUMP_DEFAULTS, ...overrides });

function walkOff(room, params) {
  for (let i = 0; i < 60 && room.grounded; i++) room.step(params, walk);
  assert.equal(room.grounded, false);
  assert.equal(room.sinceEdge, 0);
}

function landingState() {
  const room = new JumpRoom();
  room.reset(true);
  room.y = ROOM.floor - 22;
  room.vy = 250;
  return room;
}

function advance(room, params, steps, input = idle) {
  for (let i = 0; i < steps; i++) room.step(params, input);
}

test('jump: late edge press at 75 ms succeeds with coyote, fails at zero or off', () => {
  for (const [overrides, expected] of [
    [{ bufferEnabled: false }, 'coyote'],
    [{ coyoteMs: 0, bufferEnabled: false }, 'ignored'],
    [{ coyoteEnabled: false, bufferEnabled: false }, 'ignored'],
  ]) {
    const params = tune(overrides);
    const room = new JumpRoom();
    walkOff(room, params);
    advance(room, params, 9);
    room.step(params, press);
    assert.equal(room.result, expected);
    assert.equal(room.jumps, Number(expected === 'coyote'));
    assert.equal(room.vy < 0, expected === 'coyote');
  }
});

test('jump: a jump from the floor or from coyote consumes the air jump', () => {
  const params = tune({ bufferEnabled: false });
  for (const fromEdge of [false, true]) {
    const room = new JumpRoom();
    if (fromEdge) walkOff(room, params);
    room.step(params, press);
    assert.equal(room.jumps, 1);
    assert.equal(room.coyote, 0);
    advance(room, params, 2);
    const vy = room.vy;
    room.step(params, press);
    assert.equal(room.jumps, 1);
    assert.ok(room.vy > vy, 'gravity continues without a second impulse');
  }
});

test('jump: an early press launches once on landing with buffer, misses at zero or off', () => {
  for (const [overrides, expected] of [
    [{ coyoteEnabled: false }, 'buffer'],
    [{ bufferMs: 0 }, 'ignored'],
    [{ bufferEnabled: false }, 'ignored'],
  ]) {
    const params = tune(overrides);
    const room = landingState();
    room.step(params, press);
    assert.equal(room.jumps, 0, 'the buffered press does not jump in midair');
    advance(room, params, 12);
    assert.equal(room.result, expected);
    assert.equal(room.jumps, Number(expected === 'buffer'));
    assert.equal(room.buffer, 0);
    advance(room, params, 180);
    assert.equal(room.jumps, Number(expected === 'buffer'));
    assert.equal(room.grounded, true);
  }
});

test('jump: a press on the landing step works with both aids off', () => {
  const params = tune({ coyoteEnabled: false, bufferEnabled: false });
  const room = landingState();
  room.y = ROOM.floor - 1;
  room.step(params, press);
  assert.equal(room.result, 'grounded');
  assert.equal(room.jumps, 1);
  assert.equal(room.vy, -params.jumpSpeed);
});

test('jump: keyboard repeat does not stack force or re-jump after landing', () => {
  const room = new JumpRoom();
  const inputs = new JumpControls();
  for (let i = 0; i < 220; i++) {
    inputs.down('Space', 'jump');
    room.step(JUMP_DEFAULTS, inputs.sample());
  }
  assert.equal(room.grounded, true);
  assert.equal(room.jumps, 1);
  inputs.up('Space');
  inputs.down('Space', 'jump');
  room.step(JUMP_DEFAULTS, inputs.sample());
  assert.equal(room.jumps, 2);
});

test('jump: a 100 ms frame advances 12 ticks, expires short windows and lands buffered inputs', () => {
  const clock = new JumpClock();
  const short = tune({ coyoteMs: 60 });
  const room = new JumpRoom();
  walkOff(room, short);
  let steps = 0;
  clock.advance(0.8, () => {
    room.step(short, idle);
    steps++;
  });
  assert.equal(steps, 12, 'drops time past the 100 ms frame budget');
  assert.equal(room.coyote, 0);
  room.step(short, press);
  assert.equal(room.jumps, 0);

  const landing = landingState();
  landing.step(JUMP_DEFAULTS, press);
  clock.advance(0.1, () => landing.step(JUMP_DEFAULTS, idle));
  assert.equal(landing.jumps, 1);
  assert.equal(landing.result, 'buffer');
});

test('jump: touch release preserves a tap, blur clears all sources and queued presses', () => {
  const inputs = new JumpControls();
  inputs.down('pointer:1', 'jump');
  inputs.up('pointer:1');
  assert.deepEqual(inputs.sample(), { ...press, held: false });
  inputs.down('Space', 'jump');
  inputs.down('pointer:2', 'jump');
  inputs.up('pointer:2');
  assert.equal(inputs.has('jump'), true, 'one released source does not clear another');
  inputs.down('ArrowRight', 'right');
  inputs.clear();
  assert.deepEqual(inputs.sample(), idle);
  const entry = readFileSync('src/pages/feel-jump.ts', 'utf8');
  assert.match(entry, /\["pointerup", "pointercancel", "lostpointercapture"\]/);
  assert.match(entry, /window\.addEventListener\("blur", \(\) => controls\.clear\(\)\)/);
  assert.match(entry, /"visibilitychange", \(\) => \{\s*controls\.clear\(\)/);
});

test('jump: reset clears position, velocity, input timers and consumed state', () => {
  const room = landingState();
  room.step(JUMP_DEFAULTS, press);
  assert.ok(room.buffer > 0);
  room.reset();
  assert.deepEqual(room, new JumpRoom());
  walkOff(room, JUMP_DEFAULTS);
  assert.ok(room.coyote > 0);
  room.reset();
  assert.deepEqual(room, new JumpRoom());
});

test('jump: holding rises higher, release is optional, and gravity still changes the arc', () => {
  function apex(params, held) {
    const room = new JumpRoom();
    room.step(params, { ...press, held });
    let min = room.y;
    for (let i = 0; i < 100 && room.vy < 0; i++) {
      room.step(params, { ...idle, held });
      min = Math.min(min, room.y);
    }
    return min;
  }
  assert.ok(apex(JUMP_DEFAULTS, true) < apex(JUMP_DEFAULTS, false));
  assert.equal(apex(tune({ variableHeight: false }), true), apex(tune({ variableHeight: false }), false));
  assert.ok(apex(tune({ gravity: 1200 }), true) > apex(JUMP_DEFAULTS, true));
});

test('jump: the selectable trials actually jump only with their corresponding timer', () => {
  for (const coyoteEnabled of [false, true]) {
    for (const bufferEnabled of [false, true]) {
      const params = tune({ coyoteEnabled, bufferEnabled });
      for (const [kind, success] of [['edge', coyoteEnabled], ['landing', bufferEnabled]]) {
        const room = new JumpRoom();
        room.reset(kind === 'landing');
        const trial = new JumpTrial(kind);
        let rose = false;
        while (!trial.done) {
          const y = room.y;
          room.step(params, trial.input(room, params));
          rose ||= room.y < y;
        }
        assert.equal(rose, success, `${kind}: visible ascent`);
        assert.equal(room.jumps, Number(success));
        assert.equal(room.result, success ? kind === 'edge' ? 'coyote' : 'buffer' : 'ignored');
      }
    }
  }
});

test('jump: JSON, Godot and shared tune preserve the live settings', () => {
  const params = tune({
    coyoteEnabled: false, coyoteMs: 85, bufferEnabled: true, bufferMs: 145,
    variableHeight: false, releaseSpeed: 230, gravity: 1030, jumpSpeed: 470,
  });
  assert.deepEqual(JSON.parse(jumpJson(params)), params);
  const script = godotJump(params);
  for (const [key, val] of Object.entries(params)) {
    const constant = key.replace(/[A-Z]/g, (letter) => '_' + letter).toUpperCase();
    const value = script.match(new RegExp(`const ${constant}: \\w+ = ([^\\n]+)`))?.[1];
    assert.equal(JSON.parse(value), val, constant);
  }
  for (const invalid of ['heavy', '1-5a', 'jump1:{', 'jump1:' + JSON.stringify({ ...params, coyoteMs: -5 })]) {
    assert.deepEqual(readJumpTune('?' + new URLSearchParams({ tune: invalid })), JUMP_DEFAULTS);
  }
});

test('jump: a fresh share URL loads 75 ms into My tune, simulation and downloads', () => {
  const original = new URL('http://127.0.0.1:4173/feel/jump/?tune=old&v=preview#jump-trials');
  const params = tune({ coyoteMs: 75, bufferEnabled: false, bufferMs: 145, variableHeight: false,
    releaseSpeed: 230, gravity: 1030, jumpSpeed: 470 });
  const { origin, pathname, search, hash } = original;
  const shared = new URL(buildShareUrl(origin, pathname, search, hash, serializeJumpTune(params)));
  assert.match(shared.search, /tune=jump1%3A%7B/);
  assert.equal(shared.searchParams.get('v'), 'preview');
  assert.equal(shared.hash, hash);
  assert.equal(readTuneParam(shared.search), null, 'the Hit/Boss reader still rejects a Jump token');

  const loaded = readJumpTune(shared.search);
  assert.deepEqual(loaded, params);
  for (const [mode, window, expected] of [['mine', 75, 'ignored'], ['default', 120, 'coyote']]) {
    const active = jumpParamsForMode(loaded, mode);
    assert.equal(active.coyoteMs, window);
    const room = new JumpRoom();
    walkOff(room, active);
    advance(room, active, 10); // about 83 ms after leaving the edge
    room.step(active, press);
    assert.equal(room.result, expected);
    assert.equal(room.jumps, Number(mode === 'default'));
    assert.equal(JSON.parse(jumpJson(active)).coyoteMs, window);
    assert.match(godotJump(active), new RegExp(`const COYOTE_MS: int = ${window}\\b`));
  }
  assert.equal(loaded.coyoteMs, 75, 'the editable fields keep My tune during comparison');
});

test('jump: catalog, localized SEO and all five locale labels ship with the room', async () => {
  const html = readFileSync('feel/jump/index.html', 'utf8');
  const catalog = readFileSync('feel/index.html', 'utf8');
  const markup = html + catalog;
  const keys = new Set([...markup.matchAll(/data-i18n(?:-aria)?="jump\.([^"]+)"/g)].map((m) => m[1]));
  const lookup = (obj, key) => key.split('.').reduce((value, part) => value?.[part], obj);
  for (const key of ['ready', 'grounded', 'coyote', 'buffer', 'pending', 'ignored']) keys.add('result.' + key);
  for (const locale of ['en', 'zh', 'ja', 'ko', 'es']) {
    const { default: dict } = await loadTs(`src/lib/locales/${locale}.ts`);
    for (const key of keys) assert.ok(lookup(dict.jump, key)?.trim(), `${locale}: jump.${key}`);
  }
  assert.match(catalog, /href="\/feel\/jump\/"/);
  assert.match(readFileSync('vite.config.ts', 'utf8'), /feel\/jump\/index\.html/);
  assert.match(readFileSync('scripts/localize-pages.mjs', 'utf8'), /path==='feel\/jump\/'\?'jump'/);
  assert.match(readFileSync('public/sitemap.xml', 'utf8'), /https:\/\/pixjuice\.pages\.dev\/feel\/jump\//);
  assert.doesNotMatch(readFileSync('feel/hit/index.html', 'utf8'), /feel-freeze/);
  assert.doesNotMatch(readFileSync('src/feel/demo.ts', 'utf8'), /VictimSquash|squashAmount/);
});
