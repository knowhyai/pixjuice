import "./style.css";
import { applyStaticText, getLocale, onLocaleChange } from "./lib/i18n";
import { mountToolsMenu } from "./lib/navmenu";
import { redirectLegacyEffects } from "./lib/effects-routes";

function redirectBookmark(): boolean {
  return redirectLegacyEffects(location);
}

if (!redirectBookmark()) {
  function localizeLinks(): void {
    const locale = getLocale();
    const prefix = locale === "en" ? "" : `/${locale}`;
    document.querySelectorAll<HTMLAnchorElement>(".home-page a[href^='/']").forEach((link) => {
      const href = link.getAttribute("href")!;
      link.setAttribute("href", prefix + href.replace(/^\/(zh|ja|ko|es)(?=\/)/, ""));
    });
  }
  applyStaticText();
  localizeLinks();
  mountToolsMenu();
  onLocaleChange(localizeLinks);
}
window.addEventListener("hashchange", redirectBookmark);
window.addEventListener("popstate", redirectBookmark);
