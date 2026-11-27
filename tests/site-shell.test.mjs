// First-round site shell / homepage / feel-catalog consistency.
// Does not claim the whole site is done — it guards the browsing frame we shipped.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { categories } from "pixelfx/fx/categories";

const loadTs = (file) => {
  const src = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(src).toString("base64")).then((m) => m.default ?? m);
};

test("localized pages have accurate license metadata, canonical links, and sitemap entries", async (t) => {
  const iconDirectory = "free-icons";
  const unlicensedPages = [
    "effects", "credits", "editor", "text-fit", "audio-envelope", "camera-shake",
    "audio-scenes", "weapon-switch", "reload", "typewriter", "image-to-pixel-art",
    "normal-map", "pixel-art-upscaler", "sprite-sheet", "templates", "templates/gacha",
    "templates/save-load", "templates/settlement", "free-assets", iconDirectory, "feel", "feel/hit", "feel/boss-hp",
    "feel/jump", "feel/move", "feel/camera", "feel/spring",
  ];
  const { assets } = JSON.parse(fs.readFileSync("public/free-assets/manifest.json", "utf8"));
  const asset = assets.find(({ id }) => id === "chest-wood-realistic-wood-intact");
  const assetPage = `free-assets/${asset.id}`;
  const outDir = fs.mkdtempSync(join(tmpdir(), "pixjuice-json-ld-"));
  t.after(() => fs.rmSync(outDir, { recursive: true, force: true }));
  const sourcePages = new Set([
    "", "free-resources", ...unlicensedPages, ...assets.map(({ id }) => `free-assets/${id}`),
    ...assets.filter(({ product_id }) => product_id).map(({ product_id }) => `free-assets/${product_id}`),
  ]);
  const imageTools = ["image-to-pixel-art", "normal-map", "pixel-art-upscaler", "sprite-sheet"];
  const sourceFixtures = new Set(["credits", iconDirectory, "free-assets", "free-resources", ...imageTools]);
  for (const page of sourcePages) {
    const dir = join(outDir, page);
    fs.mkdirSync(dir, { recursive: true });
    const destination = join(dir, "index.html");
    if (sourceFixtures.has(page)) fs.copyFileSync(join(page, "index.html"), destination);
    else fs.writeFileSync(destination, '<html lang="en"><head></head><body></body></html>');
  }

  const previousOutDir = process.env.PIXJUICE_OUTDIR;
  process.env.PIXJUICE_OUTDIR = outDir;
  try {
    await import("../scripts/localize-pages.mjs");
  } finally {
    if (previousOutDir === undefined) delete process.env.PIXJUICE_OUTDIR;
    else process.env.PIXJUICE_OUTDIR = previousOutDir;
  }

  const site = "https://pixjuice.pages.dev";
  const langs = ["en", "zh", "ja", "ko", "es"];
  const pageUrlFor = (lang, page) => `${site}/${lang === "en" ? "" : `${lang}/`}${page}/`;
  const sitemap = fs.readFileSync(join(outDir, "sitemap.xml"), "utf8");
  const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc));
  const redirects = fs.readFileSync(join(outDir, "_redirects"), "utf8").split("\n");
  assert.ok(redirects.includes("/en/free-icons /free-icons/ 301"));
  assert.ok(redirects.includes("/en/free-icons/ /free-icons/ 301"));
  for (const lang of langs) {
    const prefix = lang === "en" ? "" : lang;
    for (const page of [...unlicensedPages, "free-assets/wall-stone", assetPage]) {
      const html = fs.readFileSync(join(outDir, prefix, page, "index.html"), "utf8");
      const [, json] = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      const pageUrl = pageUrlFor(lang, page);
      const canonical = [...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)];
      assert.deepEqual(canonical.map(([, href]) => href), [pageUrl], pageUrl);
      const alternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)];
      assert.deepEqual(alternates.map(([, code, href]) => [code, href]), [
        ...langs.map((code) => [code, pageUrlFor(code, page)]),
        ["x-default", pageUrlFor("en", page)],
      ], pageUrl);
      if (imageTools.includes(page)) assert.ok(sitemapUrls.has(pageUrl), pageUrl);
      if (page === "credits") {
        assert.match(html, /<meta name="robots" content="noindex">/, pageUrl);
        assert.ok(!sitemapUrls.has(pageUrl), pageUrl);
      }
      const schema = JSON.parse(json);
      const pageType = page === iconDirectory ? "CollectionPage" : "CreativeWork";
      const work = schema.find((node) => node["@type"] === pageType && node.url === pageUrl);
      assert.ok(work, `Missing ${pageType} for ${pageUrl}`);
      if (page === iconDirectory) {
        const dict = await loadTs(`src/lib/locales/${lang}.ts`);
        const path = new URL(pageUrl).pathname;
        assert.ok(redirects.includes(`${path.slice(0, -1)} ${path} 301`));
        assert.ok(sitemapUrls.has(pageUrl));
        assert.match(html, new RegExp(`<html lang="${lang}">`));
        assert.equal(work.name, dict.title.freeIcons);
        assert.equal(work.description, dict.title.freeIconsDesc);
        assert.equal(work.inLanguage, lang);
        const cards = [...html.matchAll(/<article class="resource-card" data-category="(\w+)" data-library="([\w-]+)">([\s\S]*?)<\/article>/g)];
        assert.equal(cards.length, 12);
        assert.equal(new Set(cards.map(([, , library]) => library)).size, 12);
        for (const [category, count] of Object.entries({ animated: 4, game: 5, ui: 3 })) {
          assert.equal(cards.filter(([, value]) => value === category).length, count);
        }
        const licenses = { "game-icons": "CC BY 3.0", nieobie: "CC0 1.0", kenney: "CC0 1.0", lucide: "ISC / MIT" };
        for (const [, , library, card] of cards) {
          const badges = [...card.matchAll(/<(span|a) class="fi-license"([^>]*)>([^<]+)<\/\1>/g)];
          assert.equal(badges.length, 1, library);
          assert.doesNotMatch(badges[0][2], /\bhidden\b/);
          assert.equal(badges[0][3], licenses[library] ?? "MIT", library);
        }
        const faq = schema.find((node) => node["@type"] === "FAQPage");
        assert.equal(faq.inLanguage, lang);
        assert.equal(faq.mainEntity[0].name, dict.fi.q);
        assert.equal(faq.mainEntity[0].acceptedAnswer.text, dict.fi.a);
        assert.ok(html.includes(`<summary>${dict.fi.q}</summary>`));
        const localizedRoot = prefix ? `/${prefix}` : "";
        for (const related of ["free-assets", "free-resources"]) {
          assert.ok(html.includes(`href="${localizedRoot}/${related}/"`));
          const relatedHtml = fs.readFileSync(join(outDir, prefix, related, "index.html"), "utf8");
          assert.ok(relatedHtml.includes(`href="${path}" data-i18n="nav.freeIcons">${dict.nav.freeIcons}</a>`));
        }
      }
      if (page === assetPage) {
        assert.equal(work.license, `${site}/free-assets/${asset.license.file}`, pageUrl);
      } else {
        assert.equal(Object.hasOwn(work, "license"), false, pageUrl);
      }
    }
  }
});

