// Site origin, language URLs, network links, and integration hooks.
// Canonical host is unknown — PUBLIC_SITE_URL overrides the pages.dev default.
// Every integration renders nothing when its env var is unset. This module never throws.

export const DEFAULT_ORIGIN = "https://pixjuice.pages.dev";

/** Pages that belong in the sitemap. Paths are real routes in this repo. */
export const PAGES = [
  { path: "/", priority: "1.0" },
  { path: "/editor/", priority: "0.8" },
  { path: "/image-to-pixel-art/", priority: "0.9" },
  { path: "/normal-map/", priority: "0.9" },
  { path: "/pixel-art-upscaler/", priority: "0.9" },
  { path: "/sprite-sheet/", priority: "0.9" },
  { path: "/credits/", priority: "0.3" },
];

/** hreflang for the five UI languages. `param` is the ?lang= value; English is the clean URL. */
export const LANGS = [
  { hreflang: "en", param: null },
  { hreflang: "zh-Hans", param: "zh" },
  { hreflang: "ja", param: "ja" },
  { hreflang: "ko", param: "ko" },
  { hreflang: "es", param: "es" },
];

/**
 * Knowhy properties that answered HTTP 200 on 2026-11-10.
 * rbxeyes.com did not resolve; the working host is rbxeyes.pages.dev.
 * agents.omnihex.xyz is omitted — it is not a Knowhy product page.
 */
export const NETWORK = [
  { href: "https://knowhy.net/", label: "KNOWHY" },
  { href: "https://lab.knowhy.net/", label: "Lab" },
  { href: "https://news.knowhy.net/", label: "News" },
  { href: "https://models.knowhy.net/", label: "Models" },
  { href: "https://design.knowhy.net/", label: "Design" },
  { href: "https://scope.knowhy.net/", label: "Scope" },
  { href: "https://apps.knowhy.net/", label: "Apps" },
  { href: "https://game.knowhy.net/", label: "Games" },
  { href: "https://reset.knowhy.net/", label: "Reset" },
  { href: "https://parse.knowhy.net/", label: "Video Insight" },
  { href: "https://vault.knowhy.net/", label: "Vault" },
  { href: "https://noaitell.com/", label: "NoAITell" },
  { href: "https://rbxeyes.pages.dev/", label: "rbxeyes" },
];

export const LASTMOD = "2026-11-10";

export const INTEGRATIONS = [
  {
    key: "PUBLIC_SITE_URL",
    group: "canonical",
    detail: "Canonical origin (scheme + host). Unset → https://pixjuice.pages.dev.",
  },
  {
    key: "PUBLIC_GSC_VERIFICATION",
    group: "verification",
    detail: "Google Search Console token → <meta name=\"google-site-verification\">.",
  },
  {
    key: "PUBLIC_BING_VERIFICATION",
    group: "verification",
    detail: "Bing Webmaster token → <meta name=\"msvalidate.01\">.",
  },
  {
    key: "PUBLIC_YANDEX_VERIFICATION",
    group: "verification",
    detail: "Yandex Webmaster token → <meta name=\"yandex-verification\">.",
  },
  {
    key: "PUBLIC_GA4_ID",
    group: "analytics",
    detail: "GA4 measurement id (G-…). Empty skips the gtag snippet.",
  },
  {
    key: "PUBLIC_CLARITY_ID",
    group: "analytics",
    detail: "Microsoft Clarity project id. Empty skips the snippet.",
  },
  {
    key: "PUBLIC_PLAUSIBLE_DOMAIN",
    group: "analytics",
    detail: "Plausible data-domain (hostname). Empty skips the script.",
  },
  {
    key: "PUBLIC_NEWSLETTER_URL",
    group: "newsletter",
    detail: "https newsletter URL. Empty hides the footer link.",
  },
];

export function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function siteOrigin(env = process.env) {
  const raw = (env.PUBLIC_SITE_URL ?? "").trim();
  if (!raw) return { origin: DEFAULT_ORIGIN, state: "default" };
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return { origin: DEFAULT_ORIGIN, state: "invalid" };
    return { origin: u.origin, state: "set" };
  } catch {
    return { origin: DEFAULT_ORIGIN, state: "invalid" };
  }
}

export function hostnameOf(origin) {
  try {
    return new URL(origin).host;
  } catch {
    return "pixjuice.pages.dev";
  }
}

export function pageUrl(origin, path) {
  return origin + (path.startsWith("/") ? path : `/${path}`);
}

