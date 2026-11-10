// /free-assets/ — the library grid. Data comes from /free-assets/manifest.json
// (validated); game templates are a library category too, rendered from a
// constant and linked to their /templates/<slug>/ pages.

import "../style.css";
import "../templates/shared/skins.css";
import "../templates/templates.css";
import { applyStaticText, getLocale, mountLangSwitcher, onLocaleChange, t } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { loadManifest, kindOf, type FaAsset } from "../lib/assets/manifest";
import { el } from "../lib/el";

mountToolsMenu();
mountLangSwitcher();

type Filter = "all" | "2d" | "3d" | "templates";

interface TplCard {
  href: string;
  hKey: string;
  dKey: string;
  tags: string[];
  icon: string;
  soon?: boolean;
}

const TEMPLATE_CARDS: TplCard[] = [
  {
    href: "/templates/gacha/",
    hKey: "gx.card.h",
    dKey: "gx.card.d",
    tags: ["gacha", "loot box", "lucky wheel"],
    icon: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18" opacity="0.5"/><path d="M12 12l6-6M12 12l6 6M12 12l-6-6" opacity="0.8"/>',
  },
  {
    href: "/templates/save-load/",
    hKey: "sv.card.h",
    dKey: "sv.card.d",
    tags: ["save load", "menu"],
    icon: '<path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4"/><rect x="8" y="13" width="8" height="7"/>',
  },
];

let filter: Filter = "all";
let query = new URLSearchParams(location.search).get("tag") || "";
const matches = (text: string) => !query || text.toLowerCase().includes(query.toLowerCase());
let assets: FaAsset[] = [];


function assetName(a: FaAsset): string {
  return getLocale() === "zh" && a.name.zh ? a.name.zh : a.name.en;
}

function styleLabel(id: string): string {
  const map: Record<string, string> = {
    realistic: "fa.style.realistic",
    stylized: "fa.style.stylized",
    "clean-low-poly": "fa.style.lowpoly",
    "pixel-art": "fa.style.pixel",
  };
  return map[id] ? t(map[id]) : id;
}

function assetCard(a: FaAsset): HTMLElement {
  const kind = kindOf(a);
  const kindLabel = kind === "2d3d" ? "2D + 3D" : kind.toUpperCase();
  const card = el(a.placeholder ? "div" : "a", {
    className: "fa-card" + (a.placeholder ? " fa-soon-card" : ""),
    ...(a.placeholder ? {} : { href: `/free-assets/${a.id}/` }),
  }) as HTMLAnchorElement;
  const thumb = el("div", { className: "fa-thumb" });
  if (a.thumb) thumb.appendChild(el("img", { src: `/free-assets/${a.thumb}`, alt: assetName(a), loading: "lazy" }));
  else thumb.appendChild(el("span", { className: "soon-mark", text: t("fa.soon"), "data-i18n": "fa.soon" }));
  thumb.appendChild(el("span", { className: "kind", text: kindLabel }));
  card.appendChild(thumb);

  const body = el("div", { className: "fa-body" });
  body.appendChild(el("b", { text: assetName(a) }));
  body.appendChild(
    el("span", { className: "desc", text: `${styleLabel(a.style_tier)} · ${a.palette} · ${t(`fa.cat.${a.category}`)}` }),
  );
  const tags = el("div", { className: "fa-tags" });
  for (const tag of a.tags.slice(0, 4)) tags.appendChild(el("i", { text: tag }));
  body.appendChild(tags);
  body.appendChild(
    el(
      "span",
      { className: "fa-lic", text: a.placeholder ? t("fa.soon") : t("fa.freeCommercial"), "data-i18n": a.placeholder ? "fa.soon" : "fa.freeCommercial" },
    ),
  );
  card.appendChild(body);
  return card;
}

