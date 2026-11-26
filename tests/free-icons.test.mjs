import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(path, "utf8");
const html = read("free-icons/index.html");
const locales = ["en", "zh", "ja", "ko", "es"];
const cards = [...html.matchAll(/<article class="resource-card" data-category="(\w+)" data-library="([\w-]+)">([\s\S]*?)<\/article>/g)];
const categories = { all: 12, animated: 4, game: 5, ui: 3 };

function transpile(path, module = ts.ModuleKind.ESNext) {
  return ts.transpileModule(read(path), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module },
  }).outputText;
}

test("icon directory ships 12 visible, categorized cards with official and license links", () => {
  const repos = [
    "kubai087/kubai-icons", "Avijit07x/animateicons", "pqoqubbw/icons", "cyberalien/line-md",
    "game-icons/icons", "Nieobie/game-icon-pack", "halfmage/pixelarticons", "shuqikhor/pixel-icons",
    null, "lucide-icons/lucide", "tabler/tabler-icons", "phosphor-icons/core",
  ];
  const officialHosts = [
    "icons.kubai.design", "animateicons.in", "lucide-animated.com", "icon-sets.iconify.design",
    "game-icons.net", "nieobie.itch.io", "pixelarticons.com", "sqkhor.com", "kenney.nl",
    "lucide.dev", "tabler.io", "phosphoricons.com",
  ];
  assert.equal(cards.length, categories.all);
  for (const category of ["animated", "game", "ui"]) {
    assert.equal(cards.filter(([, value]) => value === category).length, categories[category]);
  }
  for (const [index, [, , id, card]] of cards.entries()) {
    const licenses = { "game-icons": "CC BY 3.0", nieobie: "CC0 1.0", kenney: "CC0 1.0", lucide: "ISC / MIT" };
    assert.equal(card.match(/class="fi-license"[^>]*>([^<]+)</)[1], licenses[id] ?? "MIT", id);
    assert.doesNotMatch(card, /<(dl|dt|dd)\b/);
    assert.equal(new URL(card.match(/<h2><a href="([^"]+)"/)[1]).hostname, officialHosts[index]);
    for (const [, before, href, after] of card.matchAll(/<a\b([^>]*?)href="([^"]+)"([^>]*)>/g)) {
      assert.equal(new URL(href).protocol, "https:");
      assert.match(before + after, /target="_blank" rel="noopener"/);
    }
    const license = card.match(/href="([^"]+)" class="resource-source"/)[1];
    const repo = repos[index] && `https://github.com/${repos[index]}`;
    if (repo) {
      assert.ok(card.includes(`href="${repo}"`));
      assert.ok(license.startsWith(`${repo}/blob/`));
      assert.match(license, /\/(?:LICENSE|LICENSING\.md|license\.txt)$/);
    } else {
      assert.doesNotMatch(card, /href="https:\/\/github\.com/);
      assert.equal(license, "https://kenney.nl/support");
    }
  }
  const nav = read("src/lib/navmenu.ts");
  assert.match(nav, /"\/free-resources\/",\s*"\/free-icons\/"/);
  assert.match(nav, /"fr.h1", "nav.freeIcons"/);
  for (const page of ["free-assets", "free-resources"]) {
    const source = read(`${page}/index.html`);
    assert.match(source, /class="tools-menu"[\s\S]*?href="\/free-icons\/"/);
    assert.match(source, /class="tpl-hero"(?:(?!<\/section>)[\s\S])*href="\/free-icons\/"/);
  }
});

