// /free-assets/<id>/ — asset detail page. The static shell (SEO meta, JSON-LD,
// breadcrumb) is generated per asset by scripts/gen-asset-pages.mjs; this module
// reads the id from the URL, renders the preview, file list and downloads.

import "../style.css";
import "../templates/shared/skins.css";
import "../templates/templates.css";
import { applyStaticText, getLocale, mountLangSwitcher, onLocaleChange, t } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { loadManifest, kindOf, productId, type FaAsset } from "../lib/assets/manifest";
import { makeZip, type ZipEntry } from "../lib/zip";
import { el } from "../lib/el";

mountToolsMenu();
mountLangSwitcher();


function assetName(a: FaAsset): string {
  if(a.product_id === "chest-wood") return t("v3.product");
  return getLocale() === "zh" && a.name.zh ? a.name.zh : a.name.en;
}

interface FaFile {
  path: string; // under /free-assets/
  label: string;
  ext: string;
}

function filesOf(a: FaAsset): FaFile[] {
  const out: FaFile[] = [];
  if (a.glb) {
    if (a.glb.lod0) out.push({ path: a.glb.lod0, label: t("v3.full"), ext: "glb" });
  }
  if (a.sprites) {
    for (const [clip, path] of Object.entries(a.sprites)) {
      out.push({ path, label: `${t("v3.sprite")} — ${clip} (128px, 8)`, ext: "png" });
    }
  }
  if (a.license.file) out.push({ path: a.license.file, label: t("v3.license"), ext: "txt" });
  return out;
}

function extOf(path: string): string {
  const m = path.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "bin";
}