function templateCard(tc: TplCard): HTMLElement {
  const card = el("a", { className: "fa-card", href: tc.href });
  const thumb = el("div", { className: "fa-thumb" });
  thumb.innerHTML = `<svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="var(--acc)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${tc.icon}</svg>`;
  thumb.appendChild(el("span", { className: "kind", text: "UI" }));
  card.appendChild(thumb);
  const body = el("div", { className: "fa-body" });
  body.appendChild(el("b", { text: t(tc.hKey), "data-i18n": tc.hKey }));
  body.appendChild(el("span", { className: "desc", text: t(tc.dKey), "data-i18n": tc.dKey }));
  const tags = el("div", { className: "fa-tags" });
  for (const tag of tc.tags) tags.appendChild(el("i", { text: tag }));
  body.appendChild(tags);
  body.appendChild(el("span", { className: "fa-lic", text: t("fa.freeCommercial"), "data-i18n": "fa.freeCommercial" }));
  card.appendChild(body);
  return card;
}

function render() {
  const grid = document.getElementById("fa-grid")!;
  grid.innerHTML = "";
  if (filter === "all" || filter === "templates") {
    for (const tc of TEMPLATE_CARDS) if (matches(tc.tags.join(" ") + " " + t(tc.hKey))) grid.appendChild(templateCard(tc));
    const more = el("a", { className: "fa-card", href: "/templates/" });
    const thumb = el("div", { className: "fa-thumb" });
    thumb.appendChild(el("span", { className: "soon-mark", text: t("fa.moreTemplates"), "data-i18n": "fa.moreTemplates" }));
    thumb.appendChild(el("span", { className: "kind", text: "UI" }));
    more.appendChild(thumb);
    const body = el("div", { className: "fa-body" });
    body.appendChild(el("b", { text: t("fa.templatesCat"), "data-i18n": "fa.templatesCat" }));
    body.appendChild(el("span", { className: "desc", text: t("fa.templatesCatD"), "data-i18n": "fa.templatesCatD" }));
    more.appendChild(body);
    grid.appendChild(more);
  }
  if (filter !== "templates") {
    for (const a of assets) {
      if (!matches(a.tags.join(" ") + " " + assetName(a) + " " + a.category + " " + a.style_tier)) continue;
      const kind = kindOf(a);
      if (filter === "2d" && kind === "3d") continue;
      if (filter === "3d" && kind === "2d") continue;
      grid.appendChild(assetCard(a));
    }
  }
  applyStaticText(grid);
}

function renderFilters() {
  const bar = document.getElementById("fa-filters")!;
  bar.innerHTML = "";
  const defs: { id: Filter; key: string }[] = [
    { id: "all", key: "fa.filterAll" },
    { id: "2d", key: "fa.filter2d" },
    { id: "3d", key: "fa.filter3d" },
    { id: "templates", key: "fa.filterTpl" },
  ];
  for (const d of defs) {
    const b = el("button", {
      className: "fa-chip" + (filter === d.id ? " on" : ""),
      type: "button",
      text: t(d.key),
      "data-i18n": d.key,
      onclick: () => {
        filter = d.id;
        renderFilters();
        render();
      },
    });
    bar.appendChild(b);
  }
}

(async () => {
  const categories = document.createElement("div");
  categories.className = "fa-categories";
  for (const [id, label, key] of [["2d", "2D", "fa.types2d"], ["3d", "3D", "fa.types3d"], ["templates", "UI", "fa.filterTpl"]] as const) {
    categories.appendChild(el("button", {className:"fa-category",type:"button",onclick:()=>{filter=id;renderFilters();render();}}, [el("b",{text:label}),el("span",{text:t(key),"data-i18n":key})]));
  }
  const toolbar = document.getElementById("fa-filters")!;
  toolbar.before(categories);
  const search = el("input", {className:"fa-search",type:"search",placeholder:t("fa.search"), "aria-label":t("fa.search"), "data-i18n-ph":"fa.search", "data-i18n-aria":"fa.search",value:query});
  search.addEventListener("input",()=>{query=search.value;render();});
  toolbar.after(search);
  renderFilters();
  try {
    assets = await loadManifest();
  } catch {
    document.getElementById("fa-error")!.hidden = false;
  }
  render();
  onLocaleChange(() => {
    renderFilters();
    render();
  });
})();