test("each tray leads with its own local, licensed samples", () => {
  const sampleRoot = "public/free-icons/samples";
  const notice = read(`${sampleRoot}/NOTICE.md`);
  const folders = readdirSync(sampleRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  assert.deepEqual(folders.map((entry) => entry.name).sort(), cards.map(([, , id]) => id).filter((id) => id !== "kenney").sort());
  for (const [, , id, card] of cards) {
    const images = [...card.matchAll(/<img src="([^"]+)" alt=""/g)].map(([, url]) => url);
    if (id === "kenney") {
      assert.equal(images.length, 0);
      assert.match(card, /data-i18n="fi\.kenneyUnavailable"/);
      assert.match(notice, /Kenney Game Icons[\s\S]*official signed-download endpoint returned a forbidden response/);
      continue;
    }
    assert.ok(images.length >= 6 && images.length <= 8, id);
    assert.equal(new Set(images).size, images.length, id);
    assert.match(card, /^\s*<div class="fi-samples" aria-hidden="true">/);
    const libraryNotice = notice.split(`## ${id}\n`)[1].split("\n## ")[0];
    const repo = card.match(/href="https:\/\/github\.com\/([^"]+)" class="fi-repo"/)[1];
    const sampleFiles = [];
    for (const url of images) {
      const filename = url.split("/").at(-1);
      assert.equal(url, `/free-icons/samples/${id}/${filename}`);
      const origin = libraryNotice.split(`[${filename}](https://raw.githubusercontent.com/${repo}/`)[1];
      assert.match(origin ?? "", /^[a-f0-9]{40}\/[^\s)]+\)/, url);
      const svg = read(`public${url}`);
      assert.match(svg, /<svg\b/);
      if (id === "line-md" && ["heart.svg", "star.svg"].includes(filename)) {
        assert.match(svg, /prefers-reduced-motion/);
        assert.match(svg, /@keyframes/);
      } else {
        assert.doesNotMatch(svg, /@keyframes|<animate\b/);
      }
      sampleFiles.push(filename);
    }
    assert.deepEqual(readdirSync(`${sampleRoot}/${id}`).filter((name) => name.endsWith(".svg")).sort(), sampleFiles.sort());
  }
  const gameIcons = cards.find(([, , id]) => id === "game-icons")[3];
  assert.match(gameIcons, /<p class="fi-credit"><a href="https:\/\/lorcblog\.blogspot\.com\/"[^>]*>Icons made by Lorc<\/a>/);
  assert.match(gameIcons, /href="https:\/\/creativecommons\.org\/licenses\/by\/3\.0\/"/);
  assert.doesNotMatch(html, /\.zip\b|<a[^>]+\bdownload\b/i);
  assert.doesNotMatch(readdirSync(sampleRoot, { recursive: true }).join("\n"), /\.zip\b/i);
});

test("each icon directory locale has every translation key used by the page", async () => {
  const requiredKeys = [
    ...Array.from(html.matchAll(/data-i18n(?:-aria|-html)?="([^"]+)"/g), ([, key]) => key),
    "fi.count", "fi.q", "fi.a", "title.freeIcons", "title.freeIconsDesc",
  ];
  const ledes = new Set();
  for (const locale of locales) {
    const source = transpile(`src/lib/locales/${locale}.ts`);
    const { default: dictionary } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
    for (const key of new Set(requiredKeys)) {
      const value = key.split(".").reduce((entry, part) => entry?.[part], dictionary);
      assert.ok(typeof value === "string" && value.trim(), `${locale}: ${key}`);
    }
    ledes.add(dictionary.fi.lede);
    assert.match(dictionary.fi.count, /\{count\}/);
    assert.match(dictionary.foot.templates, /href="\/free-icons\/"/);
    for (const key of ["cards", "style", "formats", "license", "best"]) {
      assert.equal(dictionary.fi[key], undefined, `${locale}: unused fi.${key}`);
    }
  }
  assert.equal(ledes.size, locales.length);
});

