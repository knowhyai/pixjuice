import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { resolveRoute, createRoutingMiddleware } from '../scripts/preview-routing.mjs';

// English is the default, unprefixed locale (localize-pages.mjs builds dist
// with '' for en and /zh /ja /ko /es prefixes). These rules keep vite preview
// and the generated dist/_redirects from ever serving the homepage at a wrong
// URL: trailing-slash canonicalization, /en → unprefixed, unknown → 404.
const pages = new Set([
  '/',
  '/feel/',
  '/feel/hit/',
  '/feel/boss-hp/',
  '/feel/jump/',
  '/templates/',
  '/templates/gacha/',
  '/free-assets/chest-wood/',
  '/zh/',
  '/zh/feel/',
  '/zh/feel/hit/',
  '/zh/feel/boss-hp/',
  '/ja/feel/hit/',
  ...['zh', 'ja', 'ko', 'es'].map((locale) => `/${locale}/feel/jump/`),
]);
const exists = (dir) => pages.has(dir);
const resolves = (pathname) => resolveRoute(pathname, exists);

test('routing: English pages live at unprefixed URLs and pass through', () => {
  assert.deepEqual(resolves('/'), { type: 'next' });
  assert.deepEqual(resolves('/feel/'), { type: 'next' });
  assert.deepEqual(resolves('/feel/hit/'), { type: 'next' });
  assert.deepEqual(resolves('/feel/boss-hp/'), { type: 'next' });
  assert.deepEqual(resolves('/zh/feel/hit/'), { type: 'next' });
});

test('routing: jump lab uses canonical paths in all five locales', () => {
  for (const prefix of ['', '/zh', '/ja', '/ko', '/es']) {
    assert.deepEqual(resolves(`${prefix}/feel/jump/`), { type: 'next' });
    assert.deepEqual(resolves(`${prefix}/feel/jump`), { type: 'redirect', location: `${prefix}/feel/jump/` });
  }
  assert.deepEqual(resolves('/en/feel/jump/'), { type: 'redirect', location: '/feel/jump/' });
});

test('routing: directory pages without the slash 301 to the canonical URL', () => {
  assert.deepEqual(resolves('/feel/hit'), { type: 'redirect', location: '/feel/hit/' });
  assert.deepEqual(resolves('/feel'), { type: 'redirect', location: '/feel/' });
  assert.deepEqual(resolves('/feel/boss-hp'), { type: 'redirect', location: '/feel/boss-hp/' });
  assert.deepEqual(resolves('/templates'), { type: 'redirect', location: '/templates/' });
  assert.deepEqual(resolves('/templates/gacha'), { type: 'redirect', location: '/templates/gacha/' });
  assert.deepEqual(resolves('/zh/feel/hit'), { type: 'redirect', location: '/zh/feel/hit/' });
  assert.deepEqual(resolves('/zh'), { type: 'redirect', location: '/zh/' });
});

test('routing: /en is a mistaken prefix and 301s to the unprefixed English URL in one hop', () => {
  // English never has a prefix: /en/feel/hit/ must not serve anything.
  assert.deepEqual(resolves('/en/feel/hit/'), { type: 'redirect', location: '/feel/hit/' });
  assert.deepEqual(resolves('/en/feel/hit'), { type: 'redirect', location: '/feel/hit/' });
  assert.deepEqual(resolves('/en/feel/boss-hp/'), { type: 'redirect', location: '/feel/boss-hp/' });
  assert.deepEqual(resolves('/en/templates/gacha'), { type: 'redirect', location: '/templates/gacha/' });
  assert.deepEqual(resolves('/en'), { type: 'redirect', location: '/' });
  assert.deepEqual(resolves('/en/'), { type: 'redirect', location: '/' });
  // unknown /en paths still canonicalize first, then 404 at the English URL
  assert.deepEqual(resolves('/en/no-such-page'), { type: 'redirect', location: '/no-such-page' });
});

test('routing: unknown extensionless paths are 404, not the homepage', () => {
  assert.deepEqual(resolves('/no-such-page'), { type: 'notfound' });
  assert.deepEqual(resolves('/no-such-page/'), { type: 'notfound' });
  assert.deepEqual(resolves('/feel/nope/'), { type: 'notfound' });
  assert.deepEqual(resolves('/en-x/feel/hit/'), { type: 'notfound' });
});

test('routing: real files with extensions fall through to the static server', () => {
  assert.deepEqual(resolves('/assets/knight-abc123.js'), { type: 'next' });
  assert.deepEqual(resolves('/previews/zh/feel.jpg'), { type: 'next' });
  assert.deepEqual(resolves('/assets/missing.css'), { type: 'next' }); // file check happens in the middleware
});

