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

const jumpUrl = moduleUrl('src/feel/jump.ts');
const { STEP, JumpClock, JumpControls } = await import(jumpUrl);
const { MoveRoom, MOVE_DEFAULTS, MOVE_LIMITS, TRACK, GRAVITY, HOP_SPEED, moveParamsForMode, moveJson,
  readMoveTune, serializeMoveTune } = await import(moduleUrl('src/feel/move.ts', { './jump': jumpUrl }));
const { buildShareUrl, readTuneParam } = await import(moduleUrl('src/feel/share.ts', {
  './params': moduleUrl('src/feel/params.ts'),
  './boss-params': moduleUrl('src/feel/boss-params.ts'),
}));
const entry = readFileSync('src/pages/feel-move.ts', 'utf8');
const tune = (changes = {}) => ({ ...MOVE_DEFAULTS, ...changes });

function advance(room, params, ticks, direction = 0) {
  for (let i = 0; i < ticks; i++) room.step(params, direction, false);
}

test('movement: acceleration controls starts and reversals; maximum speed is a hard cap', () => {
  const room = new MoveRoom();
  const high = tune({ acceleration: 2400, maxSpeed: 60 });
  room.step(high, 1, false);
  assert.equal(room.vx, 2400 * STEP);
  advance(room, high, 200, 1);
  assert.equal(room.vx, 60);
  room.step(high, -1, false);
  assert.equal(room.vx, 40);
  advance(room, high, 10, -1);
  assert.equal(room.vx, -60);

  const zero = new MoveRoom();
  advance(zero, tune({ acceleration: 0 }), 100, 1);
  assert.equal(zero.x, new MoveRoom().x);
  assert.equal(zero.vx, 0);
});

test('movement: stronger brake shortens the measured release distance at the same speed', () => {
  const distances = [400, 1600].map((brake) => {
    const room = new MoveRoom();
    const params = tune({ brake });
    advance(room, params, 50, 1);
    assert.equal(room.vx, 240);
    const releaseX = room.x;
    advance(room, params, 100);
    assert.equal(room.vx, 0);
    assert.equal(room.trace.status, 'stopped');
    assert.equal(room.trace.start, releaseX);
    assert.equal(room.trace.end, room.x);
    assert.equal(room.stopDistance, room.x - releaseX);
    return room.stopDistance;
  });
  assert.ok(distances[0] > distances[1] && distances[1] > 0);
});

test('movement: zero brake coasts at the speed cap and reports a wall stop', () => {
  const room = new MoveRoom();
  const params = tune({ brake: 0, acceleration: 2400, maxSpeed: 480 });
  advance(room, params, 24, 1);
  assert.equal(room.vx, MOVE_LIMITS.maxSpeed[1]);
  advance(room, params, 10);
  assert.equal(room.vx, 480);
  assert.equal(room.trace.status, 'rolling');
  assert.equal(room.stopDistance, 40);
  advance(room, params, 130);
  assert.equal(room.x, TRACK.right);
  assert.equal(room.vx, 0);
  assert.equal(room.trace.status, 'wall');
});

test('movement: a physical hop isolates air control and ground braking resumes on contact', () => {
  const none = new MoveRoom();
  const full = new MoveRoom();
  const zero = tune({ airControl: 0 });
  const hundred = tune({ airControl: 100 });
  none.step(zero, 0, true);
  full.step(hundred, 0, true);
  advance(none, zero, 24, 1);
  advance(full, hundred, 24, 1);
  assert.ok(!none.grounded && !full.grounded);
  assert.ok(full.y < TRACK.floor);
  assert.equal(full.y, none.y);
  assert.equal(none.vx, 0);
  assert.equal(full.vx, 144);
  assert.ok(full.x > none.x);

  const airborneSpeed = full.vx;
  full.step(hundred, 0, true);
  assert.equal(full.vx, airborneSpeed, 'no friction or second jump impulse in the air');
  assert.ok(full.vy > -HOP_SPEED + GRAVITY * STEP);
  while (!full.grounded) full.step(hundred, 0, false);
  assert.equal(full.vx, airborneSpeed);
  full.step(hundred, 0, false);
  assert.ok(full.vx < airborneSpeed);
});

test('movement: the clock clamps a long frame to 100 ms and retains fixed-step results', () => {
  const large = new MoveRoom();
  const small = new MoveRoom();
  const clock = new JumpClock();
  let ticks = 0;
  clock.advance(2, () => { ticks++; large.step(MOVE_DEFAULTS, 1, false); });
  assert.equal(ticks, 12);
  advance(small, MOVE_DEFAULTS, 12, 1);
  assert.deepEqual(large, small);
});

