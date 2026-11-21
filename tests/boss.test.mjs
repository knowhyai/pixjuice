import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Same TS-loading trick as feel.test.mjs: transpile, import as a data URL.
// `deps` rewrites runtime imports (codegens import ./boss-params as a value,
// unlike feel's type-only imports) to the dependency's own data URL.
async function loadTs(path, name = 'default', deps = {}) {
  let src = fs.readFileSync(path, 'utf8');
  for (const [spec, url] of Object.entries(deps)) {
    src = src.replaceAll(`from "${spec}"`, `from "${url}"`).replaceAll(`from '${spec}'`, `from "${url}"`);
  }
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
  return name ? mod[name] ?? mod : mod;
}

const paramsUrl = (() => {
  const out = ts.transpileModule(fs.readFileSync('./src/feel/boss-params.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText;
  return 'data:text/javascript;base64,' + Buffer.from(out).toString('base64');
})();

const { BOSS_PRESETS, BOSS_DEFAULT_PARAMS, BOSS_SLIDERS, BOSS_LAYER_IDS, cloneBossParams } = await loadTs('./src/feel/boss-params.ts');
const { godotBossHp, webBossHp, buildBossCodeTabs } = await loadTs('./src/feel/boss-codegen.ts', 'default', { './boss-params': paramsUrl });
const gd = (path) => godotBossHp(path);
const web = (path) => webBossHp(path);

const inRange = (v, meta) => v >= meta.min && v <= meta.max && Math.abs(v / meta.step - Math.round(v / meta.step)) < 1e-6;

test('boss: five layers with the documented tunable defaults', () => {
  assert.equal(BOSS_LAYER_IDS.length, 5);
  assert.deepEqual([...BOSS_LAYER_IDS], ['lag-bar', 'hit-react', 'scale-ticks', 'hp-layers', 'low-alarm']);
  const d = BOSS_DEFAULT_PARAMS;
  // the page boots on the full recipe with the tunable default values
  assert.equal(d.lag.wait, 0.35);
  assert.equal(d.lag.catch, 0.45);
  assert.equal(d.react.shakeDecay, 0.27);
  assert.equal(d.react.shakeMax, 14);
  assert.equal(d.react.flash, 0.08);
  assert.equal(d.ticks.step, 10);
  assert.equal(d.ticks.markers, true);
  assert.equal(d.layers.on, true);
  assert.equal(d.layers.count, 3);
  assert.equal(d.alarm.threshold, 25);
  assert.equal(d.alarm.pulseHz, 2.5);
  assert.equal(d.alarm.edge, true);
  assert.equal(d.reducedMotion, 'auto');
  // every layer is independently switchable and stacks with the others
  for (const layer of ['lag', 'react', 'ticks', 'layers', 'alarm']) assert.equal(typeof d[layer].on, 'boolean');
});

test('boss: presets stay inside slider ranges and are distinct recipes', () => {
  const check = (p, id) => {
    assert.ok(inRange(p.lag.wait, BOSS_SLIDERS.wait), `${id} wait`);
    assert.ok(inRange(p.lag.catch, BOSS_SLIDERS.catch), `${id} catch`);
    assert.ok(inRange(p.react.shakeDecay, BOSS_SLIDERS.shakeDecay), `${id} decay`);
    assert.ok(inRange(p.react.shakeMax, BOSS_SLIDERS.shakeMax), `${id} maxpx`);
    assert.ok(inRange(p.react.flash, BOSS_SLIDERS.flash), `${id} flash`);
    assert.ok(inRange(p.ticks.step, BOSS_SLIDERS.step), `${id} step`);
    assert.ok(inRange(p.layers.count, BOSS_SLIDERS.count), `${id} count`);
    assert.ok(inRange(p.alarm.threshold, BOSS_SLIDERS.threshold), `${id} threshold`);
    assert.ok(inRange(p.alarm.pulseHz, BOSS_SLIDERS.pulseHz), `${id} hz`);
  };
  for (const [id, p] of Object.entries(BOSS_PRESETS)) check(p, id);
  // light is the restrained variant, heavy is the full default recipe
  assert.notEqual(BOSS_PRESETS.light.layers.on, BOSS_PRESETS.heavy.layers.on);
  assert.ok(BOSS_PRESETS.light.react.shakeMax < BOSS_PRESETS.heavy.react.shakeMax);
  assert.ok(!BOSS_PRESETS.light.alarm.edge && BOSS_PRESETS.heavy.alarm.edge);
  assert.equal(BOSS_DEFAULT_PARAMS.lag.wait, BOSS_PRESETS.heavy.lag.wait);
  // cloning must be deep — mutating a clone never leaks into the preset
  const c = cloneBossParams(BOSS_PRESETS.heavy);
  c.alarm.pulseHz = 5;
  assert.equal(BOSS_PRESETS.heavy.alarm.pulseHz, 2.5);
});

test('boss: godot code mirrors the live parameters', () => {
  const code = gd(BOSS_PRESETS.heavy);
  assert.ok(code.includes('extends Control'));
  assert.ok(code.includes('lag_wait := 0.35'), 'lag wait exported');
  assert.ok(code.includes('lag_catch := 0.45'), 'lag catch exported');
  assert.ok(code.includes('shake_decay := 0.27'));
  assert.ok(code.includes('shake_max_px := 14'));
  assert.ok(code.includes('flash_seconds := 0.08'));
  assert.ok(code.includes('tick_step_percent := 10'));
  assert.ok(code.includes('alarm_threshold := 25'));
  assert.ok(code.includes('alarm_hz := 2.5'));
  assert.ok(code.includes('max_layers := 3'));
  // tween hygiene: a new hit kills the pending ghost tween before restarting
  assert.ok(code.includes('_lag_tween.kill()'));
  assert.ok(code.includes('tween_interval(lag_wait)'));
  assert.ok(code.includes('tween_property(lag_fill, "size:x"'));
  assert.ok(code.includes('reduce_motion'), 'reduced-motion escape hatch exported');
  // three layer colors, outermost first (index 0 = full HP, purple)
  assert.ok(
    code.includes('layer_colors: Array[Color] = [Color("#9d7bff"), Color("#ff9a3d"), Color("#ff4d5e")]'),
    'layer color order must match the demo mapping',
  );

  // toggles flip the generated script
  const off = cloneBossParams(BOSS_PRESETS.heavy);
  off.lag.on = false;
  const gdOff = gd(off);
  assert.ok(gdOff.includes('delayed_bar_on := false'));
  assert.ok(!gdOff.includes('_ghost_chase()'), 'lag off removes the ghost call');
  const quiet = cloneBossParams(BOSS_PRESETS.heavy);
  quiet.alarm.edge = false;
  assert.ok(gd(quiet).includes('alarm_screen_edge := false'));

  // sliders resync the export
  const tuned = cloneBossParams(BOSS_PRESETS.heavy);
  tuned.lag.wait = 0.6;
  const gdTuned = gd(tuned);
  assert.ok(gdTuned.includes('lag_wait := 0.6'));
  assert.ok(!gdTuned.includes('lag_wait := 0.35'));
});

test('boss: godot ghost chases the POST-hit fill (lag-convergence regression)', () => {
  // Shipped bug: take_damage called _ghost_chase() BEFORE _layout(), so the
  // tween targeted the pre-hit width and the ghost never caught the fill
  // (measured: lag 640 px vs fill 512 px a full second after one hit).
  const code = gd(BOSS_PRESETS.heavy);
  const dmg = code.slice(code.indexOf('func take_damage'), code.indexOf('func heal'));
  assert.ok(dmg.trim().length > 0, 'take_damage slice sanity');
  assert.ok(
    dmg.indexOf('_layout()') < dmg.indexOf('_ghost_chase('),
    '_layout() must run before _ghost_chase() so the target is the post-hit fill',
  );
  assert.ok(dmg.includes('_ghost_chase(broke)'), 'chase receives the layer-break flag');
  // the ghost only animates while the layer is on, hp remains, and motion is allowed
  assert.ok(
    dmg.includes('if delayed_bar_on and hp > 0.0 and not reduce_motion:'),
    'chase is guarded by layer toggle, hp > 0 (no zombie tween on a kill shot) and reduced motion',
  );
  const ghost = code.slice(code.indexOf('func _ghost_chase'), code.indexOf('func _shake_impulse'));
  assert.ok(ghost.includes('tween_property(lag_fill, "size:x", fill.size.x'), 'tween targets the fill width');
  assert.ok(!ghost.includes('var target :='), 'no pre-captured stale target variable');
  assert.ok(
    ghost.includes('lag_fill.size.x = track.size.x'),
    'a broken layer resets the ghost to the top of the new layer (matches the demo/web: shown = 100 on break)',
  );
});

test('boss: godot heal, setup, resize and reduced-motion keep the ghost honest', () => {
  const code = gd(BOSS_PRESETS.heavy);
  const heal = code.slice(code.indexOf('func heal'), code.indexOf('func active_layer'));
  assert.ok(heal.includes('_lag_tween.kill()'), 'heal kills a pending ghost tween');
  assert.ok(
    heal.includes('lag_fill.size.x = fill.size.x'),
    'heal snaps the ghost onto the grown fill (a kill alone left the stale width forever)',
  );
  const setup = code.slice(code.indexOf('func setup'), code.indexOf('func take_damage'));
  assert.ok(setup.includes('_lag_tween.kill()'), 'setup (reset) kills a pending ghost tween');
  assert.ok(setup.includes('lag_fill.size.x = fill.size.x'), 'setup re-anchors the ghost (setup(0.5) bug)');
  assert.ok(code.includes('track.resized.connect(_on_track_resized)'), 'live track resize is handled');
  const resize = code.slice(code.indexOf('func _on_track_resized'), code.indexOf('func _process'));
  assert.ok(resize.includes('_lag_tween.kill()') && resize.includes('lag_fill.size.x = fill.size.x'),
    'resize re-derives both bars so no stale ghost pixels survive');
  // reduced motion: snap, never animate — including a mid-chase flip
  assert.ok(
    code.includes('not reduce_motion else fill.size.x'),
    '_layout snaps the ghost when motion is reduced (or the boss is dead)',
  );
  assert.ok(code.includes('set(value):') && code.includes('is_node_ready()'),
    'reduce_motion is a setter that drops the in-flight ghost when flipped on');
});

test('boss: web export lag machine stays ordered like the demo (lock)', () => {
  // The web export never had the ordering bug — lock the ordering so it stays
  // that way: the chase target must be captured AFTER the hp update.
  const code = web(BOSS_PRESETS.heavy);
  const apply = code.slice(code.indexOf('apply(next, healed)'), code.indexOf('damage(u)'));
  assert.ok(apply.trim().length > 0, 'apply slice sanity');
  assert.ok(apply.indexOf('this.hp =') < apply.indexOf('this.target = this.pct()'),
    'target is the post-update pct');
  assert.ok(apply.includes('this.shown = broke ? 100'), 'layer breaks refill the ghost to the top');
  assert.ok(apply.includes('this.shown = this.pct()'), 'heal / reduced motion snap the ghost');
  const frame = code.slice(code.indexOf('frame(now)'), code.indexOf('const bar ='));
  assert.ok(frame.includes('this.shown = this.target'), 'the chase always terminates on the target');
});

test('boss: web export is a self-contained page honoring reduced motion', () => {
  const code = web(BOSS_PRESETS.heavy);
  assert.ok(code.startsWith('<!doctype html>'));
  assert.ok(code.includes('<style>') && code.includes('<script>'));
  assert.ok(code.includes('prefers-reduced-motion'), 'OS preference honored');
  assert.ok(code.includes('matchMedia'));
  assert.ok(code.includes('--alarm-hz: 2.5'), 'pulse rate synced into CSS');
  assert.ok(code.includes('lag: { wait: 0.35, catch: 0.45 }'), 'lag config synced');
  assert.ok(code.includes('decay: 0.27, maxPx: 14, flash: 0.08'), 'react config synced');
  assert.ok(code.includes("left:25%") && code.includes('left:50%') && code.includes('left:75%'), 'quarter markers present');
  assert.ok(code.includes('left:10%'), '10% ticks present');
  assert.ok(code.includes('#9d7bff') && code.includes('#ff9a3d') && code.includes('#ff4d5e'), 'layer colors synced');
  assert.ok(code.includes('role="progressbar"'));

  const off = cloneBossParams(BOSS_PRESETS.heavy);
  off.lag.on = false;
  assert.ok(web(off).includes('lag: null'), 'lag off nulls the config');
  off.ticks.on = false;
  const webOff = web(off);
  assert.ok(!webOff.includes('class="tick"'), 'ticks off removes tick markup');
  off.layers.on = false;
  assert.ok(web(off).includes('layers: 1'), 'layered bar off collapses to one layer');
});

test('boss: buildBossCodeTabs yields two substantial, distinct snippets', () => {
  const tabs = buildBossCodeTabs(BOSS_PRESETS.heavy);
  assert.equal(tabs.length, 2);
  assert.equal(new Set(tabs.map((x) => x.engine)).size, 2);
  for (const tab of tabs) assert.ok(tab.code.length > 2500, `${tab.label} has body`);
  assert.ok(tabs.some((x) => x.label === 'boss_hp_bar.gd'));
  assert.ok(tabs.some((x) => x.label === 'boss-bar.html'));
});

test('boss: page wiring (vite, localize, sitemap, index card)', () => {
  assert.ok(fs.readFileSync('vite.config.ts', 'utf8').includes('feel/boss-hp/index.html'), 'vite input');
  const loc = fs.readFileSync('scripts/localize-pages.mjs', 'utf8');
  assert.ok(loc.includes("'feel/boss-hp/'"), 'localize path');
  assert.ok(loc.includes("'feelBoss'"), 'localize SEO key');
  assert.ok(fs.readFileSync('public/sitemap.xml', 'utf8').includes('/feel/boss-hp/'), 'sitemap entry');
  assert.ok(fs.readFileSync('feel/index.html', 'utf8').includes('href="/feel/boss-hp/"'), 'recipe card link');
  const html = fs.readFileSync('feel/boss-hp/index.html', 'utf8');
  assert.ok(html.includes('width=device-width'), 'viewport meta');
  for (const anchor of BOSS_LAYER_IDS) assert.ok(html.includes(`id="${anchor}"`), `anchor #${anchor}`);
});

test('boss: every data-i18n key on the page exists in all five locales', async () => {
  const html = fs.readFileSync('feel/boss-hp/index.html', 'utf8');
  const keys = [...html.matchAll(/data-i18n(?:-html|-aria)?="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(keys.length > 30, 'page actually uses i18n keys');
  const lookup = (dict, key) => key.split('.').reduce((v, k) => (v && typeof v === 'object') ? v[k] : undefined, dict);
  for (const lang of ['en', 'zh', 'ja', 'ko', 'es']) {
    const dict = await loadTs(`./src/lib/locales/${lang}.ts`);
    for (const key of keys) {
      assert.notEqual(lookup(dict, key), undefined, `${lang} missing ${key}`);
      assert.notEqual(lookup(dict, key), '', `${lang} empty ${key}`);
    }
    // FAQ + SEO keys used by the static localization pass
    for (const key of ['feelBoss.h1', 'feelBoss.lede', 'boss.faq1q', 'boss.faq1a', 'boss.faq2q', 'boss.faq2a', 'boss.faq3q', 'boss.faq3a']) {
      assert.ok(lookup(dict, key), `${lang} missing ${key}`);
    }
  }
});

test('boss: no fixed width in the feel styles can overflow a 390px phone', () => {
  const css = fs.readFileSync('src/pages/feel.css', 'utf8');
  const widths = [...css.matchAll(/(?:^|\s)(?:min-)?width:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  assert.ok(widths.length > 0, 'regex sanity');
  for (const w of widths) assert.ok(w <= 390, `fixed width ${w}px exceeds a 390px viewport`);
  // the side column is 430px on desktop but collapses to one column under 1020px
  assert.ok(css.includes('@media (max-width: 1020px)'), 'desktop grid must collapse');
});

test('hit demo: whitewash and flash-isolation fixes stay in place', () => {
  const src = fs.readFileSync('src/feel/demo.ts', 'utf8');
  assert.ok(src.includes('ACESFilmicToneMapping'), 'filmic tone mapping (overexposure fix)');
  assert.ok(src.includes('environmentIntensity = 0.45'), 'rebalanced env light');
  assert.ok(src.includes('(m as THREE.Material).clone()'), 'per-knight material instances');
  assert.ok(src.includes('SLASH_ANTICIPATION'), 'slash windup trim');
  assert.ok(src.includes('sparkTex'), 'soft spark sprite');
});