test('routing: middleware serves redirect/404/pass-through over HTTP', async () => {
  // a miniature dist tree exercised through the real connect middleware
  const dist = mkdtempSync(join(tmpdir(), 'pixjuice-routing-'));
  const page = (p, marker) => {
    mkdirSync(join(dist, p), { recursive: true });
    writeFileSync(join(dist, p, 'index.html'), `<html><body>${marker}</body></html>`);
  };
  page('.', 'HOMEPAGE');
  page('feel/hit', 'FEEL HIT');
  page('zh/feel/hit', 'ZH FEEL HIT');
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');
  writeFileSync(join(dist, '404.html'), '<html><body>NOT FOUND PAGE</body></html>');

  // static handler standing in for vite's sirv, installed after the middleware
  const serve = (req, res) => {
    const pathname = req.url.split('?')[0];
    const file = pathname.endsWith('/') ? join(dist, pathname, 'index.html') : join(dist, pathname);
    if (!existsSync(file)) { res.statusCode = 404; res.end('missing'); return; }
    res.end(readFileSync(file, 'utf8'));
  };
  const server = createServer((req, res) => createRoutingMiddleware(dist)(req, res, () => serve(req, res)));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const shouldRedirect = async (from, to) => {
      const res = await fetch(base + from, { redirect: 'manual' });
      assert.equal(res.status, 301, from);
      assert.equal(res.headers.get('location'), to, from);
    };
    await shouldRedirect('/feel/hit', '/feel/hit/');
    await shouldRedirect('/zh/feel/hit', '/zh/feel/hit/');
    await shouldRedirect('/en/feel/hit', '/feel/hit/');
    await shouldRedirect('/en/feel/hit/', '/feel/hit/');
    await shouldRedirect('/en', '/');
    // queries survive redirects
    await shouldRedirect('/en/feel/hit?preset=heavy', '/feel/hit/?preset=heavy');

    const real = await fetch(base + '/feel/hit/');
    assert.equal(real.status, 200);
    assert.match(await real.text(), /FEEL HIT/);

    const missing = await fetch(base + '/totally-bogus', { redirect: 'manual' });
    assert.equal(missing.status, 404);
    const body = await missing.text();
    assert.match(body, /NOT FOUND PAGE/);
    assert.doesNotMatch(body, /HOMEPAGE/);

    const asset = await fetch(base + '/assets/app.js');
    assert.equal(asset.status, 200);

    // a missing file must 404 — vite's SPA fallback would otherwise serve the
    // homepage for it (curl's Accept: */* is enough to trigger that)
    const missingFile = await fetch(base + '/assets/missing.css', { redirect: 'manual' });
    assert.equal(missingFile.status, 404);
    assert.doesNotMatch(await missingFile.text(), /HOMEPAGE/);
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(dist, { recursive: true, force: true });
  }
});

test('routing: sitemap keeps English unprefixed with the feel pages in it', async () => {
  for (const sitemap of ['public/sitemap.xml', 'dist/sitemap.xml']) {
    if (!existsSync(sitemap)) continue; // dist only exists after a build
    const xml = readFileSync(sitemap, 'utf8');
    assert.ok(xml.includes('https://pixjuice.pages.dev/feel/hit/'), `${sitemap} feel/hit`);
    assert.ok(xml.includes('https://pixjuice.pages.dev/feel/boss-hp/'), `${sitemap} feel/boss-hp`);
    assert.ok(!xml.includes('/en/'), `${sitemap} must not contain /en/ URLs`);
  }
});

test('routing: built _redirects keep asset 301s and add locale/slash rules', async () => {
  if (!existsSync('dist/_redirects')) return; // dist only exists after a build
  const rules = readFileSync('dist/_redirects', 'utf8');
  // pre-existing asset consolidation rules stay intact
  assert.ok(rules.includes('/free-assets/chest-wood-stylized-wood-intact/ /free-assets/chest-wood-realistic-wood-intact/ 301'));
  assert.ok(rules.includes('/zh/free-assets/chest-wood-stylized-wood-intact/ /zh/free-assets/chest-wood-realistic-wood-intact/ 301'));
  // trailing-slash canonicalization for real directory pages, every locale
  for (const line of [
    '/feel/hit /feel/hit/ 301',
    '/feel/boss-hp /feel/boss-hp/ 301',
    '/templates /templates/ 301',
    '/zh/feel/hit /zh/feel/hit/ 301',
    '/ja/feel/hit /ja/feel/hit/ 301',
  ]) assert.ok(rules.includes(line), line);
  // /en (a prefix English never uses) resolves to the unprefixed page
  for (const line of [
    '/en/feel/hit /feel/hit/ 301',
    '/en/feel/hit/ /feel/hit/ 301',
    '/en/feel/boss-hp /feel/boss-hp/ 301',
    '/en / 301',
    '/en/* /:splat 301',
  ]) assert.ok(rules.includes(line), line);
  // explicit rules must win over the catch-all splat
  assert.ok(rules.indexOf('/en/feel/hit /feel/hit/ 301') < rules.indexOf('/en/* /:splat 301'));
});
