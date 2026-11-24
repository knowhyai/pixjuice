import { legacyEffectsTarget } from "./effects-routes";
import { getLocale, onLocaleChange, t, LOCALES, setLocale } from "./i18n";

/** Pixel mark used in the static HTML of every entry. Kept here so remounting
 *  the shared header doesn't drop the logo. Colors match src/style.css tokens. */
const MARK = `<svg class="mark" viewBox="0 0 16 16" shape-rendering="crispEdges" role="img" aria-hidden="true">
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

const TOOL_PATHS = [
  "/image-to-pixel-art/",
  "/normal-map/",
  "/pixel-art-upscaler/",
  "/sprite-sheet/",
  "/editor/",
  "/free-resources/",
  "/text-fit/",
  "/audio-envelope/",
  "/camera-shake/",
  "/audio-scenes/",
] as const;

const TOOL_KEYS = ["nav.pixel", "nav.normal", "nav.upscale", "nav.sheet", "nav.editor", "fr.h1", "nav.textFit", "nav.uiSounds", "nav.cameraShake", "nav.audioScenes"] as const;

/** One site header, shared by every entry point. */
export function mountToolsMenu(): void {
  const found = document.querySelector<HTMLElement>("header.head");
  if (!found) return;
  const header = found;

  const applyTheme = (): void => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("pixjuice-theme");
    } catch {
      /* private mode */
    }
    document.documentElement.dataset.theme =
      saved || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  };
  applyTheme();
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyTheme);

  function render(): void {
    const l = getLocale();
    const prefix = l === "en" ? "" : "/" + l;
    let path = location.pathname.replace(/^\/(zh|ja|ko|es)(?=\/|$)/, "") || "/";
    if (path !== "/" && !path.endsWith("/")) path += "/";
    const atRoot = path === "/";
    const effects = path === "/effects/";
    const editor = path === "/editor/";
    const crumbText = editor ? header.querySelector("#ed-crumb")?.textContent : null;
    const redirecting = atRoot && legacyEffectsTarget(location.pathname, location.search, location.hash) !== null;
    const inTools = TOOL_PATHS.some((p) => path === p);
    const link = (href: string, label: string, current: boolean): string =>
      `<a href="${prefix}${href}"${current ? ' aria-current="page" class="cur"' : ""}>${label}</a>`;

    header.innerHTML = `<div class="head-in"><a class="brand" href="${prefix}/" aria-label="PixJuice home">${MARK}<div><h1>Pix<em>Juice</em></h1><p class="sub"${editor ? ' id="ed-crumb"' : ""}>${t("nav.tagline")}</p></div></a><nav class="nav" aria-label="Main">${link("/", t("nav.home"), atRoot && !redirecting)}${link("/effects/", t("nav.effects"), effects)}${link("/feel/", t("nav.feel"), path.startsWith("/feel/"))}${link("/templates/", t("nav.templates"), path.startsWith("/templates/"))}${link("/free-assets/", t("nav.assets"), path.startsWith("/free-assets/"))}<details class="tools"><summary${inTools ? ' class="cur" aria-current="true"' : ""}>${t("nav.tools")}</summary><div class="tools-menu">${TOOL_PATHS.map((p, i) => link(p, t(TOOL_KEYS[i]), path === p)).join("")}</div></details>${link("/credits/", t("nav.credits"), path === "/credits/")}<select data-shared-lang="true" id="lang" class="lang" aria-label="${t("lang.aria")}">${LOCALES.map((x) => `<option value="${x.code}"${x.code === l ? " selected" : ""}>${x.native}</option>`).join("")}</select><button class="btn theme-toggle" type="button" aria-label="${t("nav.theme")}" title="${t("nav.theme")}"><svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5 7 7 0 1 0 19 14.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg></button></nav></div>`;

    const crumb = header.querySelector("#ed-crumb");
    if (crumb && crumbText != null) crumb.textContent = crumbText;

    header.querySelector<HTMLButtonElement>(".theme-toggle")!.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      try {
        localStorage.setItem("pixjuice-theme", next);
      } catch {
        /* private mode */
      }
      document.documentElement.dataset.theme = next;
    });
    header.querySelector("select")!.addEventListener("change", (e) => {
      setLocale((e.target as HTMLSelectElement).value as typeof l);
    });
    document.querySelectorAll(".crumb:not(#ed-crumb)").forEach((el) => {
      (el as HTMLElement).hidden = true;
    });
  }

  render();
  onLocaleChange(render);
  window.addEventListener("hashchange", render);
  window.addEventListener("popstate", render);
  document.addEventListener("click", (e) => {
    const menu = header.querySelector("details");
    if (menu && !menu.contains(e.target as Node)) menu.open = false;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const menu = header.querySelector("details");
      if (menu) menu.open = false;
    }
  });
}
