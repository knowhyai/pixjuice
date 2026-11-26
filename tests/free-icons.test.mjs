import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(path, "utf8");
const html = read("free-icons/index.html");
const locales = ["en", "zh", "ja", "ko", "es"];
const cards = [...html.matchAll(/<article class="resource-card" data-category="(\w+)">([\s\S]*?)<\/article>/g)];
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
  for (const [index, [, category, card]] of cards.entries()) {
    assert.match(card, new RegExp(`class="fi-category" data-i18n="fi\\.${category}"`));
    assert.equal([...card.matchAll(/<dt /g)].length, 4);
    assert.equal([...card.matchAll(/<dd /g)].length, 4);
    assert.equal(new URL(card.match(/<h2><a href="([^"]+)"/)[1]).hostname, officialHosts[index]);
    for (const [, href, attrs] of card.matchAll(/<a href="([^"]+)"([^>]*)>/g)) {
      assert.equal(new URL(href).protocol, "https:");
      assert.match(attrs, /target="_blank" rel="noopener"/);
    }
    const license = card.match(/href="([^"]+)" class="resource-source"/)[1];
    const repo = repos[index] && `https://github.com/${repos[index]}`;
    if (repo) {
      assert.ok(card.includes(`href="${repo}"`));
      assert.ok(license.startsWith(`${repo}/blob/`));
      assert.match(license, /\/(?:LICENSE|LICENSING\.md|license\.txt)$/);
    } else {
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

test("each icon directory locale has independent copy and accurate license labels", async () => {
  const gameIconsTerms = {
    en: /both commercial and noncommercial use and requires author attribution for both.*CC0, which requires no attribution/,
    zh: /商用和非商用，两种用途都必须注明作者.*CC0，无需署名/,
    ja: /商用・非商用.*いずれの場合も.*作者表記が必要.*CC0.*作者表記が不要/,
    ko: /상업적·비상업적 이용.*두 경우 모두.*저작자를 표시해야.*CC0.*저작자 표시가 필요 없습니다/,
    es: /uso comercial y no comercial y exige atribuir la autoría en ambos casos.*CC0, que no exige atribución/,
  };
  const requiredNotices = {
    en: /retain the copyright and permission notices/,
    zh: /保留版权声明和许可声明/,
    ja: /著作権表示と許諾表示を保持/,
    ko: /저작권 고지와 허가 고지를 유지/,
    es: /conservar el aviso de copyright y el de permiso/,
  };
  const requiredKeys = [
    ...Array.from(html.matchAll(/data-i18n(?:-aria)?="(fi\.[^"]+)"/g), ([, key]) => key),
    "fi.count", "fi.q", "fi.a", "nav.freeIcons", "title.freeIcons", "title.freeIconsDesc",
  ];
  for (const locale of locales) {
    const source = transpile(`src/lib/locales/${locale}.ts`);
    const { default: dictionary } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
    for (const key of new Set(requiredKeys)) {
      const value = key.split(".").reduce((entry, part) => entry?.[part], dictionary);
      assert.ok(typeof value === "string" && value.trim(), `${locale}: ${key}`);
    }
    assert.match(dictionary.fi.count, /\{count\}/);
    assert.match(dictionary.foot.templates, /href="\/free-icons\/"/);
    for (const [key, { license }] of Object.entries(dictionary.fi.cards)) {
      if (locale === "en") {
        assert.ok(html.includes(`data-i18n="fi.cards.${key}.license">${license}</dd>`), key);
      }
      if (key === "gameIcons") {
        assert.match(license, /CC BY 3\.0.*CC0/);
        assert.match(license, gameIconsTerms[locale], locale);
        assert.match(license, /Icons made by \{author\}/);
      } else if (key === "nieobie" || key === "kenney") {
        assert.match(license, /CC0 1\.0/);
      } else {
        assert.match(license, key === "lucide" ? /ISC.*MIT/ : /MIT/);
        assert.doesNotMatch(license, /CC0|CC BY/);
        assert.match(license, requiredNotices[locale], `${locale}: ${key}`);
      }
    }
    assert.equal(Object.keys(dictionary.fi.cards).length, categories.all);
  }
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
