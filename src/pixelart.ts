// The image → pixel art tool: upload → pixel size / palette (auto · builtin · Lospec/hex) /
// dithering / background removal / outline → side-by-side preview → PNG export. All client-side.

import "./style.css";
import {
  autoPalette,
  BUILTIN_PALETTES,
  canvasToBlob,
  downloadBlob,
  loadImageFile,
  parseHexPalette,
  pixelate,
  rgbToHex,
  sanitizeBase,
  type BgRemove,
  type DitherMode,
  type DecodedImage,
  type RGB,
} from "./lib/pixels";
import { applyStaticText, getLocale, mountLangSwitcher, onLocaleChange, t } from "./lib/i18n";
import { mountToolsMenu } from "./lib/navmenu";

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;

// ---- state ----

let img: DecodedImage | null = null;
let base = "image";
let result: ImageData | null = null; // the pixelated grid (1 pixel per block)
let busy = false;
let renderTimer = 0;

// Lospec/hex palette loaded by the user (id "lospec"); null until loaded
let customPalette: { name: string; colors: RGB[] } | null = null;

// ---- static text / i18n ----

function refreshTexts(): void {
  document.title = t("title.pa");
  if (img) updateCaption();
}

// ---- upload ----

const drop = $("#pa-drop");
const fileInput = $<HTMLInputElement>("#pa-file");
const dzNote = $("#pa-drop .dz-note");

function flashDropError(key: string): void {
  if (!dzNote) return;
  dzNote.textContent = t(key);
  dzNote.classList.add("bad");
  setTimeout(() => {
    dzNote.textContent = t("pa.dropNote");
    dzNote.classList.remove("bad");
  }, 4000);
}

async function loadFile(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    flashDropError("sheet.dropBadType");
    return;
  }
  let decoded: DecodedImage;
  try {
    decoded = await loadImageFile(file);
  } catch {
    flashDropError("sheet.dropBadDecode");
    return;
  }
  img = decoded;
  base = sanitizeBase(file.name, "pixel-art");
  drop.hidden = true;
  $("#pa-tool").hidden = false;
  render();
}

$("#pa-browse").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) void loadFile(f);
  fileInput.value = "";
});

// drag & drop anywhere on the page; paste works too
let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragDepth++;
  if (!drop.hidden) drop.classList.add("drag");
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("dragleave", () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    drop.classList.remove("drag");
  }
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  drop.classList.remove("drag");
  const f = e.dataTransfer?.files?.[0];
  if (f) void loadFile(f);
});
window.addEventListener("paste", (e) => {
  const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
  if (f) void loadFile(f);
});

$("#pa-replace").addEventListener("click", () => {
  drop.hidden = false;
  drop.classList.remove("drag");
});

// ---- controls ----

const inSize = $<HTMLInputElement>("#pa-size");
const inPal = $<HTMLSelectElement>("#pa-pal");
const inColors = $<HTMLInputElement>("#pa-colors");
const inLospec = $<HTMLInputElement>("#pa-lospec");
const inDither = $<HTMLSelectElement>("#pa-dither");
const inBg = $<HTMLSelectElement>("#pa-bg");
const inBgColor = $<HTMLInputElement>("#pa-bgcolor");
const inTol = $<HTMLInputElement>("#pa-tol");
const inOutline = $<HTMLSelectElement>("#pa-outline");
const inOutColor = $<HTMLInputElement>("#pa-outcolor");
const inZoom = $<HTMLSelectElement>("#pa-zoom");
const note = $("#pa-note");
const lospecNote = $("#pa-lospec-note");
const swatches = $("#pa-swatches");

const hexToRgb = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Resolve the active palette from the select + custom payload. */
function activePalette(): RGB[] {
  if (inPal.value === "auto") return [];
  if (inPal.value === "lospec") return customPalette?.colors ?? [];
  const builtin = BUILTIN_PALETTES.find((p) => p.id === inPal.value);
  return builtin ? builtin.colors.map(hexToRgb) : [];
}

function syncRows(): void {
  $("#pa-row-colors").hidden = inPal.value !== "auto";
  $("#pa-row-lospec").hidden = inPal.value !== "lospec";
  $("#pa-row-bgcolor").hidden = inBg.value === "none";
  $("#pa-row-outcolor").hidden = inOutline.value !== "custom";
}

function paintSwatches(pal: RGB[]): void {
  swatches.replaceChildren();
  for (const c of pal.slice(0, 64)) {
    const d = document.createElement("div");
    d.className = "swatch";
    d.style.background = rgbToHex(c);
    swatches.append(d);
  }
}

function updateCaption(): void {
  if (!img || !result) return;
  $("#pa-cap").textContent = t("pa.imgInfo", {
    w: img.cv.width,
    h: img.cv.height,
    gw: result.width,
    gh: result.height,
    n: activePalette().length || Math.max(2, Math.round(Number(inColors.value) || 16)),
  });
}

// ---- render pipeline ----

const srcCv = $<HTMLCanvasElement>("#pa-src");
const outCv = $<HTMLCanvasElement>("#pa-out");

