import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Headless functional test for the boss-bar state machine. A tiny fake DOM
// (just what boss-demo.ts touches) plus a manual rAF pump — no browser, no
// screenshots, just the engine math: repeated hits, layer crossings both ways,
// 0 HP, reset, live parameter edits and reduced motion.

const transpile = (src) =>
  ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const dataUrl = (src) => 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');

// ---- fake DOM (installed before importing boss-demo — it reads window.matchMedia at module scope)

function fakeElement(tag) {
  const el = {
    tagName: tag,
    className: '',
    textContent: '',
    children: [],
    style: {
      setProperty(k, v) {
        this[k] = v;
      },
      getPropertyValue(k) {
        return this[k] ?? '';
      },
    },
    classList: {
      toggle(name, force) {
        const s = new Set(el.className.split(/\s+/).filter(Boolean));
        const on = force === undefined ? !s.has(name) : Boolean(force);
        if (on) s.add(name);
        else s.delete(name);
        el.className = [...s].join(' ');
        return on;
      },
      add(name) {
        const s = new Set(el.className.split(/\s+/).filter(Boolean));
        s.add(name);
        el.className = [...s].join(' ');
      },
      remove(name) {
        const s = new Set(el.className.split(/\s+/).filter(Boolean));
        s.delete(name);
        el.className = [...s].join(' ');
      },
      contains(name) {
        return el.className.split(/\s+/).includes(name);
      },
    },
    append(...kids) {
      el.children.push(...kids);
    },
    replaceChildren() {
      el.children.length = 0;
    },
    remove() {},
    setAttribute(k, v) {
        el[k] = v;
    },
    getAttribute(k) {
      return el[k] ?? null;
    },
    addEventListener() {},
    removeEventListener() {},
    dataset: {},
  };
  return el;
}

let now = 0;
const rafQueue = [];
globalThis.performance = { now: () => now };
globalThis.requestAnimationFrame = (cb) => (rafQueue.push(cb), rafQueue.length);
globalThis.cancelAnimationFrame = () => {};
globalThis.document = { createElement: fakeElement };
globalThis.window = globalThis;
// one shared, mutable query object — the module captures it at import, tests
// flip `.matches` to simulate the OS preference
const sharedRmQuery = { matches: false, addEventListener() {}, removeEventListener() {} };
globalThis.matchMedia = () => sharedRmQuery;

const paramsUrl = dataUrl(transpile(fs.readFileSync('./src/feel/boss-params.ts', 'utf8')));
const demoSrc = fs.readFileSync('./src/feel/boss-demo.ts', 'utf8').replaceAll('from "./boss-params"', `from "${paramsUrl}"`);
const { createBossBar } = await import(dataUrl(transpile(demoSrc)));
const { BOSS_PRESETS, cloneBossParams } = await import(paramsUrl);

/** advance `ms` of wall time in 16ms frames, draining the rAF queue */
function pump(ms) {
  const end = now + ms;
  while (now < end) {
    now += 16;
    const queue = rafQueue.splice(0);
    for (const cb of queue) cb(now);
  }
}

function mount(params) {
  const host = fakeElement('div');
  const demo = createBossBar(host, params);
  const stage = host.children[0];
  const zone = stage.children.find((c) => c.tagName === 'div' && c.className.includes('feel-boss-zone'));
  const track = zone.children.find((c) => c.className.includes('feel-boss-track'));
  const fill = track.children.find((c) => c.className.includes('feel-boss-fill'));
  const lag = track.children.find((c) => c.className.includes('feel-boss-lag'));
  const badge = zone.children[0].children.find((c) => c.className.includes('feel-boss-badge'));
  const ticks = track.children.find((c) => c.className.includes('feel-boss-ticks'));
  const edge = stage.children.find((c) => c.className.includes('feel-boss-edge'));
  return { demo, stage, zone, track, fill, lag, badge, ticks, edge, host };
}

const pct = (el) => Number.parseFloat(el.style.width);

// ---- tests ------------------------------------------------------------------------

test('boss demo: boot state — full bar, ×3 badge, ticks + markers, aria', () => {
  const d = mount(cloneBossParams(BOSS_PRESETS.heavy));
  pump(100);
  assert.equal(d.track.getAttribute('aria-valuenow'), '100');
  assert.equal(pct(d.fill), 100);
  assert.equal(d.badge.textContent, '×3');
  assert.equal(d.fill.style.background, '#9d7bff'); // outermost layer is purple
  assert.equal(d.ticks.children.filter((c) => c.className === 'feel-boss-tick').length, 9); // 10..90
  assert.equal(d.ticks.children.filter((c) => c.className === 'feel-boss-mark').length, 3); // 25/50/75
  assert.ok(!d.stage.classList.contains('is-alarm'));
  d.demo.dispose();
});

