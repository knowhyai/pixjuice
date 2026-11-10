// Tiny homemade i18n: nested dictionaries, English as the source of truth and the fallback
// for every missing key. No runtime dependency. The clean URL is English / x-default;
// ?lang=zh|ja|ko|es is the matching hreflang URL. A language pick swaps text in place
// (no reload, so ?fx= survives) and writes that param.

import EN, { type Dict } from "./locales/en";
import ZH from "./locales/zh";
import JA from "./locales/ja";
import KO from "./locales/ko";
import ES from "./locales/es";
import fxZh from "./locales/fx-zh.json";
import fxFa from "./locales/fx-ja.json";
import fxKo from "./locales/fx-ko.json";
import fxEs from "./locales/fx-es.json";

export type Locale = "en" | "zh" | "ja" | "ko" | "es";

/** The picker's entries — labels are each language's native name, identical in every locale. */
export const LOCALES: { code: Locale; native: string }[] = [
  { code: "en", native: "English" },
  { code: "zh", native: "简体中文" },
  { code: "ja", native: "日本語" },
  { code: "ko", native: "한국어" },
  { code: "es", native: "Español" },
];

const DICTS: Record<Locale, Partial<Dict>> = { en: EN, zh: ZH, ja: JA, ko: KO, es: ES };

/** Generated effect-name/description dictionaries (may be partial — English covers the gaps). */
type FxEntry = { n: string; d: string };
const FX: Partial<Record<Locale, Record<string, FxEntry>>> = {
  zh: fxZh as Record<string, FxEntry>,
  ja: fxFa as Record<string, FxEntry>,
  ko: fxKo as Record<string, FxEntry>,
  es: fxEs as Record<string, FxEntry>,
};

const STORAGE_KEY = "pixjuice-lang";

/** BCP 47 for <html lang>. Simplified Chinese is zh-Hans, not the bare locale code. */
const HTML_LANG: Record<Locale, string> = {
  en: "en",
  zh: "zh-Hans",
  ja: "ja",
  ko: "ko",
  es: "es",
};

const OG_LOCALE: Record<Locale, string> = {
  en: "en_US",
  zh: "zh_CN",
  ja: "ja_JP",
  ko: "ko_KR",
  es: "es_ES",
};

function queryLocale(): Locale | null {
  try {
    let q = new URLSearchParams(location.search).get("lang");
    if (q === "zh-Hans") q = "zh";
    if (q && q in DICTS) return q as Locale;
  } catch {
    /* */
  }
  return null;
}

function detect(): Locale {
  const fromQuery = queryLocale();
  if (fromQuery) {
    try {
      localStorage.setItem(STORAGE_KEY, fromQuery);
    } catch {
      /* private mode — this page still honors the query */
    }
    return fromQuery;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in DICTS) return saved as Locale;
  } catch {
    /* private mode etc. — fall through to the browser language */
  }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of langs) {
    const head = (l ?? "").toLowerCase().split("-")[0];
    if (head === "zh" || head === "ja" || head === "ko" || head === "es") return head;
  }
  return "en";
}

let locale: Locale = detect();

document.documentElement.lang = HTML_LANG[locale];

export function getLocale(): Locale {
  return locale;
}

function lookup(dict: unknown, path: string[]): unknown {
  let node: unknown = dict;
  for (const seg of path) {
    if (node && typeof node === "object" && seg in (node as Record<string, unknown>))
      node = (node as Record<string, unknown>)[seg];
    else return undefined;
  }
  return node;
}