function renderNow(): void {
  if (!img) return;
  const block = Math.max(1, Math.round(Number(inSize.value) || 8));
  const bg: BgRemove = {
    mode: inBg.value === "corner" || inBg.value === "color" ? inBg.value : "none",
    color: hexToRgb(inBgColor.value),
    tolerance: Math.max(0, Math.round(Number(inTol.value) || 0)),
  };
  let outline: RGB | null = null;
  if (inOutline.value === "custom") outline = hexToRgb(inOutColor.value);
  else if (inOutline.value !== "none") outline = hexToRgb(`#${inOutline.value}`);

  let palette = activePalette();
  if (inPal.value === "auto") palette = autoPalette(img.data, Math.min(64, Math.max(2, Math.round(Number(inColors.value) || 16))));

  result = pixelate(img.data, {
    block,
    palette,
    dither: (inDither.value === "bayer" || inDither.value === "floyd" ? inDither.value : "none") as DitherMode,
    bg,
    outline,
  });

  srcCv.width = img.cv.width;
  srcCv.height = img.cv.height;
  srcCv.getContext("2d")!.putImageData(img.data, 0, 0);
  srcCv.classList.toggle("pixelated", block > 1);

  outCv.width = result.width;
  outCv.height = result.height;
  outCv.getContext("2d")!.putImageData(result, 0, 0);

  paintSwatches(palette.length ? palette : autoPalette(result, 16));
  updateCaption();
}

/** Debounced render for slider drags (the pipeline is a full-image pass). */
function render(): void {
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderNow, 120);
}

for (const inp of [inSize, inColors, inDither, inBg, inBgColor, inTol, inOutline, inOutColor])
  inp.addEventListener("input", () => {
    if (!img) return;
    syncRows();
    $("#pa-size-val").textContent = String(Math.max(1, Math.round(Number(inSize.value) || 8)));
    $("#pa-tol-val").textContent = String(Math.max(0, Math.round(Number(inTol.value) || 0)));
    render();
  });

// ---- Lospec / hex-list palettes ----

async function loadLospec(): Promise<void> {
  const text = inLospec.value.trim();
  if (!text || !img) return;

  // pasted hex list works offline
  const hexes = parseHexPalette(text);
  if (hexes.length >= 2) {
    customPalette = { name: t("pa.lospecHex", { n: hexes.length }), colors: hexes };
    lospecNote.textContent = t("pa.lospecOk", { name: customPalette.name, n: hexes.length });
    renderNow();
    return;
  }

  // otherwise treat it as a Lospec palette slug and fetch the JSON API
  lospecNote.textContent = t("pa.lospecFetching");
  try {
    const res = await fetch(`https://lospec.com/palettes/${encodeURIComponent(text.toLowerCase())}.json`);
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { name?: string; colors: string[] };
    const colors = parseHexPalette(json.colors.join(" "));
    if (colors.length < 2) throw new Error("empty");
    customPalette = { name: json.name ?? text, colors };
    lospecNote.textContent = t("pa.lospecOk", { name: customPalette.name, n: colors.length });
  } catch {
    customPalette = null;
    lospecNote.textContent = t("pa.lospecFail");
  }
  renderNow();
}

$("#pa-lospec-load").addEventListener("click", () => void loadLospec());
inLospec.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    void loadLospec();
  }
});

// ---- export ----

function setNote(msg: string, ok = false): void {
  note.innerHTML = ok ? `<span class="export-ok">${msg}</span>` : msg;
}

$("#pa-exp").addEventListener("click", () => {
  if (busy || !result) return;
  busy = true;
  for (const b of document.querySelectorAll<HTMLButtonElement>("#pa-tool .btn")) b.disabled = true;
  try {
    const zoom = Math.max(1, Math.round(Number(inZoom.value) || 1));
    const cv = document.createElement("canvas");
    cv.width = result!.width * zoom;
    cv.height = result!.height * zoom;
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const tmp = document.createElement("canvas");
    tmp.width = result!.width;
    tmp.height = result!.height;
    tmp.getContext("2d")!.putImageData(result!, 0, 0);
    ctx.drawImage(tmp, 0, 0, cv.width, cv.height);
    void canvasToBlob(cv).then((blob) => {
      const name = `${base}-pixel${zoom > 1 ? `-${zoom}x` : ""}.png`;
      downloadBlob(blob, name);
      setNote(t("ed.noteDone", { name, kb: Math.max(1, Math.round(blob.size / 1024)) }), true);
    });
  } catch (err) {
    setNote(t("ed.noteFail", { msg: err instanceof Error ? err.message : String(err) }));
  } finally {
    busy = false;
    for (const b of document.querySelectorAll<HTMLButtonElement>("#pa-tool .btn")) b.disabled = false;
  }
});

// ---- boot ----

applyStaticText();
mountLangSwitcher();
mountToolsMenu();
if (getLocale() !== "en") document.title = t("title.pa");
onLocaleChange(refreshTexts);
