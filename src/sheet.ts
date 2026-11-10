// The sprite sheet tool: upload → slice (grid or auto-detect) → pick & reorder frames →
// animated preview → GIF / ZIP / PNG / XML / JSON exports. All client-side.

import "./style.css";
import {
  canvasToBlob,
  blobBytes,
  cellFromCount,
  countFromCell,
  detectGrid,
  encodeGif,
  packCanvas,
  packLayout,
  sanitizeBase,
  sliceSheet,
  sparrowXml,
  texturePackerJson,
  zipBlob,
  type FrameDef,
  type SheetGrid,
  type SliceMode,
} from "./lib/sheetlib";
import { applyStaticText, getLocale, mountLangSwitcher, onLocaleChange, t } from "./lib/i18n";

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  kids: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  Object.assign(e, props);
  e.append(...kids);
  return e;
}

// ---- state ----

interface Item {
  frame: FrameDef;
  on: boolean;
}

let src: HTMLCanvasElement | null = null; // the decoded sheet, at natural size
let srcCtx: CanvasRenderingContext2D | null = null;
let base = "spritesheet";
let grid: SheetGrid = {
  mode: "cells",
  cellW: 0,
  cellH: 0,
  cols: 1,
  rows: 1,
  offsetX: 0,
  offsetY: 0,
  spacingX: 0,
  spacingY: 0,
};
let items: Item[] = [];
let order: number[] = []; // item indices in playback order
let fps = 12;
let loop = true;
let pingpong = false;
let scale = 2;
let playing = true;
let pos = 0; // index into the current play sequence
let smallCells = false;

// thumbnails: rebuilt on structural change, class-tweaked on toggle
const thumbs: { root: HTMLElement; num: HTMLElement }[] = [];

/** Playback sequence: included frames, in order; ping-pong mirrors the middle. */
let seq: number[] = [];

function rebuildSeq(): void {
  seq = order.filter((i) => items[i].on);
  if (pingpong && seq.length > 2) seq = [...seq, ...seq.slice(1, -1).reverse()];
  if (pos >= seq.length) pos = 0;
}

// ---- static text / i18n ----

function refreshTexts(): void {
  document.title = t("title.sheet");
  if (src) {
    updateCaption();
    updateCount();
    playBtn.textContent = playing ? t("ed.pause") : t("ed.play");
  }
}

// ---- upload ----

const drop = $("#sh-drop");
const fileInput = $<HTMLInputElement>("#sh-file");
const dzNote = $("#sh-drop .dz-note");

function flashDropError(key: string): void {
  if (!dzNote) return;
  dzNote.textContent = t(key);
  dzNote.classList.add("bad");
  setTimeout(() => {
    dzNote.textContent = t("sheet.dropNote");
    dzNote.classList.remove("bad");
  }, 4000);
}

async function loadFile(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) {
    flashDropError("sheet.dropBadType");
    return;
  }
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    flashDropError("sheet.dropBadDecode");
    return;
  }
  const cv = el("canvas", { width: bmp.width, height: bmp.height });
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  src = cv;
  srcCtx = ctx;
  base = sanitizeBase(file.name);

  const imgData = ctx.getImageData(0, 0, cv.width, cv.height);
  const det = detectGrid(imgData);
  if (det.grid) {
    grid = det.grid;
    setSliceNote(t("sheet.autoOk", { cols: det.grid.cols, rows: det.grid.rows, w: det.grid.cellW, h: det.grid.cellH }));
  } else {
    grid = {
      mode: "cells",
      cellW: cv.width,
      cellH: cv.height,
      cols: 1,
      rows: 1,
      offsetX: 0,
      offsetY: 0,
      spacingX: 0,
      spacingY: 0,
    };
    setSliceNote(t("sheet.autoFail"));
  }

  // sensible starting dials for the detected cell size
  $<HTMLInputElement>("#sh-packcols").value = String(Math.max(1, Math.min(24, det.grid?.cols ?? 8)));
  smallCells = grid.cellW <= 48 && grid.cellH <= 48;
  $<HTMLSelectElement>("#sh-scale").value = smallCells ? "4" : "2";
  $<HTMLSelectElement>("#sh-gscale").value = smallCells ? "2" : "1";
  scale = smallCells ? 4 : 2;

  drop.hidden = true;
  $("#sh-tool").hidden = false;
  drawSheet();
  syncInputsFromGrid();
  reslice();
  playing = true;
  playBtn.textContent = t("ed.pause");
}