/** Translate a dotted key ("ed.pause") with {var} substitution; falls back to English, then
 *  to the key's last segment — a raw dotted path can never leak into the UI. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const path = key.split(".");
  let str = lookup(DICTS[locale], path) ?? lookup(EN, path);
  if (typeof str !== "string") str = path[path.length - 1];
  if (vars)
    for (const [k, v] of Object.entries(vars)) str = (str as string).replaceAll(`{${k}}`, String(v));
  return str as string;
}

/** Localized display name / description for an effect (English when not generated). */
export function fxName(fx: { id: string; name: string }): string {
  return FX[locale]?.[fx.id]?.n ?? fx.name;
}
export function fxDesc(fx: { id: string; meta: { desc?: string } }): string {
  return FX[locale]?.[fx.id]?.d ?? fx.meta.desc ?? "";
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** Register a callback that re-renders page-level text when the locale changes. */
export function onLocaleChange(fn: Listener): void {
  listeners.add(fn);
}

/** Point canonical, hreflang, and og:url at this page's language URL (and ?fx= when present). */
export function syncAlternates(lang: Locale = queryLocale() ?? "en"): void {
  const canonicalEl = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonicalEl) return;
  let origin: string;
  try {
    origin = new URL(canonicalEl.href).origin;
  } catch {
    return;
  }
  const fx = new URLSearchParams(location.search).get("fx");
  const build = (code: string | null) => {
    const u = new URL(location.pathname, origin);
    if (fx) u.searchParams.set("fx", fx);
    if (code) u.searchParams.set("lang", code);
    return u.href;
  };
  const current = build(lang === "en" ? null : lang);
  canonicalEl.href = current;
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", current);
  document.querySelector('meta[property="og:locale"]')?.setAttribute("content", OG_LOCALE[lang]);
  document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]').forEach((a) => {
    const h = a.hreflang.toLowerCase();
    if (h === "x-default" || h === "en") a.href = build(null);
    else if (h === "zh-hans" || h === "zh") a.href = build("zh");
    else if (h === "ja" || h === "ko" || h === "es") a.href = build(h);
  });
}

/** Swap the session language in place — no reload, so ?fx= and scroll position survive. */
export function setLocale(next: Locale): void {
  if (!(next in DICTS) || next === locale) return;
  locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* can't persist — this session only */
  }
  const url = new URL(location.href);
  if (next === "en") url.searchParams.delete("lang");
  else url.searchParams.set("lang", next);
  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  const cur = `${location.pathname}${location.search}${location.hash}`;
  if (nextHref !== cur) history.replaceState(null, "", nextHref);
  document.documentElement.lang = HTML_LANG[next];
  applyStaticText(document);
  syncAlternates(next);
  for (const fn of listeners) fn();
}

/**
 * Apply translations to static markup: elements carry
 *   data-i18n="key"        → textContent
 *   data-i18n-html="key"   → innerHTML (keys whose English contains markup/links)
 *   data-i18n-ph="key"     → placeholder
 *   data-i18n-title="key"  → title (tooltip)
 *   data-i18n-aria="key"   → aria-label
 * Safe to call repeatedly (initial paint + every language switch).
 */
export function applyStaticText(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((e) => {
    e.textContent = t(e.dataset.i18n!);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((e) => {
    e.innerHTML = t(e.dataset.i18nHtml!);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-ph]").forEach((e) => {
    e.setAttribute("placeholder", t(e.dataset.i18nPh!));
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((e) => {
    e.setAttribute("title", t(e.dataset.i18nTitle!));
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((e) => {
    e.setAttribute("aria-label", t(e.dataset.i18nAria!));
  });
}

/** Wire the header's <select id="lang"> (present on every page's raw HTML, English-default). */
export function mountLangSwitcher(): void {
  const sel = document.querySelector<HTMLSelectElement>("#lang");
  if (!sel) return;
  sel.value = locale;
  sel.setAttribute("aria-label", t("lang.aria"));
  sel.addEventListener("change", () => setLocale(sel.value as Locale));
  onLocaleChange(() => {
    sel.value = locale;
    sel.setAttribute("aria-label", t("lang.aria"));
  });
}

// Keep canonical / hreflang aligned with ?lang= and ?fx= once the head tags exist.
syncAlternates();
