import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Source-level layout guards and freeze behavior tests for Hit and Boss.
const css = fs.readFileSync('src/pages/feel.css', 'utf8');
const hitHtml = fs.readFileSync('feel/hit/index.html', 'utf8');
const bossHtml = fs.readFileSync('feel/boss-hp/index.html', 'utf8');

function loadTs(file) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
}

// ---- layout structure -----------------------------------------------------------------

test('workbench: only the demo card is the desktop sticky box, and its column spans the whole layer list', () => {
  // the t444u bug: the whole side column (demo + code, ~1050px) was sticky —
  // taller than the viewport, so its bottom was unreachable and the demo
  // scrolled away mid-list once the sticky range ran out.
  assert.ok(!/\.feel-side\s*\{[^}]*position:\s*sticky/.test(css), 'side column is not sticky anymore');
  assert.match(css, /\.feel-side\s*\{[^}]*align-self:\s*stretch/, 'side column stretches to the full grid row so the card keeps its sticky range to the last slider');
  assert.ok(!/\.feel-side\s*\{[^}]*display:\s*grid/.test(css), 'column is a plain block: a grid row could stay content-sized and silently kill the sticky range');
  assert.match(css, /\.feel-demo-card\s*\{[^}]*position:\s*sticky/, 'the demo card pins on desktop');
  assert.match(css, /\.feel-demo-card\s*\{[^}]*top:\s*calc\(var\(--head-h,\s*88px\)\s*\+\s*14px\)/, 'pinned card sits below the sticky site header');
  assert.match(css, /\.feel-main\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*clamp\(400px,\s*31vw,\s*520px\)/, 'side column is rebalanced (old fixed 430px left ~75% of the screen to sliders)');
});

test('workbench: engine code moved out of the side column into a full-width block below the workbench', () => {
  for (const [name, html] of [['hit', hitHtml], ['boss', bossHtml]]) {
    const aside = html.slice(html.indexOf('<aside class="feel-side"'), html.indexOf('</aside>'));
    assert.ok(aside.length > 0, `${name}: side column found`);
    assert.ok(!aside.includes('feel-code'), `${name}: no code panel inside the side column`);
    const asideEnd = html.indexOf('</aside>');
    const codeAt = html.indexOf('<section class="feel-code feel-code-wide"');
    assert.ok(codeAt > asideEnd, `${name}: code section follows the workbench grid`);
    assert.match(css, /\.feel-code-wide\s*\{[^}]*margin:\s*0 20px 34px/, 'code block is a full-width framed section');
  }
});

test('workbench: the editor scroll pane is scoped away from the desktop sticky card', () => {
  const shared = fs.readFileSync('src/style.css', 'utf8');
  const editor = fs.readFileSync('editor/index.html', 'utf8');
  assert.match(shared, /\.ed-grid\s*>\s*aside\s*\{[^}]*overflow-y:\s*auto/);
  assert.doesNotMatch(shared, /(?:^|[},])\s*aside\s*\{[^}]*overflow-y:\s*auto/m);
  assert.match(editor, /class="ed-grid"[\s\S]*?<aside>/, 'the pixel editor still has its pane');
  assert.match(css, /\.feel-side\s*\{[^}]*overflow:\s*visible/);
});

test('workbench: narrow sticky stage shares a block with the layer list', () => {
  const narrow = css.slice(css.indexOf('@media (max-width: 1020px)'), css.indexOf('@media (max-width: 620px)'));
  assert.match(narrow, /\.feel-main\s*\{[^}]*display:\s*block/);
  assert.match(narrow, /\.feel-side,\s*\.feel-demo-card\s*\{[^}]*display:\s*contents/);
  assert.match(narrow, /\.feel-stage\s*\{[^}]*position:\s*sticky/);
  assert.match(narrow, /top:\s*var\(--head-h,\s*88px\)/);
  for (const html of [hitHtml, bossHtml]) {
    assert.match(html, /<div class="feel-main">\s*<aside class="feel-side">[\s\S]*?<\/aside>\s*<div class="feel-layers"/);
  }
});

// ---- freeze lifetime ---------------------------------------------------------------------

const { advanceClock } = await loadTs('./src/feel/clock.ts');

test('hit stop: the simulation resumes after the configured frames', () => {
  let c = { freezeLeft: 4 / 60, slowLeft: 0, timeScale: 0 };
  for (let i = 0; i < 30; i++) c = advanceClock(c, 1 / 60); // 0.5s of playback
  assert.equal(c.timeScale, 1, 'playback resumes after the hit-stop frames');
  assert.equal(c.freezeLeft, 0);
});

test('hit stop: heavy slow motion starts at timeout and then returns to full speed', () => {
  let clock = { freezeLeft: 4 / 60, slowLeft: 0.26, timeScale: 0 };
  clock = advanceClock(clock, 4 / 60);
  assert.deepEqual(clock, { freezeLeft: 0, slowLeft: 0.26, timeScale: 0.3 });
  for (let i = 0; i < 60; i++) clock = advanceClock(clock, 1 / 60);
  assert.deepEqual(clock, { freezeLeft: 0, slowLeft: 0, timeScale: 1 });
});