test("shell: shared header lists real sections and a site tagline, not the assets-only subtitle", () => {
  const src = fs.readFileSync("src/lib/navmenu.ts", "utf8");
  assert.match(src, /t\("nav\.tagline"\)/, "brand sub uses nav.tagline");
  assert.match(src, /t\("nav\.home"\)/);
  assert.match(src, /t\("nav\.effects"\)/, "effects is a first-class nav item");
  assert.match(src, /t\("nav\.feel"\)/);
  assert.match(src, /t\("nav\.templates"\)/);
  assert.match(src, /t\("nav\.assets"\)/);
  assert.match(src, /theme-toggle/, "light/dark control stays in the shared header");
  assert.match(src, /class="mark"/, "pixel mark is remounted, not dropped");
  assert.ok(!/Free game assets/.test(src), "hardcoded assets-only tagline is gone");
  assert.match(src, /link\("\/".*link\("\/effects\/".*link\("\/feel\/".*link\("\/templates\/".*link\("\/free-assets\/"/,
    "nav order is home → effects → feel → templates → assets");
});

const navScript = ts.transpileModule(fs.readFileSync("src/lib/navmenu.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const routes = {};
runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/effects-routes.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports: routes,
  require: (id) => {
    assert.equal(id, "pixelfx/fx/categories");
    return { categories };
  },
});

function mountHeader(pathname, hash, locale, dict, tools = null) {
  const window = new EventTarget();
  const location = { pathname, hash, search: "" };
  let html = "";
  let crumb = null;
  const header = {
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      const match = value.match(/<p([^>]*id="ed-crumb"[^>]*)>([^<]*)<\/p>/);
      crumb = match ? { textContent: match[2], hidden: /\bhidden\b/.test(match[1]) } : null;
    },
    querySelector(selector) {
      if (selector === "#ed-crumb") return crumb;
      if (selector === "details.tools") return tools;
      return new EventTarget();
    },
  };
  const exports = {};
  runInNewContext(navScript, {
    exports, window, location,
    document: {
      documentElement: { dataset: {} },
      querySelector: () => header,
      querySelectorAll: (selector) => selector.includes(", #ed-crumb") && crumb ? [crumb] : [],
      addEventListener() {},
    },
    localStorage: { getItem: () => null },
    matchMedia: () => new EventTarget(),
    require: (id) => {
      if (id === "./effects-routes") return routes;
      assert.equal(id, "./i18n");
      return {
        getLocale: () => locale,
        onLocaleChange() {},
        LOCALES: [{ code: locale, native: locale }],
        t: (key) => key.split(".").reduce((value, part) => value?.[part], dict) ?? key,
      };
    },
  });
  exports.mountToolsMenu();
  return {
    window,
    changeHash(hash, event) {
      location.hash = hash;
      window.dispatchEvent(new Event(event));
    },
    assertCurrent(href) {
      const anchors = [...header.innerHTML.matchAll(/<a ([^>]+)>/g)].map((match) => match[1]);
      for (const marker of ['aria-current="page"', 'class="cur"']) {
        assert.deepEqual(
          anchors.filter((attrs) => attrs.includes(marker)).map((attrs) => attrs.match(/href="([^"]+)"/)[1]),
          href ? [href] : [],
        );
      }
    },
    get html() { return header.innerHTML; },
    get crumb() { return crumb; },
  };
}

test("shell: open tools menu fits below a wrapped header and updates on resize", () => {
  let top = 140;
  const menu = { style: { maxHeight: "" }, getBoundingClientRect: () => ({ top }) };
  const tools = new EventTarget();
  tools.querySelector = (selector) => selector === ".tools-menu" ? menu : null;
  const { window } = mountHeader("/", "", "en", {}, tools);
  window.innerHeight = 650;

  tools.open = true;
  tools.dispatchEvent(new Event("toggle"));
  assert.equal(menu.style.maxHeight, "498px");

  top = 80.5;
  window.innerHeight = 600;
  window.dispatchEvent(new Event("resize"));
  assert.equal(menu.style.maxHeight, "507px");

  top = 140;
  window.innerHeight = 200;
  window.dispatchEvent(new Event("resize"));
  assert.equal(menu.style.maxHeight, "48px");

  tools.open = false;
  tools.dispatchEvent(new Event("toggle"));
  window.dispatchEvent(new Event("resize"));
  assert.equal(menu.style.maxHeight, "");
});

test("shell: editor header keeps the effect crumb writable and visible across renders", () => {
  for (const [path, locale] of [["/editor/", "en"], ["/zh/editor/", "zh"]]) {
    const header = mountHeader(path, "#fire", locale, {});
    assert.equal(header.crumb?.hidden, false);
    header.crumb.textContent = "Fireball";
    header.changeHash("#ice", "hashchange");
    assert.equal(header.crumb?.hidden, false);
    assert.equal(header.crumb.textContent, "Fireball");
  }
  assert.equal(mountHeader("/feel/", "", "en", {}).crumb, null);
});

const editorSource = fs.readFileSync("src/editor.ts", "utf8");

function editorFunction(name) {
  const start = editorSource.indexOf(`function ${name}(`);
  const end = editorSource.indexOf("\n}", start) + 2;
  return ts.transpileModule(editorSource.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

test("shell: a missing editor crumb does not interrupt boot before export bindings", () => {
  const boot = editorSource.slice(editorSource.indexOf("function runEditor("));
  assert.match(boot, /syncEditorHeading\(entry\);[\s\S]*expBtns\[0\]\.addEventListener/);
  assert.match(boot, /onLocaleChange\(\(\) => \{\s*syncEditorHeading\(entry\)/);
  assert.doesNotMatch(boot, /\$\("#ed-crumb"\)\.textContent/);
  const document = { title: "", querySelector: () => null };
  runInNewContext(editorFunction("syncEditorHeading") + '\nsyncEditorHeading({ name: "Fireball" });', {
    document,
    fxName: (entry) => entry.name,
    t: (key, { name }) => `${key}: ${name}`,
  });
  assert.equal(document.title, "title.fx: Fireball");
});

test("shell: editor locale follows its URL and returns to the same library and category", () => {
  const i18n = ts.transpileModule(fs.readFileSync("src/lib/i18n.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [pathname, expected, library, next, nextPath] of [
    ["/editor/", "en", "/effects/", "ja", "/ja/editor/"],
    ["/zh/editor/", "zh", "/zh/effects/", "en", "/editor/"],
  ]) {
    const assignments = [];
    const location = { pathname, search: "?fx=fire/fireball", hash: "#fire", assign: (url) => assignments.push(url) };
    const exports = {};
    runInNewContext(i18n, {
      exports, location,
      navigator: { languages: ["ja"], language: "ja" },
      localStorage: { getItem: () => null },
      document: { documentElement: { lang: expected } },
      require: () => ({ default: {} }),
    });
    assert.equal(exports.getLocale(), expected);
    const returnUrl = () => runInNewContext(editorFunction("libraryReturnUrl") + "\nlibraryReturnUrl();", {
      location, getLocale: exports.getLocale, effectCategory: routes.effectCategory,
    });
    assert.equal(returnUrl(), library + "#fire");
    location.hash = "";
    assert.equal(returnUrl(), library);
    location.hash = "#fire";
    exports.setLocale(next);
    assert.deepEqual(assignments, [nextPath + "?fx=fire/fireball#fire"]);
  }
});

test("shell: localized Home, Effects and brand links preserve locale roots and select one item", async () => {
  for (const [locale, label] of Object.entries({ en: "Home", zh: "首页", ja: "ホーム", ko: "홈", es: "Inicio" })) {
    const dict = await loadTs(`./src/lib/locales/${locale}.ts`);
    const root = locale === "en" ? "/" : `/${locale}/`;
    assert.equal(dict.nav.home, label);
    const home = mountHeader(root, "", locale, dict);
    assert.ok(home.html.includes(`<a class="brand" href="${root}" aria-label="PixJuice home">`));
    assert.ok(home.html.includes(`<a href="${root}effects/">${dict.nav.effects}</a>`));
    home.assertCurrent(root);
    const library = mountHeader(root + "effects/", "#fire", locale, dict);
    library.assertCurrent(root + "effects/");
  }
});

test("shell: Home section anchors and library categories preserve the current nav item", async () => {
  const dict = await loadTs("./src/lib/locales/en.ts");
  const home = mountHeader("/", "", "en", dict);
  const library = mountHeader("/effects/", "", "en", dict);
  for (const event of ["hashchange", "popstate"]) {
    for (const hash of ["", "#", "#recipes", "#live", "#libraries", "#tools", "#coverage", "#effects-other"]) {
      home.changeHash(hash, event);
      home.assertCurrent("/");
    }
    for (const hash of ["#effects", "#fire"]) {
      home.changeHash(hash, event);
      home.assertCurrent(null);
      library.changeHash(hash, event);
      library.assertCurrent("/effects/");
    }
  }
});

test("shell: old effects bookmarks replace the home entry and preserve locale and category", () => {
  assert.ok(categories.some(({ id }) => id === "fire"));
  for (const root of ["/", "/zh/", "/ja/", "/ko/", "/es/"]) {
    for (const [hash, suffix] of [["#effects", ""], ["#fire", "#fire"]]) {
      const replaced = [];
      const old = { pathname: root, search: "?v=checked", hash, replace: (url) => replaced.push(url) };
      assert.equal(routes.redirectLegacyEffects(old), true);
      assert.deepEqual(replaced, [`${root}effects/?v=checked${suffix}`]);
      assert.equal(routes.legacyEffectsTarget(root + "effects/", old.search, hash), null, "no redirect loop");
    }
    for (const hash of ["", "#live", "#libraries", "#tools", "#coverage", "#recipes", "#unknown"]) {
      assert.equal(routes.legacyEffectsTarget(root, "", hash), null);
    }
  }
  assert.equal(routes.effectCategory("#fire"), "fire");
  assert.equal(routes.effectCategory("#unknown"), "all");
});

test("shell: Feel remains current on the catalog and jump recipe even with an effects hash", async () => {
  const dict = await loadTs("./src/lib/locales/en.ts");
  for (const path of ["/feel/", "/feel/jump/"]) {
    mountHeader(path, "#effects", "en", dict).assertCurrent("/feel/");
  }
});

test("shell: homepage is an advisor station, not only effects or two feel recipes", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(html, /data-i18n="home\.heroH"/);
  assert.match(html, /data-i18n="home\.heroCtaFx"/);
  assert.match(html, /data-i18n="home\.heroCtaRecipes"/);
  assert.match(html, /data-i18n="home\.heroCtaTemplates"/);
  assert.match(html, /id="live"/);
  assert.match(html, /id="recipes"/);
  assert.doesNotMatch(html, /id="(?:effects|grid|chips)"|<canvas|src="\/src\/main\.ts"/);
  assert.match(html, /src="\/src\/home\.ts"/);
  assert.match(html, /href="\/feel\/hit\/"/);
  assert.match(html, /href="\/feel\/boss-hp\/"/);
  assert.match(html, /href="\/templates\/"/);
  assert.match(html, /href="\/free-assets\/"/);
  assert.match(html, /href="\/effects\/"/);
  assert.match(html, /href="\/feel\/jump\/"/);
  assert.match(html, /href="\/templates\/gacha\/"/);
  assert.match(html, /data-preview="feel-hit"/);
  assert.match(html, /data-preview="feel-boss"/);
  assert.match(html, /src="\/previews\/effects-preview\.jpg"/);
  assert.equal((html.match(/class="recipe-card"/g) || []).length, 3);
  assert.match(html, /class="recipe-card"/);
  assert.match(html, /data-i18n="feel\.recipe\.hit\.solves"/);
  assert.match(html, /data-i18n="feel\.recipe\.hit\.cta"/);
  assert.match(html, /id="coverage"/);
  assert.match(html, /data-i18n-html="home\.scopeList"/);
  assert.ok(!/id="problems"/.test(html), "duplicate problem-card row is gone");
  assert.ok(!/dynamic preview|live preview|动态预览|实时预览/i.test(html), "static JPGs must not be called live/dynamic previews");
  assert.equal((html.match(/href="\/feel\/[^"]+"/g) || []).every((h) =>
    ["/feel/hit/", "/feel/boss-hp/", "/feel/jump/", "/feel/"].some((ok) => h.includes(ok))
  ), true);
  assert.ok(!/href="\/feel\/(shake|hit-stop|squash|coyote)/.test(html));
});

test("shell: /feel/ shows six complete recipe cards first and does not invent component URLs", () => {
  const html = fs.readFileSync("feel/index.html", "utf8");
  const recipesAt = html.indexOf('id="recipes"');
  const upcomingAt = html.indexOf("feel-upcoming");
  const domainsAt = html.indexOf("feel-domains");
  assert.ok(recipesAt > 0 && recipesAt < upcomingAt && upcomingAt < domainsAt, "catalog, then folded context and domains");
  assert.ok(!html.includes("feel-problems"), "duplicate problem cards are not a second full-width row");
  assert.match(html, /class="recipe-grid"/);
  assert.match(html, /data-preview="feel-hit"/);
  assert.match(html, /data-preview="feel-boss"/);
  assert.match(html, /data-i18n="feel\.recipe\.hit\.solves"/);
  assert.match(html, /data-i18n="feel\.recipe\.hit\.cta"/);
  assert.match(html, /data-i18n="feel\.componentsNote"/);
  const hrefs = [...html.matchAll(/href="(\/feel\/[^"]+)"/g)].map((m) => m[1]);
  const allowed = new Set(["/feel/", "/feel/hit/", "/feel/boss-hp/", "/feel/jump/", "/feel/move/", "/feel/camera/", "/feel/spring/"]);
  for (const h of hrefs) assert.ok(allowed.has(h), `unexpected feel href ${h}`);
  assert.ok(html.includes("<details") && html.includes("feel.moreDomains"), "domain notes remain folded");
});

test("shell: recipe card previews are real image files, not placeholders", () => {
  for (const lang of ["en", "zh"]) {
    for (const name of ["feel-hit", "feel-boss", "effects"]) {
      const path = `public/previews/${lang}/${name}.jpg`;
      assert.ok(fs.existsSync(path), path);
      assert.ok(fs.statSync(path).size > 8000, `${path} should be a real photo, not an empty stub`);
    }
  }
});

test("shell: new browsing copy exists in all five locales and does not invent a component count", async () => {
  const keys = [
    "nav.tagline", "nav.theme",
    "home.heroH", "home.heroLede", "home.heroCtaFx", "home.heroCtaRecipes", "home.heroCtaTemplates",
    "home.nowH", "home.fxCardT", "home.scopeH", "home.scopeLede", "home.scopeList", "home.gachaCardD", "effects.h1", "effects.lede",
    "feel.catalogH", "feel.catalogLede", "feel.catalogBlurb", "feel.moreDomains", "feel.componentsNote",
    "feel.recipe.hit.solves", "feel.recipe.boss.solves",
  ];
  const lookup = (dict, key) => key.split(".").reduce((v, k) => (v && typeof v === "object") ? v[k] : undefined, dict);
  for (const lang of ["en", "zh", "ja", "ko", "es"]) {
    const dict = await loadTs(`./src/lib/locales/${lang}.ts`);
    for (const key of keys) {
      const v = lookup(dict, key);
      assert.equal(typeof v, "string", `${lang} ${key}`);
      assert.ok(v.length > 0, `${lang} ${key} empty`);
    }
    assert.match(dict.effects.lede, /244/);
    assert.ok(!/244/.test(dict.feel.catalogBlurb), "feel catalog blurb must not claim 244 components");
  }
});

test("shell: effects library owns the renderer, localized links and editor return", () => {
  const localize = fs.readFileSync("scripts/localize-pages.mjs", "utf8");
  const home = fs.readFileSync("src/home.ts", "utf8");
  const library = fs.readFileSync("effects/index.html", "utf8");
  const renderer = fs.readFileSync("src/main.ts", "utf8");
  const editor = fs.readFileSync("src/editor.ts", "utf8");
  const config = fs.readFileSync("vite.config.ts", "utf8");
  assert.match(library, /id="grid"/);
  assert.match(library, /src="\/src\/main\.ts"/);
  assert.doesNotMatch(home, /lib\/(catalog|player)|requestAnimationFrame/);
  assert.match(home, /redirectLegacyEffects\(location\)/);
  assert.match(config, /effects: "effects\/index\.html"/);
  assert.match(config, /fx-categories/);
  for (const event of ["hashchange", "popstate"]) {
    assert.ok(renderer.includes(`addEventListener("${event}", syncCategoryFromLocation)`));
  }
  assert.match(renderer, /history\.pushState/);
  assert.ok(renderer.includes('${prefix}/editor/?fx='));
  assert.ok(editor.includes('${prefix}/effects/'));
  assert.equal((editor.match(/location\.replace\(libraryReturnUrl\(\)\)/g) || []).length, 2);
  assert.match(localize, /'image-to-pixel-art\/': \{ title: 'title\.pa'/);
  assert.match(localize, /path==='effects\/'\?'effects'/);
  const prefixSource = localize.slice(localize.indexOf("const LOCALE_PREFIXES"), localize.indexOf("for(const path of paths)"));
  const prefixLinks = runInNewContext(prefixSource + "\nprefixLocalizedHrefs");
  for (const locale of ["zh", "ja", "ko", "es"]) {
    assert.equal(prefixLinks('<a href="/effects/">Effects</a>', locale), `<a href="/${locale}/effects/">Effects</a>`);
  }
});

test("shell: hit catalog stills have no black side bars", () => {
  const script = `
from PIL import Image
ok = True
for lang in ("en", "zh"):
    im = Image.open(f"public/previews/{lang}/feel-hit.jpg").convert("RGB")
    w, h = im.size
    def dark(c):
        r,g,b = c
        return r <= 30 and g <= 30 and b <= 30
    left = sum(1 for y in range(h) if dark(im.getpixel((0, y)))) / h
    right = sum(1 for y in range(h) if dark(im.getpixel((w-1, y)))) / h
    if left > 0.08 or right > 0.08:
        print(f"FAIL {lang} left={left:.2f} right={right:.2f}")
        ok = False
print("OK" if ok else "BAD")
`;
  const out = execFileSync("python3", ["-c", script], { cwd: ".", encoding: "utf8" });
  assert.match(out, /OK/, out);
});