export function langUrl(origin, path, param) {
  const base = pageUrl(origin, path);
  if (!param) return base;
  return `${base}?lang=${param}`;
}

/** Map a built HTML filename to a site path. Root index → /. 404 → null. */
export function routeFromFile(filename) {
  const file = String(filename || "").replace(/\\/g, "/");
  if (file.endsWith("/404.html")) return null;
  if (!file.endsWith("/index.html")) return null;
  const parent = file.split("/").at(-2);
  const known = new Set([
    "editor",
    "sprite-sheet",
    "image-to-pixel-art",
    "normal-map",
    "pixel-art-upscaler",
    "credits",
  ]);
  if (known.has(parent)) return `/${parent}/`;
  return "/";
}

const MARK = `<svg class="mark" viewBox="0 0 16 16" width="32" height="32" shape-rendering="crispEdges" role="img" aria-hidden="true">
          <rect width="16" height="16" fill="#0b0a10"/>
          <rect x="7" y="1" width="2" height="2" fill="#ff4d6d"/>
          <rect x="6" y="3" width="4" height="2" fill="#ff4d6d"/>
          <rect x="5" y="5" width="6" height="1" fill="#ff4d6d"/>
          <rect x="4" y="6" width="8" height="3" fill="#ff4d6d"/>
          <rect x="5" y="9" width="6" height="1" fill="#d63a58"/>
          <rect x="6" y="10" width="4" height="1" fill="#d63a58"/>
          <rect x="7" y="11" width="2" height="1" fill="#d63a58"/>
          <rect x="6" y="5" width="2" height="2" fill="#ffd9e0"/>
          <rect x="12" y="2" width="2" height="2" fill="#4cd7ff"/>
          <rect x="11" y="1" width="1" height="1" fill="#4cd7ff"/>
          <rect x="14" y="4" width="1" height="1" fill="#4cd7ff"/>
        </svg>`;

const TOOLS = [
  { href: "/", nav: "/", key: "nav.catalog", label: "catalog" },
  { href: "/editor/", nav: "/editor/", key: "nav.editor", label: "effects editor" },
  { href: "/image-to-pixel-art/", nav: "/image-to-pixel-art/", key: "nav.pixel", label: "image → pixel art" },
  { href: "/normal-map/", nav: "/normal-map/", key: "nav.normal", label: "normal map" },
  { href: "/pixel-art-upscaler/", nav: "/pixel-art-upscaler/", key: "nav.upscale", label: "upscaler" },
  { href: "/sprite-sheet/", nav: "/sprite-sheet/", key: "nav.sheet", label: "sprite sheet" },
  { href: "/credits/", nav: "/credits/", key: "nav.credits", label: "credits" },
];

function toolLinks(currentPath) {
  return TOOLS.map((t) => {
    const on = currentPath === t.nav;
    const cur = on ? ` class="cur" aria-current="page"` : "";
    return `<a href="${t.href}" data-nav="${t.nav}"${cur} data-i18n="${t.key}">${esc(t.label)}</a>`;
  }).join("\n            ");
}

function networkLinks(origin, { currentAttr = true } = {}) {
  const self = pageUrl(origin, "/");
  const items = [
    ...NETWORK.map((n) => `<a href="${esc(n.href)}">${esc(n.label)}</a>`),
    `<a href="${esc(self)}"${currentAttr ? ` aria-current="page"` : ""}>PixJuice</a>`,
  ];
  return items.join("\n            ");
}

export function headerHtml(currentPath) {
  const here = currentPath ?? "";
  return `<header class="head">
    <a class="skip" href="#content" data-i18n="nav.skip">Skip to content</a>
    <div class="head-in">
      <a class="brand" href="/" aria-label="PixJuice home">
        ${MARK}
        <span class="brand-lockup">
          <span class="kh-word">KNOWHY</span>
          <span class="prod">Pix<em>Juice</em></span>
        </span>
      </a>
      <div class="head-end">
        <div class="head-cluster" id="site-menu">
          <a class="kh-home" href="https://knowhy.net/" data-i18n="nav.knowhy">knowhy.net</a>
          <details class="tools">
            <summary data-i18n="nav.tools">tools ▾</summary>
            <div class="tools-menu">
            ${toolLinks(here)}
            </div>
          </details>
          <details class="tools net">
            <summary data-i18n="nav.network">network</summary>
            <div class="tools-menu net-menu">
            ${networkLinks(DEFAULT_ORIGIN).replaceAll(DEFAULT_ORIGIN, "__SITE_ORIGIN__")}
            </div>
          </details>
        </div>
        <select id="lang" class="lang" aria-label="Language" data-i18n-aria="lang.aria">
          <option value="en">English</option>
          <option value="zh">简体中文</option>
          <option value="ja">日本語</option>
          <option value="ko">한국어</option>
          <option value="es">Español</option>
        </select>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-menu" data-i18n-aria="nav.menu">
          <span class="burger" aria-hidden="true"></span>
          <span class="visually-hidden" data-i18n="nav.menu">menu</span>
        </button>
      </div>
    </div>
  </header>`;
}

