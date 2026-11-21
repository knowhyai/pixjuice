// First-round site shell / homepage / feel-catalog consistency.
// Does not claim the whole site is done — it guards the browsing frame we shipped.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const loadTs = (file) => {
  const src = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(src).toString("base64")).then((m) => m.default ?? m);
};

test("shell: shared header lists real sections and a site tagline, not the assets-only subtitle", () => {
  const src = fs.readFileSync("src/lib/navmenu.ts", "utf8");
  assert.match(src, /t\("nav\.tagline"\)/, "brand sub uses nav.tagline");
  assert.match(src, /t\("nav\.effects"\)/, "effects is a first-class nav item");
  assert.match(src, /t\("nav\.feel"\)/);
  assert.match(src, /t\("nav\.templates"\)/);
  assert.match(src, /t\("nav\.assets"\)/);
  assert.match(src, /theme-toggle/, "light/dark control stays in the shared header");
  assert.match(src, /class="mark"/, "pixel mark is remounted, not dropped");
  assert.ok(!/Free game assets/.test(src), "hardcoded assets-only tagline is gone");
  const effectsAt = src.indexOf('link("/#effects"');
  const feelAt = src.indexOf('link("/feel/"');
  const tplAt = src.indexOf('link("/templates/"');
  const assetsAt = src.indexOf('link("/free-assets/"');
  assert.ok(effectsAt < feelAt && feelAt < tplAt && tplAt < assetsAt, "nav order is effects → feel → templates → assets");
});

test("shell: homepage is an advisor station, not only effects or two feel recipes", () => {
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(html, /data-i18n="home\.heroH"/);
  assert.match(html, /data-i18n="home\.heroCtaFx"/);
  assert.match(html, /data-i18n="home\.heroCtaRecipes"/);
  assert.match(html, /data-i18n="home\.heroCtaTemplates"/);
  assert.match(html, /id="live"/);
  assert.match(html, /id="recipes"/);
  assert.match(html, /id="effects"/);
  assert.match(html, /href="\/feel\/hit\/"/);
  assert.match(html, /href="\/feel\/boss-hp\/"/);
  assert.match(html, /href="\/templates\/"/);
  assert.match(html, /href="\/free-assets\/"/);
  assert.match(html, /href="\/#effects"/);
  assert.match(html, /data-preview="feel-hit"/);
  assert.match(html, /data-preview="feel-boss"/);
  assert.match(html, /data-preview="effects"/);
  assert.match(html, /class="recipe-card"/);
  assert.match(html, /data-i18n="feel\.recipe\.hit\.solves"/);
  assert.match(html, /data-i18n="feel\.recipe\.hit\.cta"/);
  assert.match(html, /id="coverage"/);
  assert.match(html, /data-i18n-html="home\.scopeList"/);
  assert.ok(!/id="problems"/.test(html), "duplicate problem-card row is gone");
  assert.ok(!/dynamic preview|live preview|动态预览|实时预览/i.test(html), "static JPGs must not be called live/dynamic previews");
  assert.equal((html.match(/href="\/feel\/[^"]+"/g) || []).every((h) =>
    ["/feel/hit/", "/feel/boss-hp/", "/feel/"].some((ok) => h.includes(ok))
  ), true);
  assert.ok(!/href="\/feel\/(shake|hit-stop|squash|coyote)/.test(html));
});

test("shell: /feel/ shows two complete recipe cards first and does not invent component URLs", () => {
  const html = fs.readFileSync("feel/index.html", "utf8");
  const recipesAt = html.indexOf('id="recipes"');
  const upcomingAt = html.indexOf("feel-upcoming");
  const domainsAt = html.indexOf("feel-domains");
  assert.ok(recipesAt > 0 && recipesAt < upcomingAt && upcomingAt < domainsAt, "catalog, then folded upcoming, then domains");
  assert.ok(!html.includes("feel-problems"), "duplicate problem cards are not a second full-width row");
  assert.match(html, /class="recipe-grid"/);
  assert.match(html, /data-preview="feel-hit"/);
  assert.match(html, /data-preview="feel-boss"/);
  assert.match(html, /data-i18n="feel\.recipe\.hit\.solves"/);
  assert.match(html, /data-i18n="feel\.recipe\.hit\.cta"/);
  assert.match(html, /data-i18n="feel\.componentsNote"/);
  const hrefs = [...html.matchAll(/href="(\/feel\/[^"]+)"/g)].map((m) => m[1]);
  const allowed = new Set(["/feel/", "/feel/hit/", "/feel/boss-hp/"]);
  for (const h of hrefs) assert.ok(allowed.has(h), `unexpected feel href ${h}`);
  assert.ok(html.includes("<details") && html.includes("feel.moreDomains"), "unbuilt domains are folded, not empty category pages");
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
    "home.nowH", "home.fxCardT", "home.scopeH", "home.scopeLede", "home.scopeList", "home.fxLede",
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
    assert.match(dict.home.fxLede, /244/);
    assert.ok(!/244/.test(dict.feel.catalogBlurb), "feel catalog blurb must not claim 244 components");
  }
});

test("shell: localize-pages maps tool SEO titles and prefixes /#effects in every locale", () => {
  const src = fs.readFileSync("scripts/localize-pages.mjs", "utf8");
  assert.match(src, /'image-to-pixel-art\/': \{ title: 'title\.pa'/);
  assert.match(src, /function prefixLocalizedHrefs/);
  assert.match(src, /prefixLocalizedHrefs\(html, lang\)/);
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
