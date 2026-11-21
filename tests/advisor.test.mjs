import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Advisor-loop regression tests: shareable ?tune= state, baseline compare,
// problem entry and hookup caveats. Same TS-loading trick as feel.test.mjs /
// boss.test.mjs (transpile → data URL, runtime imports rewritten).
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

function dataUrl(path, deps = {}, prelude = '') {
  let src = fs.readFileSync(path, 'utf8');
  for (const [spec, url] of Object.entries(deps)) {
    src = src.replaceAll(`import("${spec}")`, `import("${url}")`)
      .replaceAll(`import "${spec}"`, `import "${url}"`)
      .replaceAll(`from "${spec}"`, `from "${url}"`)
      .replaceAll(`from '${spec}'`, `from "${url}"`);
  }
  const out = ts.transpileModule(prelude + src, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  return moduleUrl(out);
}

async function loadTs(path, name = 'default', deps = {}, prelude = '') {
  const mod = await import(dataUrl(path, deps, prelude));
  return name ? mod[name] ?? mod : mod;
}

const hitParamsUrl = dataUrl('./src/feel/params.ts');
const bossParamsUrl = dataUrl('./src/feel/boss-params.ts');
const shareDeps = { './params': hitParamsUrl, './boss-params': bossParamsUrl };

const { PRESETS, DEFAULT_PARAMS, cloneParams } = await loadTs('./src/feel/params.ts');
const { BOSS_PRESETS, BOSS_DEFAULT_PARAMS, cloneBossParams } = await loadTs('./src/feel/boss-params.ts');
const { serializeFeel, parseFeelState, serializeBoss, parseBossState, readTuneParam, buildShareUrl, TUNE_PARAM } =
  await loadTs('./src/feel/share.ts', 'default', shareDeps);
const { godotHitFeel, unityHitFeel, godotArmIK, godotLocalBones, unityArmIK } = await loadTs('./src/feel/codegen.ts');
const { godotBossHp, webBossHp } = await loadTs(
  './src/feel/boss-codegen.ts',
  'default',
  { './boss-params': bossParamsUrl },
);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---- ?tune= serialize / parse round-trips --------------------------------------------

test('advisor: hit tune round-trips through the URL token (presets and custom tunes)', () => {
  // preset shorthand: an untouched preset serializes to its id and back
  for (const id of ['light', 'heavy', 'overdone']) {
    const token = serializeFeel(PRESETS[id]);
    assert.equal(token, id, `${id} serializes to the preset shorthand`);
    const back = parseFeelState(token);
    assert.ok(back, `${id} parses`);
    assert.equal(back.preset, id);
    assert.ok(same(back.params, PRESETS[id]), `${id} params survive`);
  }
  // the page default is the light preset, so a fresh page shares as "light"
  assert.equal(serializeFeel(DEFAULT_PARAMS), 'light');

  // a custom tune: mutate every number and flag family, round-trip, compare deep
  const custom = cloneParams(PRESETS.heavy);
  custom.hitStop.frames = 9;
  custom.shake.trauma = 0.42;
  custom.shake.decay = 3.1;
  custom.feedback.flashIntensity = 0.62;
  custom.feedback.squash = false;
  custom.feedback.squashAmount = 0.51;
  custom.feedback.numberScale = 1.7;
  custom.knockback.distance = 1.25;
  custom.knockback.stopTime = 0.23;
  custom.vfx.sparks = 85;
  custom.sfx.volume = 0.66;
  custom.feedback.flash = false;
  custom.sfx.mid = true;
  custom.heavyFinisher = false;
  const token = serializeFeel(custom);
  assert.match(token, /^1-/, 'custom tune is a full v1 token');
  assert.ok(!/[^\w.-]/.test(token), 'token is URL-safe with no encoding');
  const back = parseFeelState(token);
  assert.ok(back, 'custom token parses');
  assert.equal(back.preset, null, 'a custom tune matches no preset');
  assert.ok(same(back.params, custom), 'every layer switch and number survives');
  assert.equal(back.params.feedback.squash, false);
  assert.equal(back.params.feedback.squashAmount, 0.51);
  assert.equal(serializeFeel(DEFAULT_PARAMS), 'light', 'parsing preserves the page default');
  assert.match(godotHitFeel(back.params), /squash_on := false/);
  assert.match(unityHitFeel(back.params), /squashAmount = 0\.51f/);
});

test('advisor: boss tune round-trips through the URL token', () => {
  for (const id of ['light', 'heavy']) {
    const token = serializeBoss(BOSS_PRESETS[id]);
    assert.equal(token, id);
    const back = parseBossState(token);
    assert.ok(back && back.preset === id && same(back.params, BOSS_PRESETS[id]));
  }
  const custom = cloneBossParams(BOSS_PRESETS.heavy);
  custom.lag.wait = 0.52;
  custom.lag.catch = 0.63;
  custom.react.shakeDecay = 0.19;
  custom.react.shakeMax = 21;
  custom.react.flash = 0.12;
  custom.ticks.step = 5;
  custom.alarm.threshold = 40;
  custom.alarm.pulseHz = 3.2;
  custom.layers.count = 2;
  custom.ticks.markers = false;
  custom.alarm.edge = false;
  const token = serializeBoss(custom);
  assert.match(token, /^1-/);
  const back = parseBossState(token);
  assert.ok(back && back.preset === null && same(back.params, custom));

  // reducedMotion is a local accessibility preference, never shared: a tune
  // with it flipped still shares as the same recipe
  const rmOn = cloneBossParams(BOSS_PRESETS.heavy);
  rmOn.reducedMotion = 'on';
  assert.equal(serializeBoss(rmOn), 'heavy');
  const fromToken = parseBossState(token);
  assert.equal(fromToken.params.reducedMotion, 'auto');
});

// ---- garbage tokens are rejected, defaults stand ----------------------------------------

test('advisor: malformed or out-of-range ?tune= tokens are rejected whole', () => {
  const bad = [
    '',
    '   ',
    'lighter',            // unknown preset id
    'Light',              // case must match exactly
    '1',                  // no payload
    '1-1-2',              // too few numbers
    serializeFeel(PRESETS.heavy) + '-1', // too many numbers
    '2-1-4',              // unknown version
    `1-zzzz-${serializeFeel(PRESETS.heavy).split('-').slice(2).join('-')}`, // flag mask too wide
    '1-1-999',            // frames out of slider range
    '1-1--4',             // negative / empty field
    '1-1-1e2',            // exponent notation
    '1-1-0x10',           // hex
    '1-1-nan',            // NaN spelled out
    'garbage',
    '<script>',
  ];
  for (const raw of bad) {
    assert.equal(parseFeelState(raw), null, `hit token must reject: ${JSON.stringify(raw)}`);
    assert.equal(parseBossState(raw), null, `boss token must reject: ${JSON.stringify(raw)}`);
  }
  // off-grid numbers snap onto the slider grid instead of erroring at runtime
  const nearHeavy = cloneParams(PRESETS.heavy);
  nearHeavy.hitStop.frames = 12; // nudge off the preset so the token is a full one
  const snapped = parseFeelState(serializeFeel(nearHeavy).replace('-0.62-', '-0.627-'));
  assert.ok(snapped, 'slightly off-grid value still parses');
  assert.equal(snapped.params.shake.trauma, 0.63, 'snapped to the 0.01 grid');
  // integer grids keep trailing zeros: 40 stays forty, 200 stays two hundred
  const intTune = cloneParams(PRESETS.overdone);
  intTune.hitStop.frames = 20; // off-preset so it serializes in full
  const intToken = serializeFeel(intTune);
  assert.ok(intToken.includes('-200-'), `spark count 200 survives formatting: ${intToken}`);
  assert.equal(parseFeelState(intToken).params.vfx.sparks, 200);

  // the URL reader filters characters and length before parse is even attempted
  assert.equal(readTuneParam('?tune=heavy'), 'heavy');
  assert.equal(readTuneParam('?tune=light&fx=slash'), 'light');
  assert.equal(readTuneParam(''), null);
  assert.equal(readTuneParam('?tune='), null);
  assert.equal(readTuneParam('?tune=he%20avy'), null);
  assert.equal(readTuneParam('?tune=<script>'), null);
  assert.equal(readTuneParam(`?tune=${'a'.repeat(600)}`), null);
});

test('advisor: share URL replaces only the tune param and keeps hash and others', () => {
  const url = buildShareUrl('https://pixjuice.pages.dev', '/feel/hit/', '?fx=slash&tune=old', '#screen-shake', '1-abc-4');
  assert.equal(url, 'https://pixjuice.pages.dev/feel/hit/?fx=slash&tune=1-abc-4#screen-shake');
  const cleared = buildShareUrl('https://x.dev', '/feel/', '?tune=zzz', '', '');
  assert.equal(cleared, 'https://x.dev/feel/', 'empty token drops the param');
  assert.equal(TUNE_PARAM, 'tune');
});

// ---- compare mode never touches the user's sliders --------------------------------------

test('advisor: compare mode swaps what the demo and code play, never the user tune (source lock)', () => {
  for (const page of ['./src/pages/feel-hit.ts', './src/pages/feel-boss.ts']) {
    const src = fs.readFileSync(page, 'utf8');
    // the demo receives a fresh baseline clone — the user's params object is never written to
    assert.ok(src.includes('const activeParams = ():'), `${page} has activeParams`);
    assert.match(src, /function pushDemo\(\): void \{\s*\n\s*demo\?\.setParams\(activeParams\(\)\);/, `${page} demo takes activeParams`);
    // any manual tweak returns the compare to the user's tune
    assert.match(src, /function onParamsChanged\(\): void \{\s*\n\s*\/\/ a manual tweak[\s\S]*?setCompareUi\("mine"\);/, `${page} tweaks end the baseline preview`);
    // so does picking a preset while a baseline preview is running
    assert.match(src, /setCompareUi\("mine"\); \/\/ picking a tune ends any baseline preview/, `${page} preset clicks end the baseline preview`);
    // the engine code follows the demo side: tabs are built from activeParams(),
    // and switching compare sides re-renders so the export matches what plays
    const builder = page.includes('boss') ? 'buildBossCodeTabs' : 'buildCodeTabs';
    assert.ok(src.includes(`${builder}(activeParams())`), `${page} code tracks the demo's active params`);
    assert.match(src, /pushDemo\(\);\s*\n\s*\/\/ code follows the demo side[^\n]*\n\s*renderCodebox\(\);/, `${page} compare clicks re-render the code`);
    // the panel says whose numbers it is exporting (data-export mine|base)
    assert.match(src, /dataset\.export = mode;/, `${page} syncs the export label`);
    assert.match(src, /feel\.exportBase.*feel\.exportMine|feel\.exportMine.*feel\.exportBase/, `${page} label has both states`);
    // URL state follows the user's tune only — a baseline preview never leaks
    // into the share URL
    assert.match(src, /serialize(?:Feel|Boss)\(params\)/, `${page} shares the user's tune`);
  }
  // and the pure side: a baseline clone never leaks back into serialization
  const userTune = cloneParams(PRESETS.heavy);
  userTune.hitStop.frames = 7;
  const baseline = cloneParams(DEFAULT_PARAMS);
  assert.notEqual(serializeFeel(userTune), serializeFeel(baseline));
  assert.equal(parseFeelState(serializeFeel(userTune)).params.hitStop.frames, 7);
});

test('advisor: generated code carries the demo side of the compare (repro tunes)', () => {
  // the two QA repro tunes: hit freeze 5 vs default 4, boss ghost wait 0.36 vs default 0.35
  const userHit = cloneParams(DEFAULT_PARAMS);
  userHit.hitStop.frames = 5;
  const userGd = godotHitFeel(userHit);
  assert.match(userGd, /hit_stop_seconds := 0\.083\s+# 5 frames at 60 fps/, 'user hit code exports 5 frames');
  const baseGd = godotHitFeel(DEFAULT_PARAMS);
  assert.match(baseGd, /hit_stop_seconds := 0\.067\s+# 4 frames at 60 fps/, 'default hit code exports 4 frames');
  assert.ok(!baseGd.includes('# 5 frames'), 'baseline export must not carry the hidden user number');

  const userBoss = cloneBossParams(BOSS_DEFAULT_PARAMS);
  userBoss.lag.wait = 0.36;
  assert.match(godotBossHp(userBoss), /lag_wait := 0\.36/, 'user boss code exports 0.36');
  assert.match(webBossHp(userBoss), /wait: 0\.36/, 'user web code exports 0.36');
  const baseBossGd = godotBossHp(BOSS_DEFAULT_PARAMS);
  assert.match(baseBossGd, /lag_wait := 0\.35/, 'default boss code exports 0.35');
  assert.ok(!baseBossGd.includes('lag_wait := 0.36'), 'baseline export must not carry the hidden user number');

  // switching back to "mine" means the user params again — the tune itself is
  // never overwritten by the preview, so serialization round-trips the numbers
  assert.equal(parseFeelState(serializeFeel(userHit)).params.hitStop.frames, 5);
  assert.equal(parseBossState(serializeBoss(userBoss)).params.lag.wait, 0.36);
});

// ---- problem entry links only to live routes --------------------------------------------

test('advisor: /feel/ catalog cards link only to the three live recipes', () => {
  const html = fs.readFileSync('feel/index.html', 'utf8');
  const catalog = html.slice(html.indexOf('id="recipes"'), html.indexOf('feel-more'));
  assert.ok(catalog.length > 0, 'recipe catalog exists before the folded section');
  const hrefs = [...catalog.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs.sort(), ['/feel/boss-hp/', '/feel/hit/', '/feel/jump/'], 'exactly the three live recipes are linked');
  const upcoming = html.slice(html.indexOf('feel-upcoming'), html.indexOf('feel-domains'));
  assert.ok(upcoming.length > 0, 'unreleased problems moved into the folded plan');
  assert.equal(upcoming.indexOf('<a '), -1, 'not-yet-live problems must not link anywhere');
  for (const key of ['feel.probSoonTitle', 'feel.probSoon1', 'feel.probSoon3', 'feel.probSoonNote', 'feel.componentsNote']) {
    assert.ok(upcoming.includes(`data-i18n="${key}"`) || upcoming.includes(`data-i18n-html="${key}"`), `${key} in the folded plan`);
  }
});

// ---- hookup steps + applicability limits in the generated code ---------------------------

test('advisor: generated engine code carries hookup steps and tunable-default reminders', () => {
  const gd = godotHitFeel(PRESETS.heavy);
  assert.ok(gd.includes('Hookup (Godot 4.x)'), 'godot hit: hookup steps');
  assert.ok(gd.includes('%Victim') && gd.includes('%Sparks'), 'godot hit: expected nodes listed');
  assert.match(gd, /tunable default/i, 'godot hit: tunable-default reminder');
  assert.match(gd, /retune/i, 'godot hit: retune reminder');
  assert.ok(!/heuristic/i.test(gd), 'godot hit: no per-file heuristic stamp');
  const cs = unityHitFeel(PRESETS.light);
  assert.ok(cs.includes('Hookup (Unity 6+'), 'unity hit: hookup + version limit');
  assert.match(cs, /tunable default/i, 'unity hit: tunable-default reminder');
  assert.match(cs, /retune/i, 'unity hit: retune reminder');
  const bossGd = godotBossHp(BOSS_PRESETS.heavy);
  assert.ok(bossGd.includes('Hookup (Godot 4.x)'), 'godot boss: hookup steps');
  assert.ok(bossGd.includes('TOTAL hp'), 'godot boss: threshold applicability limit');
  assert.match(bossGd, /tunable defaults — retune/i, 'godot boss: tunable-default reminder');
  assert.ok(!/\(heuristic\)/.test(bossGd), 'godot boss: no per-line heuristic stamps');
  const bossWeb = webBossHp(BOSS_PRESETS.heavy);
  assert.ok(bossWeb.includes('Hookup: open as-is'), 'web boss: hookup steps');
  assert.match(bossWeb, /tunable defaults — retune/i, 'web boss: tunable-default reminder');
});

test('advisor: IK/bones snippets say the demo plays clips, not live IK or ragdoll', () => {
  for (const [name, code] of [
    ['arm_ik.gd', godotArmIK(PRESETS.light)],
    ['local_bones.gd', godotLocalBones(PRESETS.heavy)],
    ['TwoBoneIK.cs', unityArmIK(PRESETS.light)],
  ]) {
    assert.ok(/Mixamo clips/i.test(code), `${name}: names the authored clips`);
    assert.ok(/does not run this IK|simulates no bones/i.test(code), `${name}: demo does not run it`);
  }
});

test('advisor: pages carry the localized hookup block and share/compare controls', () => {
  const hit = fs.readFileSync('feel/hit/index.html', 'utf8');
  const boss = fs.readFileSync('feel/boss-hp/index.html', 'utf8');
  for (const [page, html, keys] of [
    ['hit', hit, ['feel.hookupH', 'feel.hk1', 'feel.hk2', 'feel.hk3', 'feel.hk4']],
    ['boss', boss, ['feel.hookupH', 'boss.hk1', 'boss.hk2', 'feel.hk3', 'boss.hk4']],
  ]) {
    for (const key of keys) assert.ok(html.includes(`"${key}"`), `${page} page has ${key}`);
    for (const key of ['feel.compareLabel', 'feel.compareMine', 'feel.compareBase', 'feel.compareNote', 'feel.share', 'feel.sharedNote',
      'feel.exportPrefix', 'feel.exportMine']) {
      assert.ok(html.includes(`data-i18n="${key}"`) || html.includes(`data-i18n-aria="${key}"`), `${page} page has ${key}`);
    }
    assert.ok(html.includes('data-compare="mine"') && html.includes('data-compare="base"'), `${page} compare buttons`);
    // the code panel states which tune it is exporting (JS flips data-export + the label text)
    assert.ok(html.includes('class="cap feel-export" data-export="mine"'), `${page} export label defaults to mine`);
  }
});

// ---- the code panel labels which tune it is exporting --------------------------------------

test('advisor: the export label distinguishes my tune from the page default in every locale', async () => {
  for (const lang of ['en', 'zh', 'ja', 'ko', 'es']) {
    const dict = await loadTs(`./src/lib/locales/${lang}.ts`);
    for (const key of ['exportPrefix', 'exportMine', 'exportBase']) {
      assert.ok(dict.feel[key], `${lang} feel.${key} exists`);
    }
    assert.notEqual(dict.feel.exportMine, dict.feel.exportBase, `${lang} the two export states read differently`);
    // the compare note must say the code follows the demo preview and how to get the user's export back
    assert.match(dict.feel.compareNote, /code|代码|コード|코드|código/i, `${lang} compareNote mentions the code panel`);
  }
});

// ---- mobile layout guards: header wraps, demo stage pins under it --------------------------

test('advisor: ≤900px header wraps the nav instead of forcing sideways scroll', () => {
  const css = fs.readFileSync('src/style.css', 'utf8');
  // the old failure: overflow-x:auto on .head-in plus a max-content nav pushed a
  // horizontal scrollbar onto every ~390px phone
  assert.ok(!/\.head \.head-in\{[^}]*overflow-x\s*:\s*auto/.test(css), 'no overflow-x:auto scroll on .head-in');
  assert.ok(!/\.head \.nav\{[^}]*width\s*:\s*max-content/.test(css), 'nav is not forced to max-content width');
  // the replacement: the stacked header wraps its nav (every item stays reachable)
  // and the document itself refuses sideways scroll
  const mobile = css.slice(css.indexOf('@media(max-width:900px)'));
  assert.match(mobile, /\.head \.nav\{[^}]*flex-wrap:\s*wrap/, '≤900px nav wraps');
  assert.match(mobile, /html\{overflow-x:clip\}/, 'document clips horizontal overflow at ≤900px');
});

test('advisor: feel demo stays pinned — stage on ≤1020px, demo card on desktop', () => {
  const css = fs.readFileSync('src/pages/feel.css', 'utf8');
  const wide = css.slice(css.indexOf('@media (max-width: 1020px)'), css.indexOf('@media (max-width: 620px)'));
  assert.ok(wide.length > 0, '1020px block exists before the 620px one');
  assert.match(wide, /\.feel-stage\s*\{[\s\S]*?position:\s*sticky/, 'stage pins on narrow screens');
  assert.match(wide, /top:\s*var\(--head-h,\s*88px\)/, 'stage top offset follows the sticky header height');
  // Desktop: only the demo card pins, below the sticky site header. The whole
  // side column (demo + code) used to be the sticky box — taller than the
  // viewport, its sticky range ran out mid-parameter-list and let the demo
  // scroll away (the t444u "布局差" report). The column now stretches to the
  // layer list instead, so the card's sticky range reaches the last slider.
  assert.match(css, /\.feel-demo-card\s*\{[\s\S]*?position:\s*sticky/, 'demo card pins on desktop');
  assert.match(css, /\.feel-demo-card\s*\{[\s\S]*?top:\s*calc\(var\(--head-h,\s*88px\)\s*\+\s*14px\)/, 'pinned card sits below the header');
  assert.match(css, /\.feel-side\s*\{[\s\S]*?align-self:\s*stretch/, 'side column stretches to the layer list height');
  assert.ok(!/\.feel-side\s*\{[^}]*position:\s*sticky/.test(css), 'the whole side column is no longer the sticky box');
  // the pages keep the real wrapped header height in --head-h
  for (const page of ['./src/pages/feel-hit.ts', './src/pages/feel-boss.ts']) {
    assert.ok(fs.readFileSync(page, 'utf8').includes('syncHeaderOffset()'), `${page} measures the header height`);
  }
  // the stage groups the canvas/bar with its attack row in both demo cards
  for (const page of ['feel/hit/index.html', 'feel/boss-hp/index.html']) {
    const html = fs.readFileSync(page, 'utf8');
    assert.ok(html.includes('<div class="feel-stage">'), `${page} wraps a feel-stage`);
    assert.match(html, /feel-stage[\s\S]*?feel-attack|feel-stage[\s\S]*?boss-actions/, `${page} stage carries the attack row`);
  }
});

// ---- every key used by the touched pages exists in all five locales ----------------------

test('advisor: every data-i18n key on the three feel pages exists in all five locales', async () => {
  const lookup = (dict, key) => key.split('.').reduce((v, k) => (v && typeof v === 'object') ? v[k] : undefined, dict);
  for (const page of ['feel/index.html', 'feel/hit/index.html', 'feel/boss-hp/index.html']) {
    const html = fs.readFileSync(page, 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:-html|-aria)?="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(keys.length > 30, `${page} uses i18n keys`);
    for (const lang of ['en', 'zh', 'ja', 'ko', 'es']) {
      const dict = await loadTs(`./src/lib/locales/${lang}.ts`);
      for (const key of keys) {
        assert.notEqual(lookup(dict, key), undefined, `${lang} missing ${key} (${page})`);
        assert.notEqual(lookup(dict, key), '', `${lang} empty ${key} (${page})`);
      }
    }
  }
});

test('advisor: hit FAQ states clip playback honestly in every locale', async () => {
  for (const lang of ['en', 'zh', 'ja', 'ko', 'es']) {
    const dict = await loadTs(`./src/lib/locales/${lang}.ts`);
    const a = dict.feel.faq1a;
    assert.ok(a, `${lang} feel.faq1a exists`);
    assert.match(a, /clip|クリップ|片段|클립/i, `${lang} FAQ names the clips`);
    assert.match(a, /IK/, `${lang} FAQ mentions IK`);
    assert.match(a, /ragdoll|布娃娃|ラグドール|래그돌|ragdoll/i, `${lang} FAQ mentions ragdoll`);
  }
});

// ---- slider values are labeled tunable defaults, not per-layer "heuristics" ----------------

test('advisor: slider values read as tunable defaults in every locale', async () => {
  const banned = /heuristic|heurístico|経験値|경험값/i;
  for (const lang of ['en', 'zh', 'ja', 'ko', 'es']) {
    const dict = await loadTs(`./src/lib/locales/${lang}.ts`);
    // the badge next to every slider
    assert.ok(dict.feel.recTag, `${lang} feel.recTag exists`);
    assert.ok(!banned.test(dict.feel.recTag), `${lang} recTag is not "heuristic/经验值": ${dict.feel.recTag}`);
    // layer rec paragraphs: citations stay, "heuristics" stamps are gone
    for (const key of ['l1rec', 'l2rec', 'l3rec', 'l4rec', 'l5rec', 'l6rec']) {
      assert.ok(!banned.test(dict.feel[key]), `${lang} feel.${key} has no heuristic stamp`);
    }
    for (const key of ['bl1rec', 'bl2rec', 'bl3rec', 'bl4rec', 'bl5rec']) {
      assert.ok(!banned.test(dict.boss[key]), `${lang} boss.${key} has no heuristic stamp`);
    }
    assert.ok(!banned.test(dict.feel.hk3), `${lang} feel.hk3 has no heuristic stamp`);
    // the ONE honesty note carries the retune reminder and the oral-tradition caveat
    const note = dict.feel.sourcesNote;
    assert.match(note, /default|默认值|デフォルト|기본값|predeterminado/i, `${lang} sourcesNote says defaults`);
    assert.match(note, /retune|重调|再調整|다시 조정|reajust/i, `${lang} sourcesNote says retune`);
  }
  // the citations themselves were not mechanically rewritten
  const en = await loadTs('./src/lib/locales/en.ts');
  for (const [key, anchor] of [
    ['l1rec', 'Song 2005'], ['l2rec', 'Nijman (2013)'], ['l3rec', 'Jonasson'],
    ['l4rec', 'Song 2005; Nijman 2013'], ['l5rec', 'Kao (2020)'], ['l6rec', 'Lin et al. (2022)'],
    ['bl1rec', 'boss-bar practice'], ['bl2rec', 'Nijman 2013; Song 2005'],
  ]) {
    assert.ok(en.feel[key]?.includes(anchor) || en.boss[key]?.includes(anchor), `en ${key} keeps the ${anchor} citation`);
  }
  assert.match(en.feel.l1rec, /SmashWiki/, 'l1rec keeps the SmashWiki citation');
  assert.match(en.boss.sources, /WCAG 2\.2/, 'boss sources keep the WCAG citation');
});

// Run the actual page modules in Node. Stub DOM, clipboard and demo boundaries
// so the compare, tab, slider, share and copy handlers run without a browser.
class PageElement {
  children = [];
  dataset = {};
  listeners = new Map();
  classList = { toggle() {}, remove() {} };

  constructor(tag) {
    this.tag = tag;
  }

  setAttribute(name, value) {
    if (name === 'value') this.value = value;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[key] = value;
    }
  }

  removeAttribute() {}
  closest() { return null; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelector(tag) {
    for (const child of this.children) {
      if (child.tag === tag) return child;
      const nested = child.querySelector(tag);
      if (nested) return nested;
    }
  }
  querySelectorAll() { return []; }

  addEventListener(event, handler) {
    this.listeners.set(event, handler);
  }

  fire(event) {
    return this.listeners.get(event)({ target: this });
  }
}

for (const recipe of [
  {
    name: 'hit', route: 'hit', codebox: '#feel-codebox',
    token: '1-4jj-5-0.18-3.4-0.35-0.3-1-0.55-0.14-40-0.5',
    path: 'hitStop.frames', slider: 'feelSlider', edited: 7, baseline: 4,
    editedToken: '1-4jj-7-0.18-3.4-0.35-0.3-1-0.55-0.14-40-0.5',
    paramsFile: 'params', defaultsName: 'DEFAULT_PARAMS', preset: PRESETS.light,
    parse: parseFeelState, clone: cloneParams, codegen: 'codegen',
    engines: [
      [godotHitFeel, [/hit_stop_seconds := 0\.067\s+# 4 frames/, /hit_stop_seconds := 0\.083\s+# 5 frames/, /hit_stop_seconds := 0\.117\s+# 7 frames/]],
      [unityHitFeel, [/hitStopSeconds = 0\.067f;\s+\/\/ 4 frames/, /hitStopSeconds = 0\.083f;\s+\/\/ 5 frames/, /hitStopSeconds = 0\.117f;\s+\/\/ 7 frames/]],
    ],
  },
  {
    name: 'boss', route: 'boss-hp', codebox: '#boss-codebox',
    token: '1-3j-0.36-0.45-0.27-14-0.08-10-25-2.5-3',
    path: 'lag.wait', slider: 'bossSlider', edited: 0.4, baseline: 0.35,
    editedToken: '1-3j-0.4-0.45-0.27-14-0.08-10-25-2.5-3',
    paramsFile: 'boss-params', defaultsName: 'BOSS_DEFAULT_PARAMS', preset: BOSS_PRESETS.heavy,
    parse: parseBossState, clone: cloneBossParams, codegen: 'boss-codegen',
    engines: [
      [godotBossHp, [/lag_wait := 0\.35\b/, /lag_wait := 0\.36\b/, /lag_wait := 0\.40?\b/]],
      [webBossHp, [/lag: \{ wait: 0\.35,/, /lag: \{ wait: 0\.36,/, /lag: \{ wait: 0\.40?,/]],
    ],
  },
]) {
  test(`advisor: ${recipe.name} page events preserve defaults and export the active tune`, async (ctx) => {
    const [group, field] = recipe.path.split('.');
    const location = new URL(`http://localhost/zh/feel/${recipe.route}/?tune=${recipe.token}&v=COMPAREFIX2`);
    const mounts = new Map();
    const inputs = [];
    const compare = ['mine', 'base'].map(mode => {
      const button = new PageElement('button');
      button.dataset.compare = mode;
      return button;
    });
    let clipboard;
    let userParams;
    let demoParams;
    let finishDemo;
    const demoReady = new Promise(resolve => { finishDemo = resolve; });
    const fixture = {
      document: {
        createElement(tag) {
          const element = new PageElement(tag);
          if (tag === 'input') inputs.push(element);
          return element;
        },
        querySelector(selector) {
          if (!mounts.has(selector)) mounts.set(selector, new PageElement('div'));
          return mounts.get(selector);
        },
        querySelectorAll(selector) {
          return selector === '.feel-compare-btn' ? compare : [];
        },
      },
      location,
      history: { replaceState(_state, _title, url) { location.href = new URL(url, location).href; } },
      navigator: { clipboard: { async writeText(value) { clipboard = value; } } },
      window: { setTimeout() {} },
      setTimeout() {},
      createDemo(_host, params) {
        userParams = params;
        demoParams = recipe.clone(params);
        finishDemo();
        return {
          setParams(active) { demoParams = recipe.clone(active); },
          setZone() {}, onZonePick() {}, onImpact() {}, attack() {},
        };
      },
    };

    // Fresh params module per page so a broken boot cannot pollute other tests.
    const paramsUrl = dataUrl(`./src/feel/${recipe.paramsFile}.ts`) + '#page-replay';
    const defaults = (await import(paramsUrl))[recipe.defaultsName];
    assert.equal(defaults[group][field], recipe.baseline);
    const fixtureKey = `advisorPageFixture_${recipe.name}`;
    const demoUrl = moduleUrl(`export const createBossBar = globalThis.${fixtureKey}.createDemo;
      export const createFeelDemo = createBossBar;`);
    const noopUrl = moduleUrl(`export const applyStaticText = () => {}, mountLangSwitcher = () => {},
      onLocaleChange = () => {}, mountToolsMenu = () => {}, syncHeaderOffset = () => {}, t = key => key;
      export class ImpactAudio { resume() {} }`);
    globalThis[fixtureKey] = fixture;
    try {
      await loadTs(`./src/pages/feel-${recipe.name}.ts`, null, {
        '../style.css': moduleUrl(''), '../templates/templates.css': moduleUrl(''), './feel.css': moduleUrl(''),
        '../lib/i18n': noopUrl, '../lib/navmenu': noopUrl, '../lib/header-offset': noopUrl, '../feel/sfx': noopUrl,
        '../lib/el': dataUrl('./src/lib/el.ts', {}, `const { document } = globalThis.${fixtureKey};\n`),
        '../feel/demo': demoUrl, '../feel/boss-demo': demoUrl,
        [`../feel/${recipe.paramsFile}`]: paramsUrl,
        [`../feel/${recipe.codegen}`]: dataUrl(`./src/feel/${recipe.codegen}.ts`, shareDeps),
        '../feel/share': dataUrl('./src/feel/share.ts', {
          ...shareDeps, [`./${recipe.paramsFile}`]: paramsUrl,
        }),
      }, `const { document, location, history, navigator, window, setTimeout } = globalThis.${fixtureKey};\n`);
      await demoReady;
      await new Promise(setImmediate); // let the hit page finish its lazy demo mount

      const codebox = mounts.get(recipe.codebox);
      const slider = inputs.find(element => element.dataset[recipe.slider] === recipe.path);
      const share = mounts.get('.feel-share');
      async function checkStep(token, active, expectedIndex) {
        assert.deepEqual(userParams, recipe.parse(token).params);
        assert.equal(Number(slider.value), userParams[group][field]);
        await share.fire('click');
        assert.equal(new URL(clipboard).searchParams.get('tune'), token);
        assert.equal(location.searchParams.get('tune'), token);
        assert.equal(location.searchParams.get('v'), 'COMPAREFIX2');

        const exports = [];
        for (const [index, [generate, markers]] of recipe.engines.entries()) {
          await codebox.children[0].children[index].fire('click');
          const displayed = codebox.children[3].querySelector('code').textContent;
          clipboard = undefined;
          await codebox.children[2].querySelector('button').fire('click');
          assert.equal(clipboard, displayed, 'Copy writes the displayed code');
          exports.push({ displayed, generate, markers });
        }
        if (expectedIndex === 0) {
          ctx.diagnostic(`default export (display and Copy): ${exports.map(({ displayed, markers }) =>
            markers.map(marker => displayed.match(marker)?.[0]).find(Boolean)).join(' | ')}`);
        }
        for (const { displayed, generate, markers } of exports) {
          assert.match(displayed, markers[expectedIndex]);
          for (const marker of markers.filter((_, i) => i !== expectedIndex)) {
            assert.doesNotMatch(displayed, marker);
          }
          assert.equal(displayed, generate(active));
        }
        assert.deepEqual(demoParams, active);
      }

      ctx.diagnostic(`boot: same object=${userParams === defaults}, exported default=${defaults[group][field]}, baseline clone=${recipe.clone(defaults)[group][field]}, preset=${recipe.preset[group][field]}`);
      const pristine = recipe.clone(recipe.preset);
      const initial = recipe.parse(recipe.token).params;
      const edited = recipe.parse(recipe.editedToken).params;
      await checkStep(recipe.token, initial, 1);
      await compare[1].fire('click');
      await checkStep(recipe.token, pristine, 0);
      await compare[0].fire('click');
      await checkStep(recipe.token, initial, 1);
      slider.value = String(recipe.edited);
      await slider.fire('input');
      await checkStep(recipe.editedToken, edited, 2);
      await compare[1].fire('click');
      await checkStep(recipe.editedToken, pristine, 0);
      assert.notEqual(userParams, defaults);
      assert.deepEqual(defaults, pristine);
    } finally {
      delete globalThis[fixtureKey];
    }
  });
}
