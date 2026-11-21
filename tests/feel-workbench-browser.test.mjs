// Rendered-geometry regressions for the feel workbench layout. Run after `pnpm build` + `pnpm preview` (same harness contract as
// tests/browser.mjs):
//   TEST_URL=http://127.0.0.1:4173 node --test tests/feel-workbench-browser.test.mjs
// (or set PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE as browser.mjs documents).
// The headless structure/arithmetic proofs live in tests/feel-workbench.test.mjs;
// this file proves the real scrolled viewport: canvas + Attack stay
// visible while the flash (layer 3) and shake (layer 2) sliders are on screen.
import assert from 'node:assert/strict';
import test from 'node:test';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_URL || 'http://127.0.0.1:4173';

const DESKTOP = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };

/** Visible intersection of an element with the viewport, in px² and per-axis. */
async function visibleBox(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight;
    const x = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const y = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    return { left: r.left, top: r.top, w: r.width, h: r.height, visW: x, visH: y };
  }, selector);
}

async function scrollIntoView(page, selector) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.waitForTimeout(250); // let the sticky positions settle
}

test('workbench desktop: canvas + Attack stay visible at the flash and shake sliders (Hit)', async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const p = await (await b.newContext({ viewport: DESKTOP })).newPage();
    await p.goto(base + '/feel/hit/');
    await p.locator('.feel-canvas').waitFor({ timeout: 20000 });
    for (const slider of ['[data-feel-slider="feedback.flashIntensity"]', '[data-feel-slider="shake.trauma"]', '[data-feel-slider="knockback.distance"]']) {
      await scrollIntoView(p, slider);
      const sliderBox = await visibleBox(p, slider);
      assert.ok(sliderBox && sliderBox.visH > 10 && sliderBox.visW > 40, `${slider} is on screen`);
      const canvas = await visibleBox(p, '.feel-canvas');
      assert.ok(canvas && canvas.visH >= 120 && canvas.visW >= 200, `canvas still usefully visible at ${slider} (visH=${canvas?.visH})`);
      const attack = await visibleBox(p, '.feel-attack');
      assert.ok(attack && attack.visH > 10 && attack.visW > 30, `Attack button visible at ${slider}`);
      const card = await visibleBox(p, '.feel-demo-card');
      assert.ok(card && card.top >= 86 && card.top <= 110, `pinned card sits just under the 88px header (top=${card?.top})`);
      assert.ok(card && card.h <= DESKTOP.height - 88, `pinned card fits the viewport (h=${card?.h})`);
    }
    // the code panel is reachable below the workbench and full-width
    await scrollIntoView(p, '.feel-code-wide');
    const code = await visibleBox(p, '.feel-code-wide');
    assert.ok(code && code.visH > 100 && code.w >= DESKTOP.width - 80, 'engine code is a reachable full-width block');
  } finally {
    await b.close();
  }
});

test('workbench desktop: boss bar + actions stay visible at mid/bottom sliders (Boss)', async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const p = await (await b.newContext({ viewport: DESKTOP })).newPage();
    await p.goto(base + '/feel/boss-hp/');
    await p.locator('#boss-demo').waitFor({ timeout: 20000 });
    const sliders = await p.locator('[data-feel-slider]').all();
    assert.ok(sliders.length >= 3, 'boss page has sliders');
    // scroll to the LAST slider (bottom of the layer list)
    await sliders[sliders.length - 1].scrollIntoViewIfNeeded();
    await p.waitForTimeout(250);
    const bar = await visibleBox(p, '.feel-boss-host');
    assert.ok(bar && bar.visH >= 60 && bar.visW >= 150, `boss bar still visible at the bottom slider (visH=${bar?.visH})`);
    const hit = await visibleBox(p, '.boss-hit');
    assert.ok(hit && hit.visH > 10 && hit.visW > 30, 'boss action button visible');
    const card = await visibleBox(p, '.feel-demo-card');
    assert.ok(card && card.top >= 86 && card.top <= 110, 'pinned boss card sits just under the header');
  } finally {
    await b.close();
  }
});

test('workbench 390px: stage/action usable at top, sliders reachable, no overflow, no viewport-eating pin', async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const p = await (await b.newContext({ viewport: MOBILE })).newPage();
    await p.goto(base + '/feel/hit/');
    await p.locator('.feel-canvas').waitFor({ timeout: 20000 });
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no horizontal overflow at 390px');
    const canvas = await visibleBox(p, '.feel-canvas');
    assert.ok(canvas && canvas.visH >= 120, 'canvas usable at the top of the page');
    const attack = await visibleBox(p, '.feel-attack');
    assert.ok(attack && attack.visH > 10, 'Attack reachable at the top');
    // the pinned stage must not eat the viewport
    const stage = await visibleBox(p, '.feel-stage');
    assert.ok(stage && stage.h <= MOBILE.height * 0.6, `pinned stage leaves room to scroll (h=${stage?.h})`);
    // sliders are reachable by scrolling (bottom-most layer)
    const sliders = await p.locator('[data-feel-slider]').all();
    await sliders[sliders.length - 1].scrollIntoViewIfNeeded();
    await p.waitForTimeout(250);
    const anyVisible = await p.evaluate(() => {
      const els = [...document.querySelectorAll('[data-feel-slider]')];
      return els.some((el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
    });
    assert.ok(anyVisible, 'sliders reachable after scrolling');
  } finally {
    await b.close();
  }
});