test('boss demo: white bar holds through the wait, then catches up', () => {
  const d = mount(cloneBossParams(BOSS_PRESETS.heavy)); // wait .35 catch .45
  d.demo.damage(30);
  pump(60); // inside the 350 ms hold
  assert.ok(Math.abs(pct(d.fill) - 70) < 0.01, 'fill drops immediately');
  assert.equal(pct(d.lag), 100, 'ghost still at the pre-hit value during hold');
  pump(300); // hold elapsed (t≈0.36s), chase barely started
  assert.ok(pct(d.lag) > 80, `ghost is chasing, not snapped (${pct(d.lag)})`);
  pump(600); // chase (.45 s) long done
  assert.ok(Math.abs(pct(d.lag) - 70) < 0.5, `ghost caught up (${pct(d.lag)})`);
  d.demo.dispose();
});

test('boss demo: rapid repeated hits keep the ghost readable and finish catching up', () => {
  const d = mount(cloneBossParams(BOSS_PRESETS.heavy));
  for (let i = 0; i < 8; i++) {
    d.demo.damage(10);
    pump(120); // faster than one full hold+catch cycle → constant retargeting
  }
  assert.ok(pct(d.lag) >= pct(d.fill) - 0.01, 'ghost never below the fill');
  pump(1500); // silence after the spam
  assert.ok(Math.abs(pct(d.lag) - pct(d.fill)) < 0.5, 'chase always terminates');
  assert.equal(d.track.getAttribute('aria-valuenow'), '73'); // 220 of 300 total
  d.demo.dispose();
});

test('boss demo: layer crossing down switches color, ×N and shakes harder; heal crosses back up', () => {
  const d = mount(cloneBossParams(BOSS_PRESETS.heavy)); // 3 layers ×100
  d.demo.damage(100); // break the purple layer exactly
  pump(50);
  assert.equal(d.badge.textContent, '×2');
  assert.equal(d.fill.style.background, '#ff9a3d', 'second layer is orange');
  assert.equal(pct(d.fill), 100, 'new layer starts full');
  d.demo.heal(80);
  pump(50);
  assert.equal(d.badge.textContent, '×3', 'heal crosses back up');
  assert.equal(d.fill.style.background, '#9d7bff');
  assert.ok(Number.isFinite(pct(d.fill)) && pct(d.fill) > 0, 'no NaN widths after crossing both ways');
  d.demo.dispose();
});

test('boss demo: a heal during the hold snaps the ghost — no stale white bar', () => {
  const d = mount(cloneBossParams(BOSS_PRESETS.heavy));
  d.demo.damage(60); // 240/300, layer 3 at 40%
  pump(100); // inside the 350 ms hold, ghost still showing 100%
  assert.ok(pct(d.lag) > pct(d.fill), 'ghost pending above the fill before the heal');
  d.demo.heal(30); // 270/300 → 70%
  pump(30);
  assert.ok(Math.abs(pct(d.lag) - 70) < 0.01, `heal snaps the ghost onto the grown fill (${pct(d.lag)})`);
  pump(1000); // nothing pending may resurrect it
  assert.ok(Math.abs(pct(d.lag) - pct(d.fill)) < 0.01, 'still converged long after the heal');
  d.demo.dispose();
});

test('boss demo: a layer break refills the ghost to the top, then it drains', () => {
  const d = mount(cloneBossParams(BOSS_PRESETS.heavy));
  d.demo.damage(190); // 110/300 → layer 2 at 10%
  pump(1200); // settle the ghost at 10%
  assert.ok(Math.abs(pct(d.lag) - 10) < 0.5, `settled at 10% before the break (${pct(d.lag)})`);
  d.demo.damage(15); // 95/300 → layer 1 broke, new layer at 95%
  pump(50); // inside the hold
  assert.ok(Math.abs(pct(d.lag) - 100) < 0.01, `the break resets the ghost to the top of the new layer (${pct(d.lag)})`);
  assert.ok(Math.abs(pct(d.fill) - 95) < 0.01, 'fill shows the new layer');
  pump(1200); // hold + catch elapsed
  assert.ok(Math.abs(pct(d.lag) - 95) < 0.5, `ghost drained onto the new layer's fill (${pct(d.lag)})`);
  d.demo.dispose();
});

test('boss demo: death drains the ghost to zero and it stays converged', () => {
  const d = mount(cloneBossParams(BOSS_PRESETS.heavy));
  d.demo.damage(300); // kill shot from full
  pump(50);
  assert.equal(pct(d.fill), 0, 'fill empty immediately');
  assert.equal(pct(d.lag), 100, 'ghost still holds the hit through the wait');
  pump(1200); // wait + catch elapsed
  assert.equal(pct(d.lag), 0, `ghost drained to zero (${pct(d.lag)})`);
  assert.ok(Math.abs(pct(d.lag) - pct(d.fill)) < 0.01, 'converged at 0 hp');
  d.demo.dispose();
});