function newsletter(env) {
  const raw = (env.PUBLIC_NEWSLETTER_URL ?? "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    return `<p class="foot-news"><a href="${esc(u.href)}" data-i18n="foot.newsletter">newsletter</a></p>`;
  } catch {
    return "";
  }
}

export function footerHtml(env = process.env) {
  return `<footer class="site-foot">
    <div class="foot-in">
      <div class="foot-brand">
        <a class="kh-word" href="https://knowhy.net/">KNOWHY</a>
        <p class="foot-slogan" lang="zh">小众，但值得收藏</p>
      </div>
      <nav class="foot-net" aria-label="KNOWHY network" data-i18n-aria="foot.networkAria">
            ${networkLinks(DEFAULT_ORIGIN).replaceAll(DEFAULT_ORIGIN, "__SITE_ORIGIN__")}
      </nav>
      <div class="foot-meta">
        <p data-i18n-html="foot.credit">Effects from <a href="https://github.com/patch-gg/pixelfx" target="_blank" rel="noopener">pixelfx</a> by Patch and Hugo Duprez, MIT License.</p>
        <p data-i18n-html="foot.home2"><a href="/credits/">credits &amp; licenses</a> · made for indie game devs</p>
        ${newsletter(env)}
        <p class="foot-host"><a href="__SITE_ORIGIN__/">__SITE_HOST__</a></p>
      </div>
    </div>
  </footer>`;
}

export function bootScript() {
  return `<script data-kh-boot>
(function () {
  var ok = { en: 1, zh: 1, ja: 1, ko: 1, es: 1 };
  var map = { en: "en", zh: "zh-Hans", ja: "ja", ko: "ko", es: "es" };
  var lang = "";
  try {
    var q = new URLSearchParams(location.search).get("lang");
    if (q === "zh-Hans") q = "zh";
    if (q && ok[q]) lang = q;
    else {
      var saved = localStorage.getItem("pixjuice-lang");
      if (saved && ok[saved]) lang = saved;
      else {
        var list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
        for (var i = 0; i < list.length; i++) {
          var head = String(list[i] || "").toLowerCase().split("-")[0];
          if (ok[head] && head !== "en") { lang = head; break; }
        }
      }
    }
  } catch (e) {}
  if (lang && map[lang]) document.documentElement.lang = map[lang];
})();
</script>`;
}

function tokenOk(value, re) {
  const v = (value ?? "").trim();
  if (!v) return "";
  return re.test(v) ? v : "";
}

export function verificationMetas(env = process.env) {
  const bits = [];
  const gsc = tokenOk(env.PUBLIC_GSC_VERIFICATION, /^[A-Za-z0-9_-]{8,128}$/);
  const bing = tokenOk(env.PUBLIC_BING_VERIFICATION, /^[A-Za-z0-9]{8,128}$/);
  const yandex = tokenOk(env.PUBLIC_YANDEX_VERIFICATION, /^[A-Za-z0-9]{8,128}$/);
  if (gsc) bits.push(`<meta name="google-site-verification" content="${esc(gsc)}">`);
  if (bing) bits.push(`<meta name="msvalidate.01" content="${esc(bing)}">`);
  if (yandex) bits.push(`<meta name="yandex-verification" content="${esc(yandex)}">`);
  return bits.join("\n  ");
}

