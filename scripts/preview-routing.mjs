// Routing parity for `vite preview`: make the local static server behave like
// the Cloudflare Pages deployment instead of Vite's SPA fallback (which serves
// the homepage with 200 for every unknown path):
//   1. a real directory page without its trailing slash 301s to the slashed URL
//   2. /en/<path> 301s to the unprefixed <path> — English is the default locale
//      and never has a prefix (mirrors the /en rules in dist/_redirects)
//   3. any other extensionless unknown path serves 404.html with status 404
// Shared with tests/routing.test.mjs so the rules stay locked down.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const hasExtension = (pathname) => pathname.split('/').pop().includes('.');

// Resolve a URL path against a dist tree. `exists` takes a slashed directory
// path like '/feel/hit/' and answers whether dist/feel/hit/index.html exists.
// Returns { type: 'redirect', location }, { type: 'next' } (let the static
// server handle it) or { type: 'notfound' } (serve 404.html as 404).
export function resolveRoute(pathname, exists) {
  // English is the unprefixed default locale: every /en URL is a mistaken
  // prefix and canonicalizes in a single hop, slash included.
  const isEn = pathname === '/en' || pathname.startsWith('/en/');
  const target = isEn ? pathname.slice(3) || '/' : pathname;
  const needsSlash = target !== '/' && !target.endsWith('/') && exists(`${target}/`);
  if (isEn || needsSlash) {
    return { type: 'redirect', location: needsSlash ? `${target}/` : target };
  }
  // Real slashed pages pass through; file paths are checked against the dist
  // tree by the middleware (vite would SPA-fallback missing files to the
  // homepage too, so they must be 404ed before it).
  if (target === '/' || hasExtension(target) || exists(target)) {
    return { type: 'next' };
  }
  return { type: 'notfound' };
}

// Connect-style middleware for vite's configurePreviewServer. distRoot is the
// absolute build output directory (served by vite's own sirv after this runs).
export function createRoutingMiddleware(distRoot) {
  let notFoundPage;
  return function routing(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const [pathname, query] = String(req.url).split('?');
    // route every site path; only traversal attempts and internal @-paths
    // (none exist in preview) fall through to vite's own handlers
    if (pathname.includes('..') || pathname.startsWith('/@')) return next();
    const route = resolveRoute(pathname, (dir) => existsSync(join(distRoot, dir, 'index.html')));
    if (route.type === 'redirect') {
      res.statusCode = 301;
      res.setHeader('Location', `${route.location}${query ? `?${query}` : ''}`);
      res.end();
      return;
    }
    // only real dist files reach vite's static server; vite's SPA fallback
    // would happily serve the homepage for any miss, files included
    if (route.type === 'next' && (!hasExtension(pathname) || existsSync(join(distRoot, pathname)))) {
      return next();
    }
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    notFoundPage ??= readFileSync(join(distRoot, '404.html'));
    res.end(req.method === 'HEAD' ? undefined : notFoundPage);
  };
}