test('boss demo: 0 HP ends dead (×0, dimmed, no alarm) and reset restores', () => {
  const d = mount(cloneBossParams(BOSS_PRESETS.heavy));
  for (let i = 0; i < 12; i++) d.demo.damage(30);
  pump(400);
  assert.equal(pct(d.fill), 0);
  assert.equal(d.badge.textContent, '×0');
  assert.ok(d.badge.classList.contains('is-zero'));
  assert.ok(d.stage.classList.contains('is-dead'));
  assert.ok(!d.stage.classList.contains('is-alarm'), 'alarm silences at death');
  assert.equal(d.track.getAttribute('aria-valuenow'), '0');
  d.demo.reset();
  pump(50);
  assert.equal(d.track.getAttribute('aria-valuenow'), '100');
  assert.ok(!d.stage.classList.contains('is-dead'));
  assert.equal(pct(d.fill), 100);
  d.demo.dispose();
});

test('boss demo: low-health alarm fires under the threshold with the edge inside the stage', () => {
  const d = mount(cloneBossParams(BOSS_PRESETS.heavy)); // threshold 25% of 300 = 75 units
  d.demo.damage(240); // 60 left → 20% < 25%
  pump(100);
  assert.ok(d.stage.classList.contains('is-alarm'));
  assert.ok(d.edge.classList.contains('is-on'), 'screen-edge warning active');
  assert.equal(d.stage.style.getPropertyValue('--boss-pulse'), '0.4s', '2.5 Hz → 0.4 s period var');
  d.demo.heal(120); // 180 left → 60% ≥ 25%
  pump(100);
  assert.ok(!d.stage.classList.contains('is-alarm'));
  assert.ok(!d.edge.classList.contains('is-on'));
  d.demo.dispose();
});

test('boss demo: live edits — layer count remaps HP proportionally, ticks rebuild, single-layer drops the badge', () => {
  const d = mount(cloneBossParams(BOSS_PRESETS.heavy)); // 300 total
  d.demo.damage(150); // 150 left = 50%
  pump(50);
  assert.equal(d.track.getAttribute('aria-valuenow'), '50');
  const tuned = cloneBossParams(BOSS_PRESETS.heavy);
  tuned.layers.count = 5;
  d.demo.setParams(tuned); // 500 total, same 50% → 250 units, ×3 badge
  pump(50);
  assert.equal(d.track.getAttribute('aria-valuenow'), '50', 'fraction preserved across layer-count edits');
  assert.equal(d.badge.textContent, '×3'); // 250/500 units → active layer 3 of 5
  assert.equal(d.ticks.children.filter((c) => c.className === 'feel-boss-tick').length, 9, 'ticks rebuilt');
  const single = cloneBossParams(tuned);
  single.layers.on = false;
  d.demo.setParams(single);
  pump(50);
  assert.equal(d.track.getAttribute('aria-valuenow'), '50');
  assert.equal(d.badge.textContent, '', 'single-layer bar hides the ×N badge');
  assert.equal(d.fill.style.background, '#ff4d5e', 'single layer reads plain red');
  d.demo.dispose();
});

test('boss demo: reduced motion skips shake and snaps the ghost', async () => {
  const d = mount(cloneBossParams(BOSS_PRESETS.heavy));
  d.demo.damage(40);
  pump(60);
  assert.ok(d.zone.style.transform.length > 0, 'shake runs when motion is allowed');
  const rm = cloneBossParams(BOSS_PRESETS.heavy);
  rm.reducedMotion = 'on';
  d.demo.setParams(rm);
  pump(60);
  assert.ok(d.stage.classList.contains('is-reduced'));
  assert.equal(d.zone.style.transform, '', 'shake cleared under reduced motion');
  d.demo.damage(20);
  pump(60);
  assert.equal(d.zone.style.transform, '', 'no new shake under reduced motion');
  assert.ok(Math.abs(pct(d.lag) - pct(d.fill)) < 0.01, 'ghost snaps instead of animating');
  // the OS preference feeds the same path through "auto"
  const auto = cloneBossParams(BOSS_PRESETS.heavy);
  auto.reducedMotion = 'auto';
  d.demo.setParams(auto);
  assert.ok(!d.stage.classList.contains('is-reduced'), 'auto + OS prefers motion → motion allowed');
  sharedRmQuery.matches = true; // simulate the OS flipping to prefers-reduced-motion
  const d2 = mount(cloneBossParams(auto));
  pump(30);
  assert.ok(d2.stage.classList.contains('is-reduced'), 'auto + OS prefers-reduced-motion → reduced');
  d2.demo.damage(20);
  pump(30);
  assert.ok(!d2.zone.style.transform, 'no shake ever starts when the OS prefers reduced motion');
  sharedRmQuery.matches = false;
  d.demo.dispose();
  d2.demo.dispose();
});
