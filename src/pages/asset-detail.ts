// /free-assets/<id>/ — asset detail page. The static shell (SEO meta, JSON-LD,
// breadcrumb) is generated per asset by scripts/gen-asset-pages.mjs; this module
// reads the id from the URL, renders the preview, file list and downloads.

import "../style.css";
import "../templates/shared/skins.css";
import "../templates/templates.css";
import { applyStaticText, getLocale, mountLangSwitcher, onLocaleChange, t } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { loadManifest, kindOf, type FaAsset } from "../lib/assets/manifest";
import { makeZip, type ZipEntry } from "../lib/zip";
import { el } from "../lib/el";

mountToolsMenu();
mountLangSwitcher();


function assetName(a: FaAsset): string {
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
    if (a.glb.lod0) out.push({ path: a.glb.lod0, label: "Model — LOD0 (full detail)", ext: "glb" });
    if (a.glb.lod1) out.push({ path: a.glb.lod1, label: "Model — LOD1 (lite)", ext: "glb" });
  }
  if (a.sprites) {
    for (const [clip, path] of Object.entries(a.sprites)) {
      out.push({ path, label: `Sprite — ${clip} (128px, 8 frames)`, ext: "png" });
    }
  }
  if (a.license.file) out.push({ path: a.license.file, label: "License", ext: "txt" });
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
    assets = await loadManifest();
  } catch {
    root.appendChild(el("p", { className: "body", text: t("fa.loadErr"), "data-i18n": "fa.loadErr" }));
    return;
  }
  const a = assets.find((x) => x.id === id);
  if (!a) {
    root.appendChild(
      el("div", { className: "fa-soon-panel" }, [
        el("b", { text: t("fa.notFound") }),
        el("span", { text: t("fa.backAll") }),
      ]),
    );
    applyStaticText(root);
    return;
  }

  document.title = `${assetName(a)} — Free Game Asset – PixJuice`;

  const grid = el("div", { className: "fa-detail-grid" });

  // --- preview column ---
  const preview = el("div", { className: "fa-preview" });
  if (a.thumb) preview.appendChild(el("img", { src: `/free-assets/${a.thumb}`, alt: assetName(a) }));
  if (a.sprites?.idle) {
    const strip = el("div", { className: "fa-sprite-strip" });
    const cv = el("canvas", { width: "128", height: "128", "aria-hidden": "true" });
    strip.appendChild(cv);
    strip.appendChild(el("p", { className: "cap", text: t("fa.spriteAnim"), "data-i18n": "fa.spriteAnim" }));
    preview.appendChild(strip);
    const img = new Image();
    img.onload = () => {
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
      else setInterval(draw, 140);
    };
    img.src = `/free-assets/${a.sprites.idle}`;
  }
  grid.appendChild(preview);

  // --- info column ---
  const info = el("div", { className: "fa-info" });
  info.appendChild(
    el("p", { className: "tpl-crumbs" }, [
      el("a", { href: "/free-assets/", text: t("nav.assets"), "data-i18n": "nav.assets" }),
      ` / ${a.style_tier} / ${a.category}`,
    ]),
  );
  info.appendChild(el("h1", { text: assetName(a) }));
  if (a.name.zh && getLocale() !== "zh") info.appendChild(el("p", { className: "zh", text: a.name.zh }));

  const badges = el("div", { className: "tpl-badges" });
  const kind = kindOf(a);
  badges.appendChild(el("span", { text: kind === "2d3d" ? "2D + 3D" : kind.toUpperCase() }));
  badges.appendChild(el("span", { className: "fa-lic", text: t("fa.freeCommercial"), "data-i18n": "fa.freeCommercial" }));
  if (a.placeholder) badges.appendChild(el("span", { text: t("fa.soon"), "data-i18n": "fa.soon" }));
  info.appendChild(badges);

  const tags = el("div", { className: "fa-tags" });
  for (const tag of a.tags) tags.appendChild(el("a", { text: tag, href: `/free-assets/?tag=${encodeURIComponent(tag)}` }));
  info.appendChild(tags);
  info.appendChild(el("p", {className:"body",text: a.placeholder ? t("fa.soon") : `License: ${a.license.id} (art is not CC0)`}));

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
  root.appendChild(grid);
  applyStaticText(root);
  onLocaleChange(() => {
    document.title = `${assetName(a)} — Free Game Asset – PixJuice`;
    applyStaticText(root);
  });
})();

function readmeFor(a: FaAsset): string {
  return [
    `${a.name.en}${a.name.zh ? ` (${a.name.zh})` : ""}`,
    `From the PixJuice free asset library: https://pixjuice.pages.dev/free-assets/${a.id}/`,
    `License: ${a.license.id} — free for commercial use (${a.license.file ?? "see the asset page"}).`,
    "",
    "Files in this ZIP are the asset's published files; the detail page above documents",
    "the sprite sheet layout (128px frames, 8 per sheet) and the GLB LODs.",
  ].join("\n");
}