test("static translations preserve the Japanese footer links on free resources", () => {
  const footerKey = read("free-resources/index.html").match(/data-i18n-html="(foot\.templates)"/)[1];
  const footer = {
    dataset: { i18nHtml: footerKey },
    querySelectorAll(selector) {
      assert.equal(selector, 'a[href^="/"]');
      return this.links.filter((link) => link.getAttribute("href").startsWith("/"));
    },
    set innerHTML(markup) {
      const hrefs = Array.from(markup.matchAll(/<a href="([^"]+)"/g), ([, href]) => href);
      this.links = hrefs.map((href) => ({
        getAttribute: () => href,
        setAttribute: (_, value) => { href = value; },
      }));
    },
  };
  const window = { PixStrings: { ja: {
    "test.links": ["/", "/templates?tag=ui#cards", "/ja/free-icons/", "/credits/", "/previews/en/game.jpg", "//example.com/", "https://example.com/"]
      .map((href) => `<a href="${href}">link</a>`).join(""),
  } } };
  const other = Object.create(footer);
  other.dataset = { i18nHtml: "test.links" };
  const document = {
    documentElement: {},
    querySelectorAll: (selector) => selector === "[data-i18n-html]" ? [footer, other] : [],
  };
  const exports = {};
  runInNewContext(transpile("src/lib/i18n.ts", ts.ModuleKind.CommonJS), {
    exports, window, document,
    location: { pathname: "/ja/free-resources/" },
    require(path) {
      if (path.startsWith("./locales/") && !path.endsWith(".json")) {
        const exports = {};
        runInNewContext(transpile(`src/lib/${path.slice(2)}.ts`, ts.ModuleKind.CommonJS), { exports });
        return exports;
      }
      return {};
    },
  });
  for (let pass = 0; pass < 2; pass++) {
    exports.applyStaticText();
    assert.deepEqual(footer.links.map((link) => link.getAttribute("href")), [
      "/ja/templates/", "/ja/free-assets/", "/ja/free-resources/", "/ja/free-icons/",
    ]);
    assert.deepEqual(other.links.map((link) => link.getAttribute("href")), [
      "/ja/", "/ja/templates?tag=ui#cards", "/ja/free-icons/", "/credits/", "/previews/en/game.jpg", "//example.com/", "https://example.com/",
    ]);
  }
});

test("icon filters change visible cards and announce the count in the current language", () => {
  let locale = "en";
  let changeLocale;
  const toolbar = { hidden: true, querySelectorAll: () => buttons };
  const count = { hidden: true };
  const elements = cards.map(([, category]) => ({ dataset: { category } }));
  const buttons = Object.keys(categories).map((filter) => ({
    dataset: { filter },
    classList: { toggle(name, selected) { this[name] = selected; } },
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, callback) { this[name] = callback; },
  }));
  runInNewContext(transpile("src/pages/free-icons.ts", ts.ModuleKind.CommonJS), {
    exports: {},
    document: {
      querySelector: (selector) => ({ ".fi-filters": toolbar, ".fi-count": count })[selector],
      querySelectorAll: (selector) => selector.includes("data-category") ? elements : [],
    },
    require: (path) => path.endsWith("/i18n") ? {
      applyStaticText() {},
      getLocale: () => locale,
      onLocaleChange: (callback) => { changeLocale = callback; },
      t: (key, values) => `${locale} ${key} ${values.count}`,
    } : { mountToolsMenu() {} },
  });
  assert.equal(toolbar.hidden, false);
  assert.equal(count.hidden, false);
  assert.match(html, /class="fi-count" role="status"/);
  assert.equal(count.textContent, "en fi.count 12");
  for (const filter of ["ui", "animated", "game", "all", "game"]) {
    buttons.find((button) => button.dataset.filter === filter).click();
    assert.equal(count.textContent, `en fi.count ${categories[filter]}`);
    for (const card of elements) assert.equal(card.hidden, filter !== "all" && filter !== card.dataset.category);
    for (const button of buttons) {
      assert.equal(button["aria-pressed"], String(button.dataset.filter === filter));
      assert.equal(button.classList.on, button.dataset.filter === filter);
    }
  }
  locale = "ja";
  changeLocale();
  assert.equal(count.textContent, "ja fi.count 5");
});