(async () => {
  const root = document.getElementById("asset-root");
  if (!root) return;
  const id = decodeURIComponent(location.pathname.replace(/\/+$/, "").split("/").pop() || "");

  let assets: FaAsset[];
  try {
    assets = await loadManifest(new URLSearchParams(location.search).has('parts-demo') ? '/parts-demo/manifest.json' : undefined);
  } catch {
    root.appendChild(el("p", { className: "body", text: t("fa.loadErr"), "data-i18n": "fa.loadErr" }));
    return;
  }
  const demo = new URLSearchParams(location.search).has('parts-demo');
  let selected = assets.find((x) => x.id === id) || assets.find(x=>x.product_id===id) || (demo ? assets[0] : undefined);
  const a = selected;
  if (!a) {
    root.appendChild(
      el("div", { className: "fa-soon-panel" }, [
        el("b", { text: t("fa.notFound") }),
        el("span", { text: t("fa.backAll") }),
      ]),
    );
    applyStaticText(root!);
    return;
  }

  const variants = assets.filter(x=>x.style_tier==="realistic" && (!x.hidden || a.hidden) && productId(x)===productId(a));
  let cleanupModel: (()=>void) | undefined;
  let spriteTimer: ReturnType<typeof setInterval> | undefined;
  let generation=0;
  function render() {
  const a=selected!;
  const token=++generation;
  cleanupModel?.();cleanupModel=undefined;
  if(spriteTimer)clearInterval(spriteTimer);
  root!.innerHTML='';
  document.title = `${assetName(a)} — Free Game Asset – PixJuice`;

  const grid = el("div", { className: "fa-detail-grid" });

  // --- preview column ---
  const preview = el("div", { className: "fa-preview" });
  if (!a.glb?.lod0 && a.thumb) preview.appendChild(el("img", { src: `/free-assets/${a.thumb}`, alt: assetName(a) }));
  if (a.glb?.lod0) {
    const mount=el('div',{className:'fa-model-wrap'});preview.appendChild(mount);
    void import('../lib/assets/model-preview').then(({mountModel})=>{
      if(token!==generation)return;
      try{cleanupModel=mountModel(mount,`/free-assets/${a.glb!.lod0}`,a.id);}catch{mount.textContent=t('v3.error');}
    });
  }
  if (a.sprites?.idle) {
    const strip = el("div", { className: "fa-sprite-strip" });
    const cv = el("canvas", { width: "128", height: "128", "aria-hidden": "true" });
    strip.appendChild(cv);
    strip.appendChild(el("p", { className: "cap", text: t("fa.spriteAnim"), "data-i18n": "fa.spriteAnim" }));
    preview.appendChild(strip);
    const img = new Image();
    img.onload = () => {
      if(token!==generation)return;
      const ctx = cv.getContext("2d")!;
      let f = 0;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const draw = () => {
        ctx.imageSmoothingEnabled = a.style_tier !== "pixel-art";
        ctx.clearRect(0, 0, 128, 128);
        ctx.drawImage(img, (f % 8) * 128, 0, 128, 128, 0, 0, 128, 128);
        f++;
      };
      if (reduced) draw();
      else spriteTimer=setInterval(draw, 140);
    };
    img.src = `/free-assets/${a.sprites.idle}`;
  }
  grid.appendChild(preview);

  // --- info column ---
  const info = el("div", { className: "fa-info" });
  info.appendChild(
    el("p", { className: "tpl-crumbs" }, [
      el("a", { href: "/free-assets/", text: t("nav.assets"), "data-i18n": "nav.assets" }),
      ` / ${t(({realistic:"tpl.skin.realistic",stylized:"tpl.skin.stylized","clean-low-poly":"tpl.skin.lowpoly","pixel-art":"tpl.skin.pixel"} as Record<string,string>)[a.style_tier] || a.style_tier)}`,
    ]),
  );
  info.appendChild(el("h1", { text: assetName(a) }));
  if (!a.product_id && a.name.zh && getLocale() !== "zh") info.appendChild(el("p", { className: "zh", text: a.name.zh }));

  const badges = el("div", { className: "tpl-badges" });
  const kind = kindOf(a);
  badges.appendChild(el("span", { text: kind === "2d3d" ? "2D + 3D" : kind.toUpperCase() }));
  badges.appendChild(el("span", { className: "fa-lic", text: t("fa.freeCommercial"), "data-i18n": "fa.freeCommercial" }));
  if (a.placeholder) badges.appendChild(el("span", { text: t("fa.soon"), "data-i18n": "fa.soon" }));
  info.appendChild(badges);

  if(a.product_id){

    const options=el('div',{className:'fa-variant-options'});
    for(const [field,key] of [['palette','color'],['state','state']] as const){
      const label=el('label',{},[el('span',{text:t('v3.'+key)})]);
      const select=el('select',{'data-variant':key,'aria-label':t('v3.'+key)});
      for(const value of [...new Set(variants.map(x=>x[field]).filter(Boolean))] as string[]){
        const option=el('option',{value,text:t('v3.'+value)});option.selected=a[field]===value;select.appendChild(option);
      }
      select.onchange=()=>{
        const candidates=variants.filter(x=>x[field]===select.value);
        selected=candidates.sort((x,y)=>['style_tier','palette','state'].reduce((n,k)=>n+Number(y[k as keyof FaAsset]===a[k as keyof FaAsset])-Number(x[k as keyof FaAsset]===a[k as keyof FaAsset]),0))[0];
        const prefix=getLocale()==='en'?'':'/'+getLocale();if(!demo)history.replaceState({},'',`${prefix}/free-assets/${selected!.id}/`);
        render();
      };
      label.appendChild(select);options.appendChild(label);
    }
    info.appendChild(options);
  }
  const tags = el("div", { className: "fa-tags" });
  for (const tag of a.tags) tags.appendChild(el("a", { text: tag, href: `/free-assets/?tag=${encodeURIComponent(tag)}` }));
  info.appendChild(tags);
  info.appendChild(el("p", {className:"body",text: a.placeholder ? t("fa.soon") : t("fa.licenseNotice"), "data-i18n": a.placeholder ? "fa.soon" : "fa.licenseNotice"}));

  if (a.placeholder) {
    const panel = el("div", { className: "fa-soon-panel", style: "margin-top:18px" });
    panel.appendChild(el("b", { text: t("fa.soon") }));
    panel.appendChild(el("span", { text: t("fa.soonBody") }));
    info.appendChild(panel);
  } else {
    const files = filesOf(a);
    const list = el("div", { className: "fa-files" });
    for (const f of files) {
      list.appendChild(
        el("a", { className: "fa-file", href: `/free-assets/${f.path}`, download: "" }, [
          el("span", { className: "ext", text: extOf(f.path) }),
          el("span", { className: "name", text: f.label }),
          el("span", { text: "↓" }),
        ]),
      );
    }
    info.appendChild(list);

    const dlAll = el("button", { className: "tpl-btn tpl-btn-accent", type: "button", text: t("fa.downloadAll"), "data-i18n": "fa.downloadAll" });
    dlAll.addEventListener("click", async () => {
      dlAll.disabled = true;
      try {
        const enc = new TextEncoder();
        const entries: ZipEntry[] = [];
        for (const f of files) {
          const res = await fetch(`/free-assets/${f.path}`);
          if (!res.ok) continue;
          entries.push({ name: f.path, data: new Uint8Array(await res.arrayBuffer()) });
        }
        entries.push({ name: "README.txt", data: enc.encode(readmeFor(a)) });
        const blob = makeZip(entries);
        const link = el("a", { href: URL.createObjectURL(blob), download: `${a.id}.zip` });
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          URL.revokeObjectURL(link.href);
          link.remove();
        }, 500);
      } finally {
        dlAll.disabled = false;
      }
    });
    info.appendChild(dlAll);
  }

  grid.appendChild(info);
  root!.appendChild(grid);
  const modelHost=preview.querySelector<HTMLElement>('.fa-model-wrap');
  if(modelHost)void import('../lib/assets/parts-panel.js').then(async ({mountParts})=>{
    const originalPreview=cleanupModel;
    const stop=await mountParts(info,modelHost,a,assets,()=>token===generation,()=>{originalPreview?.();});
    if(stop){if(token!==generation)stop();else{const original=cleanupModel;cleanupModel=()=>{original?.();stop();};}}
  });
  applyStaticText(root!);
  const crumb=document.getElementById('fa-crumb');if(crumb)crumb.textContent=assetName(a);
  const faq=document.querySelector('.tpl-faq');
  const variantText=[assetName(a),t(({realistic:'tpl.skin.realistic',stylized:'tpl.skin.stylized','clean-low-poly':'tpl.skin.lowpoly','pixel-art':'tpl.skin.pixel'} as Record<string,string>)[a.style_tier]||a.style_tier),t('v3.'+a.palette),t('v3.'+a.state)].join(' · ');
  document.title=variantText+' – PixJuice';
  const canonical=document.querySelector<HTMLLinkElement>('link[rel=canonical]');if(canonical)canonical.href=location.href;
  if(faq){const summary=faq.querySelector('summary');if(summary)summary.textContent=variantText+' — '+t('v3.license');}
  const json=document.querySelector('script[type="application/ld+json"]');
  if(json){try{const data=JSON.parse(json.textContent||'[]');data[0].name=variantText;data[0].url=location.href;json.textContent=JSON.stringify(data);}catch{/* Keep the static metadata if unavailable. */}}
  }
  render();
  onLocaleChange(render);
})();

function readmeFor(a: FaAsset): string {
  return [
    `${a.name.en}${a.name.zh ? ` (${a.name.zh})` : ""}`,
    `From the PixJuice free asset library: https://pixjuice.pages.dev/free-assets/${a.id}/`,
    `License: ${a.license.id} — commercial use, no attribution required (${a.license.file ?? "see the asset page"}).`,
    "",
    "Files in this ZIP are the asset's published files; the detail page above documents",
    "the sprite sheet layout (128px frames, 8 per sheet) and the high-detail GLB.",
  ].join("\n");
}
