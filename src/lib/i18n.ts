// Tiny homemade i18n: nested dictionaries, English as the source of truth and the fallback
// for every missing key. No runtime dependency, no URL routing — the canonical URLs stay
// English (SEO), and a language pick only swaps visible text for that session.

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

function detect(): Locale {
  const prefix = location.pathname.split("/")[1];
  if (["zh", "ja", "ko", "es"].includes(prefix)) return prefix as Locale;
  if (/^\/(templates|free-assets|free-resources)(\/|$)/.test(location.pathname)) return "en";
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

// Raw HTML ships lang="en" for crawlers; once JS runs with a non-English session language,
// correct the attribute so screen readers match what's on screen.
if (locale !== "en") document.documentElement.lang = locale;

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

/** Swap the session language in place — no reload, so ?fx= and scroll position survive. */
export function setLocale(next: Locale): void {
  if (!(next in DICTS) || next === locale) return;
  const path = location.pathname.replace(/^\/(zh|ja|ko|es)(?=\/)/, "");
  if (/^\/(templates|free-assets|free-resources)(\/|$)/.test(path)) {
    location.assign((next === "en" ? "" : "/" + next) + path + location.search + location.hash);
    return;
  }
  locale = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* can't persist — this session only */
  }
  document.documentElement.lang = next;
  applyStaticText(document);
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
    let vars: Record<string, string | number> | undefined;
    try { vars = JSON.parse(e.dataset.i18nVars || "null") ?? undefined; } catch { /* static text */ }
    e.textContent = t(e.dataset.i18n!, vars);
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