test('movement: touch release, cancellation and focus loss clear held input sources', () => {
  const input = new JumpControls();
  input.down('pointer:1', 'right');
  input.down('ArrowRight', 'right');
  input.up('pointer:1');
  assert.equal(input.sample().direction, 1, 'a separate held source remains active');
  input.up('ArrowRight');
  assert.equal(input.sample().direction, 0);
  input.down('pointer:2', 'left');
  input.down('Space', 'jump');
  input.clear();
  assert.deepEqual(input.sample(), { direction: 0, pressed: false, held: false });
  assert.match(entry, /\["pointerup", "pointercancel", "lostpointercapture"\]/);
  assert.match(entry, /button\.addEventListener\(eventName, \(event\) => controls\.up/);
  assert.match(entry, /canvas\.addEventListener\("blur", \(\) => controls\.clear\(\)\)/);
  assert.match(entry, /window\.addEventListener\("blur", \(\) => controls\.clear\(\)\)/);
  assert.match(entry, /"visibilitychange", \(\) => \{\s*controls\.clear\(\)/);
});

test('movement: room reset clears position, velocities, hop and trace while keeping My tune', () => {
  const room = new MoveRoom();
  const edited = tune({ acceleration: 960, brake: 620 });
  advance(room, edited, 30, 1);
  room.step(edited, 0, true);
  assert.ok(room.trace && room.vx > 0 && room.vy < 0);
  room.reset();
  assert.deepEqual(room, new MoveRoom());
  assert.deepEqual(edited, tune({ acceleration: 960, brake: 620 }));
  const resetBody = entry.match(/function resetRoom\(\): void \{([^}]*)\}/)[1];
  assert.match(resetBody, /controls\.clear\(\)/);
  assert.doesNotMatch(resetBody, /tune|updateMode|mode\s*=/);
});

test('movement: localized share URL reloads My tune and selected mode drives play and JSON', () => {
  const edited = tune({ acceleration: 0, maxSpeed: 480, brake: 0, airControl: 100 });
  const { origin, pathname, search, hash } = new URL('http://127.0.0.1:4173/es/feel/move/?view=1&tune=old#move-air');
  const shared = new URL(buildShareUrl(origin, pathname, search, hash, serializeMoveTune(edited)));
  assert.equal(shared.pathname, pathname);
  assert.equal(shared.hash, hash);
  assert.equal(shared.searchParams.get('view'), '1');
  assert.match(shared.search, /tune=move1%3A%7B/);
  assert.equal(readTuneParam(shared.search), null);
  const loaded = readMoveTune(shared.search);
  assert.deepEqual(loaded, edited);
  for (const mode of ['mine', 'default']) {
    const expected = mode === 'mine' ? edited : MOVE_DEFAULTS;
    const active = moveParamsForMode(loaded, mode);
    const room = new MoveRoom();
    room.step(active, 1, false);
    assert.equal(room.vx, expected.acceleration * STEP);
    const json = JSON.parse(moveJson(active));
    for (const key of Object.keys(MOVE_LIMITS)) assert.equal(json[key], expected[key]);
    assert.equal(json.tickHz, 120);
    assert.equal(json.hopSpeed, HOP_SPEED);
    assert.equal(json.gravity, GRAVITY);
  }
  assert.deepEqual(loaded, edited);
  assert.match(entry, /moveJson\(activeParams\(\)\)/);
  assert.match(entry, /buildShareUrl\(origin, pathname, search, hash, serializeMoveTune\(tune\)\)/);
});

test('movement: wrong-prefix, malformed and out-of-range tune payloads use defaults', () => {
  for (const token of ['heavy', 'jump1:{}', 'move1:{', serializeMoveTune(tune({ maxSpeed: 100000 })),
    serializeMoveTune(tune({ acceleration: -20 })), serializeMoveTune(tune({ airControl: 37 }))]) {
    assert.deepEqual(readMoveTune('?' + new URLSearchParams({ tune: token })), MOVE_DEFAULTS);
  }
});

test('movement: the catalog and playable page labels resolve in all five locales', async () => {
  const html = readFileSync('feel/move/index.html', 'utf8');
  const catalog = readFileSync('feel/index.html', 'utf8');
  const keys = new Set([...(html + catalog).matchAll(/data-i18n(?:-aria)?="move\.([^"]+)"/g)].map((match) => match[1]));
  for (const key of ['ground', 'air', 'rolling', 'stopped', 'wall']) keys.add(key);
  for (const lang of ['en', 'zh', 'ja', 'ko', 'es']) {
    const { default: dict } = await import(moduleUrl(`src/lib/locales/${lang}.ts`));
    for (const key of keys) assert.ok(dict.move[key]?.trim(), `${lang}: move.${key}`);
  }
  assert.match(catalog, /href="\/feel\/move\/"/);
  assert.match(html, /class="feel-main"/);
  assert.match(html, /class="feel-stage move-stage"/);
  assert.match(html, /class="feel-code feel-code-wide"/);
  assert.match(readFileSync('vite.config.ts', 'utf8'), /feel\/move\/index\.html/);
  assert.match(readFileSync('scripts/localize-pages.mjs', 'utf8'), /path==='feel\/move\/'\?'move'/);
});
