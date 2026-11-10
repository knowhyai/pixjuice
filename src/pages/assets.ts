// /free-assets/ — the library grid. Data comes from /free-assets/manifest.json
// (validated); game templates are a library category too, rendered from a
// constant and linked to their /templates/<slug>/ pages.

import "../style.css";
import "../templates/shared/skins.css";
import "../templates/templates.css";
import { applyStaticText, getLocale, mountLangSwitcher, onLocaleChange, t } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { loadManifest, kindOf, visibleProducts, availableCategories, type AssetCategory, type FaAsset } from "../lib/assets/manifest";
import { el } from "../lib/el";

mountToolsMenu();
mountLangSwitcher();

type Filter = "all" | AssetCategory;

let filter: Filter = "all";
let query = new URLSearchParams(location.search).get("tag") || "";
const matches = (text: string) => !query || text.toLowerCase().includes(query.toLowerCase());
let assets: FaAsset[] = [];


function assetName(a: FaAsset): string {
  if(a.product_id === "chest-wood") return t("v3.product");
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
    el("span", { className: "desc", text: a.product_id === "chest-wood" ? ({en:"4 colors · Intact / damaged",zh:"4 色 · 完好/破损",ja:"4 色 · 通常 / 破損",ko:"4색 · 온전 / 파손",es:"4 colores · intacto / dañado"})[getLocale()] : `${styleLabel(a.style_tier)} · ${a.palette} · ${t(`fa.cat.${a.category}`)}` }),
  );
  const tags = el("div", { className: "fa-tags" });
  for (const tag of [styleLabel(a.style_tier), ...a.tags.filter(t=>t!=="semi-realistic")].slice(0, 4)) tags.appendChild(el("i", { text: tag }));
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

function render() {
  const grid = document.getElementById("fa-grid")!;
  const empty = document.getElementById("fa-empty");
  const filters = document.getElementById("fa-filters");
  const search = document.querySelector<HTMLElement>(".fa-search");
  grid.innerHTML = "";
  const published = visibleProducts(assets);
  const searching = published.length > 0;
  if (filters) filters.hidden = !searching;
  if (search) search.hidden = !searching;
  const groups = visibleProducts(assets, a => {
    if (!matches(a.tags.join(" ") + " " + assetName(a) + " " + a.category + " " + a.style_tier)) return false;
    return filter === "all" || a.category === filter;
  });
  for (const group of groups) grid.appendChild(assetCard(group.find(a=>a.palette===query.toLowerCase()||a.style_tier===query.toLowerCase())||group[0]));
  if (empty) {
    empty.hidden = groups.length > 0;
    empty.textContent = published.length === 0 ? t("fa.emptyBatch") : t("fa.emptySearch");
    empty.setAttribute("data-i18n", published.length === 0 ? "fa.emptyBatch" : "fa.emptySearch");
  }
  applyStaticText(grid);
  if (empty && !empty.hidden) applyStaticText(empty.parentElement || empty);
}

function renderFilters() {
  const bar = document.getElementById("fa-filters")!;
  bar.innerHTML = "";
  const defs: { id: Filter; key: string }[] = [
    { id: "all", key: "fa.filterAll" },
    ...availableCategories(assets).map(id => ({id, key: `fa.cat.${id}`})),
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
  const toolbar = document.getElementById("fa-filters")!;
  const search = el("input", {className:"fa-search",type:"search",placeholder:t("fa.search"), "aria-label":t("fa.search"), "data-i18n-ph":"fa.search", "data-i18n-aria":"fa.search",value:query});
  search.addEventListener("input",()=>{query=search.value;render();});
  toolbar.after(search);
  renderFilters();
  try {
    assets = await loadManifest();
    renderFilters();
  } catch {
    document.getElementById("fa-error")!.hidden = false;
  }
  render();
  onLocaleChange(() => {
    renderFilters();
    render();
  });
})();
