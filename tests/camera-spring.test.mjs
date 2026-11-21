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
const { JumpClock, JumpControls } = await import(jumpUrl);
const { CameraRoom, CAMERA_WORLD, CAMERA_DEFAULTS, CAMERA_STARTER, CAMERA_LIMITS } =
  await import(moduleUrl('src/feel/camera.ts', { './jump': jumpUrl }));
const { SpringRoom, SPRING_DEFAULTS, SPRING_LIMITS } =
  await import(moduleUrl('src/feel/spring.ts', { './jump': jumpUrl }));
const { labJson, labToken, parseLabTune, paramsForLab } = await import(moduleUrl('src/feel/lab-tune.ts'));
const { buildShareUrl, readTuneParam } = await import(moduleUrl('src/feel/share.ts', {
  './params': moduleUrl('src/feel/params.ts'),
  './boss-params': moduleUrl('src/feel/boss-params.ts'),
}));

test('camera: inside the deadzone stays still, crossing it follows with visible lag', () => {
  const hard = new CameraRoom();
  const smooth = new CameraRoom();
  for (let i = 0; i < 25; i++) {
    hard.step(CAMERA_DEFAULTS, 1);
    smooth.step(CAMERA_STARTER, 1);
  }
  assert.equal(hard.target, smooth.target);
  assert.equal(hard.center, hard.target);
  assert.equal(smooth.center, 560);
  for (let i = 0; i < 48; i++) {
    hard.step(CAMERA_DEFAULTS, 1);
    smooth.step(CAMERA_STARTER, 1);
  }
  assert.ok(smooth.center > 560 && smooth.center < hard.center);
  const movingCenter = smooth.center;
  for (let i = 0; i < 700; i++) smooth.step(CAMERA_STARTER, 0);
  assert.ok(smooth.center > movingCenter, 'camera catches up after movement stops');
  assert.equal(smooth.target - smooth.center, CAMERA_STARTER.deadzonePx);
});

test('camera: whole view stays in bounds with snap, maximum smoothing and maximum deadzone', () => {
  for (const params of [
    CAMERA_DEFAULTS,
    { deadzonePx: 0, smoothingMs: CAMERA_LIMITS.smoothingMs[1] },
    { deadzonePx: CAMERA_LIMITS.deadzonePx[1], smoothingMs: 0 },
  ]) {
    const room = new CameraRoom();
    for (const direction of [1, -1]) {
      for (let i = 0; i < 2600; i++) {
        room.step(params, direction);
        assert.ok(room.left >= 0 && room.left + CAMERA_WORLD.view <= CAMERA_WORLD.width);
      }
      assert.ok(room.atBound);
      assert.equal(room.left, direction === 1 ? CAMERA_WORLD.width - CAMERA_WORLD.view : 0);
    }
  }
});