export function analyticsHtml(env = process.env) {
  const bits = [];
  const ga = tokenOk(env.PUBLIC_GA4_ID, /^G-[A-Z0-9]+$/i);
  if (ga) {
    bits.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(ga)}" data-kh-analytics></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${esc(ga)}');
</script>`);
  }
  const clarity = tokenOk(env.PUBLIC_CLARITY_ID, /^[a-z0-9]{6,32}$/i);
  if (clarity) {
    bits.push(`<script data-kh-analytics>
(function(c,l,a,r,i,t,y){
  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${esc(clarity)}");
</script>`);
  }
  const plausible = tokenOk(env.PUBLIC_PLAUSIBLE_DOMAIN, /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i);
  if (plausible) {
    bits.push(`<script defer data-domain="${esc(plausible)}" src="https://plausible.io/js/script.js" data-kh-analytics></script>`);
  }
  return bits.join("\n");
}

function attr(html, pattern) {
  const m = html.match(pattern);
  return m ? m[1] : "";
}

export function seoBlock(html, origin, path) {
  const title = attr(html, /<title>([\s\S]*?)<\/title>/i);
  const description = attr(html, /<meta\s+name="description"\s+content="([^"]*)"/i);
  const ogTitle = attr(html, /<meta\s+property="og:title"\s+content="([^"]*)"/i) || title;
  const ogDesc = attr(html, /<meta\s+property="og:description"\s+content="([^"]*)"/i) || description;
  const image = `${origin}/og.png`;
  const canonical = pageUrl(origin, path);
  const alternates = LANGS.map(
    (l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${esc(langUrl(origin, path, l.param))}">`,
  ).join("\n  ");
  return `<link rel="canonical" href="${esc(canonical)}">
  ${alternates}
  <link rel="alternate" hreflang="x-default" href="${esc(canonical)}">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="PixJuice — pixel art droplet mark on a dark field">
  <meta property="og:locale" content="en_US">
  <meta property="og:locale:alternate" content="zh_CN">
  <meta property="og:locale:alternate" content="ja_JP">
  <meta property="og:locale:alternate" content="ko_KR">
  <meta property="og:locale:alternate" content="es_ES">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${ogTitle}">
  <meta name="twitter:description" content="${ogDesc}">
  <meta name="twitter:image" content="${esc(image)}">
  <meta data-kh-seo content="1">`;
}

export function stripInjectedSeo(html) {
  return html
    .replace(/\s*<link\s+rel="canonical"[^>]*>/gi, "")
    .replace(/\s*<link\s+rel="alternate"[^>]*hreflang=[^>]*>/gi, "")
    .replace(/\s*<link\s+rel="manifest"[^>]*>/gi, "")
    .replace(/\s*<link\s+rel="apple-touch-icon"[^>]*>/gi, "")
    .replace(/\s*<meta\s+property="og:url"[^>]*>/gi, "")
    .replace(/\s*<meta\s+property="og:image(?::[a-z]+)?"[^>]*>/gi, "")
    .replace(/\s*<meta\s+property="og:locale(?::alternate)?"[^>]*>/gi, "")
    .replace(/\s*<meta\s+name="twitter:(?:card|title|description|image)"[^>]*>/gi, "");
}

export function sitemapXml(origin) {
  const urls = PAGES.map((p) => {
    const links = [
      ...LANGS.map(
        (l) =>
          `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${esc(langUrl(origin, p.path, l.param))}"/>`,
      ),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(pageUrl(origin, p.path))}"/>`,
    ].join("\n");
    return `  <url>
    <loc>${esc(pageUrl(origin, p.path))}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <priority>${p.priority}</priority>
${links}
  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

export function robotsTxt(origin) {
  return `User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`;
}

export function integrationReport(env = process.env) {
  const { origin, state } = siteOrigin(env);
  const lines = [];
  lines.push("PixJuice integration check — missing hooks are skipped and do not fail the build.");
  lines.push(`canonical origin: ${origin} (${state})`);
  for (const item of INTEGRATIONS) {
    const raw = (env[item.key] ?? "").trim();
    let status = "missing";
    if (item.key === "PUBLIC_SITE_URL") status = state === "set" ? "set" : state;
    else if (raw) status = "set";
    lines.push(`${item.key.padEnd(28)} ${item.group.padEnd(14)} ${status}`);
  }
  const ga = (env.PUBLIC_GA4_ID ?? "").trim();
  if (ga && !/^G-[A-Z0-9]+$/i.test(ga)) lines.push("note: PUBLIC_GA4_ID is set but not a G- measurement id, so it will not be injected.");
  const news = (env.PUBLIC_NEWSLETTER_URL ?? "").trim();
  if (news) {
    try {
      const u = new URL(news);
      if (u.protocol !== "https:" && u.protocol !== "http:") lines.push("note: PUBLIC_NEWSLETTER_URL is not http(s), so the footer link stays hidden.");
    } catch {
      lines.push("note: PUBLIC_NEWSLETTER_URL is not a URL, so the footer link stays hidden.");
    }
  }
  return lines.join("\n");
}