$("#sh-browse").addEventListener("click", () => fileInput.click());
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

$("#sh-replace").addEventListener("click", () => {
  drop.hidden = false;
  drop.classList.remove("drag");
});

// ---- sheet stage & grid overlay ----

const fit = $("#sh-fit");
const imgCv = $<HTMLCanvasElement>("#sh-img");
const over = $<HTMLCanvasElement>("#sh-over");

function drawSheet(): void {
  if (!src) return;
  imgCv.width = src.width;
  imgCv.height = src.height;
  imgCv.getContext("2d")!.drawImage(src, 0, 0);
  fit.style.aspectRatio = `${src.width} / ${src.height}`;
  drawOverlay();
}

/** Grid overlay: cyan boxes + order badges for included cells, dimmed red for excluded. */
function drawOverlay(): void {
  if (!src) return;
  const rect = fit.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = window.devicePixelRatio || 1;
  over.width = Math.round(rect.width * dpr);
  over.height = Math.round(rect.height * dpr);
  const ctx = over.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  // crisp nearest-neighbour only when the sheet is shown at 1:1 or larger
  imgCv.classList.toggle("pixelated", rect.width >= src.width - 0.5);

  const sx = rect.width / src.width;
  const sy = rect.height / src.height;
  const badgePos = new Map<number, number>(); // item index → 1-based playback position
  let n = 0;
  for (const i of order) if (items[i].on) badgePos.set(i, ++n);

  ctx.lineWidth = Math.max(1, Math.min(1.6, sx * 1.5));
  ctx.font = `700 ${Math.max(9, Math.min(14, 10 * Math.max(sx, 0.8)))}px ui-monospace, monospace`;
  for (const item of items) {
    const x = item.frame.x * sx;
    const y = item.frame.y * sy;
    const w = item.frame.w * sx;
    const h = item.frame.h * sy;
    if (item.on) {
      ctx.strokeStyle = "rgba(76, 215, 255, 0.85)";
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      const p = badgePos.get(item.frame.i);
      if (p !== undefined && w >= 24 && h >= 16) {
        const bh = Math.min(16, h * 0.4);
        const bw = ctx.measureText(String(p)).width + 8;
        ctx.fillStyle = "rgba(76, 215, 255, 0.95)";
        ctx.fillRect(x + 1, y + 1, bw, bh);
        ctx.strokeStyle = "rgba(8, 34, 44, 0.9)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1.5, y + 1.5, bw - 1, bh - 1);
        ctx.fillStyle = "#08222c";
        ctx.fillText(String(p), x + 5, y + 1 + bh - 3.5);
      }
    } else {
      ctx.fillStyle = "rgba(11, 10, 16, 0.62)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(255, 77, 109, 0.75)";
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }
}

new ResizeObserver(() => drawOverlay()).observe(fit);

// click a cell on the sheet to include/exclude it
over.addEventListener("click", (e) => {
  if (!src) return;
  const rect = over.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * src.width;
  const py = ((e.clientY - rect.top) / rect.height) * src.height;
  const hit = items.find(
    (it) => px >= it.frame.x && px < it.frame.x + it.frame.w && py >= it.frame.y && py < it.frame.y + it.frame.h,
  );
  if (!hit) return;
  hit.on = !hit.on;
  rebuildSeq();
  updateThumb(hit.frame.i);
  updateCount();
  drawOverlay();
});

// ---- slice panel ----

const inMode = $<HTMLSelectElement>("#sh-mode");
const inCw = $<HTMLInputElement>("#sh-cw");
const inCh = $<HTMLInputElement>("#sh-ch");
const inCols = $<HTMLInputElement>("#sh-cols");
const inRows = $<HTMLInputElement>("#sh-rows");
const inOx = $<HTMLInputElement>("#sh-ox");
const inOy = $<HTMLInputElement>("#sh-oy");
const inSx = $<HTMLInputElement>("#sh-sx");
const inSy = $<HTMLInputElement>("#sh-sy");
const sliceNote = $("#sh-slice-note");

function setSliceNote(msg: string): void {
  sliceNote.textContent = msg;
}

function syncInputsFromGrid(): void {
  inMode.value = grid.mode;
  inCw.value = String(grid.cellW);
  inCh.value = String(grid.cellH);
  inCols.value = String(grid.cols);
  inRows.value = String(grid.rows);
  inOx.value = String(grid.offsetX);
  inOy.value = String(grid.offsetY);
  inSx.value = String(grid.spacingX);
  inSy.value = String(grid.spacingY);
  syncDerived();
}

/** The derived pair is disabled and recomputed from the mode's driving pair. */
function syncDerived(): void {
  if (!src) return;
  if (grid.mode === "cells") {
    const c = countFromCell(src.width, src.height, grid);
    inCols.value = String(c.cols);
    inRows.value = String(c.rows);
    inCw.disabled = inCh.disabled = false;
    inCols.disabled = inRows.disabled = true;
  } else {
    const c = cellFromCount(src.width, src.height, grid);
    inCw.value = String(c.cellW);
    inCh.value = String(c.cellH);
    inCw.disabled = inCh.disabled = true;
    inCols.disabled = inRows.disabled = false;
  }
}

function readGridFromInputs(): void {
  const num = (inp: HTMLInputElement, min: number, fallback: number) => {
    const v = Math.round(Number(inp.value));
    return Number.isFinite(v) && v >= min ? v : fallback;
  };
  grid.mode = (inMode.value === "count" ? "count" : "cells") as SliceMode;
  grid.offsetX = num(inOx, 0, 0);
  grid.offsetY = num(inOy, 0, 0);
  grid.spacingX = num(inSx, 0, 0);
  grid.spacingY = num(inSy, 0, 0);
  if (grid.mode === "cells") {
    grid.cellW = num(inCw, 1, grid.cellW || 1);
    grid.cellH = num(inCh, 1, grid.cellH || 1);
    const c = countFromCell(src!.width, src!.height, grid);
    grid.cols = c.cols;
    grid.rows = c.rows;
  } else {
    grid.cols = num(inCols, 1, grid.cols || 1);
    grid.rows = num(inRows, 1, grid.rows || 1);
    const c = cellFromCount(src!.width, src!.height, grid);
    grid.cellW = c.cellW;
    grid.cellH = c.cellH;
  }
}

for (const inp of [inMode, inCw, inCh, inCols, inRows, inOx, inOy, inSx, inSy])
  inp.addEventListener("change", () => {
    if (!src) return;
    readGridFromInputs();
    syncDerived();
    setSliceNote("");
    reslice();
  });

$("#sh-auto").addEventListener("click", () => {
  if (!src || !srcCtx) return;
  const det = detectGrid(srcCtx.getImageData(0, 0, src.width, src.height));
  if (!det.grid) {
    setSliceNote(t("sheet.autoFail"));
    return;
  }
  grid = det.grid;
  syncInputsFromGrid();
  setSliceNote(
    t("sheet.autoOk", { cols: grid.cols, rows: grid.rows, w: grid.cellW, h: grid.cellH }),
  );
  reslice();
});

$("#sh-reset").addEventListener("click", () => {
  for (const it of items) it.on = true;
  order = items.map((_, i) => i);
  rebuildSeq();
  renderThumbs();
  updateCount();
  drawOverlay();
});

// ---- frames strip ----

const thumbsBox = $("#sh-thumbs");
const countLine = $("#sh-count");
const THUMB_CAP = 600;

function updateCaption(): void {
  $("#sh-cap").textContent = src ? t("sheet.imgInfo", { w: src.width, h: src.height, n: items.length }) : "—";
}

function updateCount(): void {
  const on = items.filter((i) => i.on).length;
  countLine.textContent = t("sheet.nSel", { n: on, m: items.length }) +
    (items.length > THUMB_CAP ? ` · ${t("sheet.thumbsCapped", { n: THUMB_CAP })}` : "");
}

function updateThumb(i: number): void {
  const at = order.indexOf(i);
  const rec = thumbs[at];
  if (!rec) return;
  rec.root.classList.toggle("off", !items[i].on);
  rec.num.textContent = items[i].on ? String(at + 1) : "–";
}

function renderThumbs(): void {
  thumbsBox.replaceChildren();
  thumbs.length = 0;
  if (!src || !srcCtx) return;
  const shown = Math.min(order.length, THUMB_CAP);
  for (let k = 0; k < shown; k++) {
    const i = order[k];
    const it = items[i];
    const cv = el("canvas", { width: it.frame.w, height: it.frame.h });
    cv.getContext("2d")!.drawImage(src, it.frame.x, it.frame.y, it.frame.w, it.frame.h, 0, 0, it.frame.w, it.frame.h);
    cv.style.aspectRatio = `${it.frame.w} / ${it.frame.h}`;
    cv.addEventListener("click", () => {
      it.on = !it.on;
      rebuildSeq();
      updateThumb(i);
      updateCount();
      drawOverlay();
    });
    const num = el("span", { className: "t-num", textContent: it.on ? String(k + 1) : "–" });
    const root = el("div", { className: `thumb${it.on ? "" : " off"}`, title: `#${i + 1}` }, [
      cv,
      el("div", { className: "t-meta" }, [
        el("button", {
          className: "mv",
          type: "button",
          textContent: "‹",
          title: t("sheet.mvLeftTitle"),
          onclick: () => swap(k, -1),
        }),
        num,
        el("button", {
          className: "mv",
          type: "button",
          textContent: "›",
          title: t("sheet.mvRightTitle"),
          onclick: () => swap(k, 1),
        }),
      ]),
    ]);
    thumbs.push({ root, num });
    thumbsBox.append(root);
  }
}

function swap(at: number, dir: -1 | 1): void {
  const to = at + dir;
  if (to < 0 || to >= order.length) return;
  [order[at], order[to]] = [order[to], order[at]];
  rebuildSeq();
  renderThumbs();
  updateCount();
  drawOverlay();
}

// ---- animated preview ----

const prev = $<HTMLCanvasElement>("#sh-prev");
const playBtn = $<HTMLButtonElement>("#sh-play");

function drawPrev(): void {
  const ctx = prev.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  if (!src || !seq.length) {
    ctx.clearRect(0, 0, prev.width, prev.height);
    return;
  }
  const f = items[seq[Math.min(pos, seq.length - 1)]].frame;
  ctx.clearRect(0, 0, prev.width, prev.height);
  ctx.drawImage(src, f.x, f.y, f.w, f.h, 0, 0, prev.width, prev.height);
}

function sizePrev(): void {
  const w = grid.cellW * scale;
  const h = grid.cellH * scale;
  prev.width = Math.max(1, w);
  prev.height = Math.max(1, h);
  drawPrev();
}

let last = performance.now();
let acc = 0;
function tick(now: number): void {
  const dt = now - last;
  last = now;
  if (playing && seq.length > 1 && src) {
    acc += dt;
    const dur = 1000 / fps;
    while (acc >= dur) {
      acc -= dur;
      if (pos < seq.length - 1) pos++;
      else if (loop) pos = 0;
      else {
        acc = 0;
        break;
      }
    }
  }
  drawPrev();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

playBtn.addEventListener("click", () => {
  playing = !playing;
  if (playing && pos >= seq.length - 1 && !loop) pos = 0;
  playBtn.textContent = playing ? t("ed.pause") : t("ed.play");
  playBtn.setAttribute("aria-pressed", String(playing));
});

const fpsIn = $<HTMLInputElement>("#sh-fps");
fpsIn.addEventListener("input", () => {
  fps = Math.max(1, Math.round(Number(fpsIn.value) || 12));
  $("#sh-fps-val").textContent = String(fps);
  acc = 0;
});

$("#sh-loop").addEventListener("click", function (this: HTMLButtonElement) {
  loop = !loop;
  this.setAttribute("aria-pressed", String(loop));
});

$("#sh-pp").addEventListener("click", function (this: HTMLButtonElement) {
  pingpong = !pingpong;
  this.setAttribute("aria-pressed", String(pingpong));
  rebuildSeq();
  pos = 0;
});

$("#sh-scale").addEventListener("change", function (this: HTMLSelectElement) {
  scale = Math.max(1, Math.round(Number(this.value) || 1));
  sizePrev();
});

// ---- re-slice (the single funnel that rebuilds frames after any grid change) ----

function reslice(): void {
  if (!src) return;
  items = sliceSheet(src.width, src.height, grid).map((frame) => ({ frame, on: true }));
  order = items.map((_, i) => i);
  rebuildSeq();
  pos = 0;
  renderThumbs();
  updateCaption();
  updateCount();
  drawOverlay();
  sizePrev();
}

// ---- exports ----

const note = $("#sh-exp-note");
let busy = false;

function setNote(msg: string, ok = false): void {
  note.innerHTML = ok ? `<span class="export-ok">${msg}</span>` : msg;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function seqFrames(): FrameDef[] {
  return order.filter((i) => items[i].on).map((i) => items[i].frame);
}

async function runExport(fn: () => Promise<string>): Promise<void> {
  if (busy || !src || !srcCtx) return;
  if (!seqFrames().length) {
    setNote(t("sheet.noteNone"));
    return;
  }
  busy = true;
  for (const b of document.querySelectorAll<HTMLButtonElement>(".sheet-grid .btn"))
    b.disabled = true;
  try {
    const name = await fn();
    setNote(`✓ ${name}`, true);
  } catch (err) {
    setNote(t("ed.noteFail", { msg: err instanceof Error ? err.message : String(err) }));
  } finally {
    busy = false;
    for (const b of document.querySelectorAll<HTMLButtonElement>(".sheet-grid .btn"))
      b.disabled = false;
  }
}

/** Each included frame as RGBA pixels, in playback order. */
function frameRgba(frames: FrameDef[]): Uint8ClampedArray[] {
  return frames.map((f) => srcCtx!.getImageData(f.x, f.y, f.w, f.h).data);
}

function frameName(i: number, ext = ""): string {
  return `${base}_${String(i).padStart(3, "0")}${ext}`;
}

async function frameCanvases(frames: FrameDef[]): Promise<HTMLCanvasElement[]> {
  return frames.map((f) => {
    const cv = el("canvas", { width: f.w, height: f.h });
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(src!, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    return cv;
  });
}

function packFrames(frames: FrameDef[]): { placed: ReturnType<typeof packLayout>["placed"]; w: number; h: number } {
  const cols = Math.max(1, Math.round(Number($<HTMLInputElement>("#sh-packcols").value) || 8));
  const { w, h, placed } = packLayout(frames, cols);
  return { placed, w, h };
}

$("#exp-gif").addEventListener("click", () =>
  void runExport(async () => {
    const frames = seqFrames();
    setNote(t("ed.noteGif", { i: 0, n: frames.length }));
    const gscale = Math.max(1, Math.round(Number($<HTMLSelectElement>("#sh-gscale").value) || 1));
    const blob = await encodeGif(frameRgba(frames), grid.cellW, grid.cellH, fps, gscale, (i, n) =>
      setNote(t("ed.noteGif", { i, n })),
    );
    download(blob, `${base}.gif`);
    return `${base}.gif`;
  }),
);

$("#exp-zip").addEventListener("click", () =>
  void runExport(async () => {
    const frames = seqFrames();
    setNote(t("sheet.noteZip", { n: frames.length }));
    const cvs = await frameCanvases(frames);
    const entries: { name: string; data: Uint8Array }[] = [];
    for (let i = 0; i < cvs.length; i++)
      entries.push({ name: frameName(i, ".png"), data: await blobBytes(await canvasToBlob(cvs[i])) });
    download(zipBlob(entries), `${base}-frames.zip`);
    return `${base}-frames.zip`;
  }),
);

$("#exp-sheet").addEventListener("click", () =>
  void runExport(async () => {
    setNote(t("sheet.notePng"));
    const frames = seqFrames();
    const { placed, w, h } = packFrames(frames);
    const blob = await canvasToBlob(packCanvas(src!, placed, w, h));
    download(blob, `${base}-sheet.png`);
    return `${base}-sheet.png`;
  }),
);

function buildAtlas(): ReturnType<typeof packLayout> & { pngName: string; xml: string; json: string } {
  const { w, h, placed } = packFrames(seqFrames());
  const pngName = `${base}-sheet.png`;
  return {
    w,
    h,
    placed,
    pngName,
    xml: sparrowXml(pngName, placed, w, h, (i) => frameName(i)),
    json: texturePackerJson(pngName, placed, w, h, (i) => frameName(i, ".png")),
  };
}

$("#exp-xml").addEventListener("click", () =>
  void runExport(async () => {
    download(new Blob([buildAtlas().xml], { type: "application/xml" }), `${base}.xml`);
    return `${base}.xml`;
  }),
);

$("#exp-json").addEventListener("click", () =>
  void runExport(async () => {
    download(new Blob([buildAtlas().json], { type: "application/json" }), `${base}.json`);
    return `${base}.json`;
  }),
);

$("#exp-pack").addEventListener("click", () =>
  void runExport(async () => {
    setNote(t("sheet.notePng"));
    const { placed, w, h, xml, json, pngName } = buildAtlas();
    const png = await blobBytes(await canvasToBlob(packCanvas(src!, placed, w, h)));
    download(zipBlob([
      { name: pngName, data: png },
      { name: `${base}.xml`, data: new TextEncoder().encode(xml) },
      { name: `${base}.json`, data: new TextEncoder().encode(json) },
    ]), `${base}-pack.zip`);
    return `${base}-pack.zip`;
  }),
);

// ---- boot ----

applyStaticText();
mountLangSwitcher();
if (getLocale() !== "en") document.title = t("title.sheet");
onLocaleChange(refreshTexts);
