// The pixel art upscaler: upload → nearest / Scale2x / Scale3x / xBR at 2×–8× →
// side-by-side preview → PNG export. All client-side.

import "./style.css";
import {
  algoBase,
  canvasToBlob,
  downloadBlob,
  loadImageFile,
  sanitizeBase,
  upscale,
  type DecodedImage,
  type UpscaleAlgo,
} from "./lib/pixels";
import { applyStaticText, getLocale, mountLangSwitcher, onLocaleChange, t } from "./lib/i18n";
import { mountToolsMenu } from "./lib/navmenu";

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;

// ---- state ----

let img: DecodedImage | null = null;
let base = "sprite";
let result: ImageData | null = null;
let busy = false;

/** Output-pixel budget so an 8× export of a big image can't OOM the tab. */
const MAX_OUT_PX = 33_554_432; // 4096 × 8192

// scales offered per algorithm (base factor times an integer)
function scalesFor(algo: UpscaleAlgo): number[] {
  const b = algoBase(algo);
  return [2, 3, 4, 6, 8].filter((k) => k % b === 0 && k >= b);
}

// ---- static text / i18n ----

function refreshTexts(): void {
  document.title = t("title.up");
  if (img) updateCaption();
}

// ---- upload ----

const drop = $("#up-drop");
const fileInput = $<HTMLInputElement>("#up-file");
const dzNote = $("#up-drop .dz-note");

function flashDropError(key: string): void {
  if (!dzNote) return;
  dzNote.textContent = t(key);
  dzNote.classList.add("bad");
  setTimeout(() => {
    dzNote.textContent = t("up.dropNote");
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
  base = sanitizeBase(file.name, "sprite");
  drop.hidden = true;
  $("#up-tool").hidden = false;
  syncScaleOptions();
  renderNow();
}

$("#up-browse").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) void loadFile(f);
  fileInput.value = "";
});

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

$("#up-replace").addEventListener("click", () => {
  drop.hidden = false;
  drop.classList.remove("drag");
});

// ---- controls ----

const inAlgo = $<HTMLSelectElement>("#up-algo");
const inScale = $<HTMLSelectElement>("#up-scale");
const note = $("#up-note");

const algo = (): UpscaleAlgo =>
  inAlgo.value === "scale2x" || inAlgo.value === "scale3x" || inAlgo.value === "xbr"
    ? (inAlgo.value as UpscaleAlgo)
    : "nearest";

/** Rebuild the scale options for the active algorithm, disabling those past the pixel cap. */
function syncScaleOptions(): void {
  if (!img) return;
  const want = Math.max(1, Math.round(Number(inScale.value) || 2));
  const ok = scalesFor(algo()).filter((k) => img!.cv.width * img!.cv.height * k * k <= MAX_OUT_PX);
  const opts = scalesFor(algo()).map((k) => ({ k, fits: ok.includes(k) }));
  inScale.replaceChildren(
    ...opts.map(({ k, fits }) => {
      const o = document.createElement("option");
      o.value = String(k);
      o.textContent = `${k}×`;
      o.disabled = !fits;
      return o;
    }),
  );
  inScale.value = String(ok.includes(want) ? want : (ok[ok.length - 1] ?? 2));
}

function updateCaption(): void {
  if (!img || !result) return;
  $("#up-cap").textContent = t("up.imgInfo", { w: img.cv.width, h: img.cv.height });
  $("#up-out-cap").textContent = t("up.outInfo", {
    algo: inAlgo.selectedOptions[0]?.textContent ?? inAlgo.value,
    k: Math.round(result.width / img.cv.width),
    w: result.width,
    h: result.height,
  });
}

// ---- render pipeline ----

const srcCv = $<HTMLCanvasElement>("#up-src");
const outCv = $<HTMLCanvasElement>("#up-out");

function renderNow(): void {
  if (!img) return;
  const k = Math.max(1, Math.round(Number(inScale.value) || 2));
  result = upscale(img.data, algo(), k);

  srcCv.width = img.cv.width;
  srcCv.height = img.cv.height;
  srcCv.getContext("2d")!.putImageData(img.data, 0, 0);

  outCv.width = result.width;
  outCv.height = result.height;
  outCv.getContext("2d")!.putImageData(result, 0, 0);

  updateCaption();
}

for (const inp of [inAlgo, inScale]) inp.addEventListener("change", () => {
  if (!img) return;
  syncScaleOptions();
  renderNow();
});

// ---- export ----

function setNote(msg: string, ok = false): void {
  note.innerHTML = ok ? `<span class="export-ok">${msg}</span>` : msg;
}

$("#up-exp").addEventListener("click", () => {
  if (busy || !result) return;
  busy = true;
  for (const b of document.querySelectorAll<HTMLButtonElement>("#up-tool .btn")) b.disabled = true;
  try {
    const cv = document.createElement("canvas");
    cv.width = result!.width;
    cv.height = result!.height;
    cv.getContext("2d")!.putImageData(result!, 0, 0);
    void canvasToBlob(cv).then((blob) => {
      const k = Math.round(cv.width / (img?.cv.width ?? 1));
      const name = `${base}-${k}x.png`;
      downloadBlob(blob, name);
      setNote(t("ed.noteDone", { name, kb: Math.max(1, Math.round(blob.size / 1024)) }), true);
    });
  } catch (err) {
    setNote(t("ed.noteFail", { msg: err instanceof Error ? err.message : String(err) }));
  } finally {
    busy = false;
    for (const b of document.querySelectorAll<HTMLButtonElement>("#up-tool .btn")) b.disabled = false;
  }
});

// ---- boot ----

applyStaticText();
mountLangSwitcher();
mountToolsMenu();
if (getLocale() !== "en") document.title = t("title.up");
onLocaleChange(refreshTexts);