test('camera: touch cancellation and focus loss clear held direction', () => {
  const controls = new JumpControls();
  controls.down('pointer:2', 'right');
  assert.equal(controls.sample().direction, 1);
  controls.up('pointer:2');
  assert.equal(controls.sample().direction, 0);
  controls.down('KeyA', 'left');
  controls.clear();
  assert.equal(controls.sample().direction, 0);
  const source = readFileSync('src/pages/feel-camera.ts', 'utf8');
  assert.match(source, /\["pointerup", "pointercancel", "lostpointercapture"\]/);
  assert.match(source, /button\.addEventListener\(type, \(event\) => input\.up/);
  assert.match(source, /canvas\.addEventListener\("blur", \(\) => input\.clear\(\)\)/);
  assert.match(source, /window\.addEventListener\("blur", \(\) => input\.clear\(\)\)/);
  assert.match(source, /"visibilitychange", \(\) => \{\s*input\.clear\(\)/);
});

test('spring: the default overshoots and settles; higher damping reduces overshoot', () => {
  const peaks = [];
  for (const damping of [SPRING_DEFAULTS.damping, 65]) {
    const room = new SpringRoom();
    room.toggle();
    for (let i = 0; i < 1200; i++) room.step({ ...SPRING_DEFAULTS, damping });
    assert.equal(room.position, 1);
    assert.equal(room.velocity, 0);
    assert.ok(room.settled);
    assert.ok(room.trace.length > 2);
    peaks.push(room.peak);
  }
  assert.ok(peaks[0] > 0.1);
  assert.equal(peaks[1], 0);
});

test('spring: all damping branches remain finite at allowed extremes and settle after reversal', () => {
  for (const params of [
    { stiffness: 1200, damping: 2, mass: 1 },
    { stiffness: 40, damping: 100, mass: 8 },
    { stiffness: 100, damping: 20, mass: 1 }, // critical
    { stiffness: 1200, damping: 2, mass: 8 },
  ]) {
    const room = new SpringRoom();
    room.toggle();
    for (let i = 0; i < 30; i++) room.step(params);
    room.toggle();
    for (let i = 0; i < 12000; i++) {
      room.step(params);
      assert.ok(Number.isFinite(room.position) && Number.isFinite(room.velocity));
      assert.ok(room.trace.length <= 161);
    }
    assert.ok(room.settled);
    assert.equal(room.position, 0);
  }
});

test('camera and spring: long frames follow the shared 100 ms fixed-step policy', () => {
  const clock = new JumpClock();
  const camera = new CameraRoom();
  const expectedCamera = new CameraRoom();
  const spring = new SpringRoom();
  const expectedSpring = new SpringRoom();
  spring.toggle();
  expectedSpring.toggle();
  clock.advance(2, () => { camera.step(CAMERA_DEFAULTS, 1); spring.step(SPRING_DEFAULTS); });
  for (let i = 0; i < 12; i++) {
    expectedCamera.step(CAMERA_DEFAULTS, 1);
    expectedSpring.step(SPRING_DEFAULTS);
  }
  assert.deepEqual(camera, expectedCamera);
  assert.deepEqual(spring, expectedSpring);
});

test('camera and spring: fresh share URLs restore editable values; room reset and mode changes preserve them', () => {
  for (const [slug, defaults, starter, limits, edited, room, play] of [
    ['camera', CAMERA_DEFAULTS, CAMERA_STARTER, CAMERA_LIMITS, { smoothingMs: 490, deadzonePx: 84 }, new CameraRoom(),
      (r, p) => { for (let i = 0; i < 60; i++) r.step(p, 1); }],
    ['spring', SPRING_DEFAULTS, SPRING_DEFAULTS, SPRING_LIMITS, { stiffness: 400, damping: 40, mass: 5 }, new SpringRoom(),
      (r, p) => { r.toggle(); r.step(p); }],
  ]) {
    const prefix = slug + '1';
    const page = new URL(`http://127.0.0.1:4173/es/feel/${slug}/?view=1#lab-parameters`);
    const { origin, pathname, search, hash } = page;
    const url = new URL(buildShareUrl(origin, pathname, search, hash, labToken(prefix, edited)));
    assert.match(url.search, /tune=(?:camera|spring)1%3A%7B/);
    assert.equal(url.pathname, pathname);
    assert.equal(url.hash, hash);
    assert.equal(readTuneParam(url.search), null);
    const loaded = parseLabTune(url.search, prefix, starter, limits);
    assert.deepEqual(loaded, edited);
    play(room, paramsForLab(loaded, defaults, 'mine'));
    const mine = { ...room };
    room.reset();
    assert.notDeepEqual({ ...room }, mine);
    assert.deepEqual(room, slug === 'camera' ? new CameraRoom() : new SpringRoom());
    assert.deepEqual(loaded, edited);
    play(room, paramsForLab(loaded, defaults, 'default'));
    assert.notDeepEqual({ ...room }, mine, 'modes produce different room states on the same input');
    assert.deepEqual(JSON.parse(labJson(paramsForLab(loaded, defaults, 'mine'))), edited);
    assert.deepEqual(JSON.parse(labJson(paramsForLab(loaded, defaults, 'default'))), defaults);
    const wrong = '?' + new URLSearchParams({ tune: labToken('move1', edited) });
    assert.deepEqual(parseLabTune(wrong, prefix, starter, limits), starter);
    const invalid = '?' + new URLSearchParams({ tune: labToken(prefix, { ...edited, [Object.keys(edited)[0]]: 999999 }) });
    assert.deepEqual(parseLabTune(invalid, prefix, starter, limits), starter);
  }
  const panel = readFileSync('src/pages/feel-small-lab.ts', 'utf8');
  assert.match(panel, /labJson\(active\(\)\)/);
  assert.match(panel, /labToken\(prefix, tune\)/);
  assert.match(panel, /querySelector\("#lab-reset"\)!\.addEventListener\("click", reset\)/);
});

test('camera and spring: all controls, statuses and catalog labels exist in five locales', async () => {
  const catalog = readFileSync('feel/index.html', 'utf8');
  const pages = ['camera', 'spring'].map((slug) => readFileSync(`feel/${slug}/index.html`, 'utf8'));
  const markup = catalog + pages.join('');
  const keys = new Set([...markup.matchAll(/data-i18n(?:-aria)?="((?:camera|spring|smallLab)\.[^"]+)"/g)].map((m) => m[1]));
  for (const key of ['camera.bound', 'camera.inside', 'camera.following', 'spring.moving', 'spring.settled']) keys.add(key);
  for (const locale of ['en', 'zh', 'ja', 'ko', 'es']) {
    const { default: dict } = await import(moduleUrl(`src/lib/locales/${locale}.ts`));
    for (const key of keys) {
      const [scope, id] = key.split('.');
      assert.ok(dict[scope][id]?.trim(), `${locale}: ${key}`);
    }
  }
  for (const page of pages) {
    assert.match(page, /class="feel-stage"/);
    assert.match(page, /class="feel-code feel-code-wide"/);
  }
});
