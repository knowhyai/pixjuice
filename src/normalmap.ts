// The normal map tool: upload → Sobel over a blurred height field (luma or alpha) →
// normal map + live lit preview (pointer moves the light, auto-orbits when idle) → PNG export.

import "./style.css";
import {
  canvasToBlob,
  downloadBlob,
  loadImageFile,
  normalMap,
  normalsAsFloat,
  sanitizeBase,
  type DecodedImage,
  type NormalOpts,
} from "./lib/pixels";
import { applyStaticText, getLocale, mountLangSwitcher, onLocaleChange, t } from "./lib/i18n";
import { mountToolsMenu } from "./lib/navmenu";

const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector(s) as T;

// ---- state ----

let img: DecodedImage | null = null;
let base = "sprite";
let normals: Float32Array = new Float32Array(0); // per-pixel xyz, refreshed per render
let W = 0;
let H = 0;
let busy = false;
let renderTimer = 0;

// light in canvas pixel space; z lifts it toward the viewer
const light = { x: 0, y: 0, z: 0.9 };
let pointerAt = -Infinity; // timestamp of the last pointer move → auto-orbit pauses

// ---- static text / i18n ----

function refreshTexts(): void {
  document.title = t("title.nm");
  if (img) updateCaption();
}

// ---- upload ----

const drop = $("#nm-drop");
const fileInput = $<HTMLInputElement>("#nm-file");
const dzNote = $("#nm-drop .dz-note");

function flashDropError(key: string): void {
  if (!dzNote) return;
  dzNote.textContent = t(key);
  dzNote.classList.add("bad");
  setTimeout(() => {
    dzNote.textContent = t("nm.dropNote");
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
  W = decoded.cv.width;
  H = decoded.cv.height;
  light.x = W * 0.3;
  light.y = H * 0.25;
  drop.hidden = true;
  $("#nm-tool").hidden = false;
  renderNow();
}

$("#nm-browse").addEventListener("click", () => fileInput.click());
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

$("#nm-replace").addEventListener("click", () => {
  drop.hidden = false;
  drop.classList.remove("drag");
});

// ---- controls ----

const inStrength = $<HTMLInputElement>("#nm-strength");
const inBlur = $<HTMLInputElement>("#nm-blur");
const inSource = $<HTMLSelectElement>("#nm-source");
const inYdir = $<HTMLSelectElement>("#nm-ydir");
const inInvert = $<HTMLButtonElement>("#nm-invert");
const note = $("#nm-note");

function updateCaption(): void {
  if (!img) return;
  $("#nm-cap").textContent = t("nm.imgInfo", { w: W, h: H });
}

// ---- render pipeline ----

const outCv = $<HTMLCanvasElement>("#nm-out");
const litCv = $<HTMLCanvasElement>("#nm-lit");

function opts(): NormalOpts {
  return {
    strength: Math.max(0.5, Number(inStrength.value) || 2.5),
    blur: Math.max(0, Math.round(Number(inBlur.value) || 0)),
    invertY: inYdir.value === "dx",
    heightFrom: inSource.value === "alpha" ? "alpha" : "luma",
    invertHeight: inInvert.getAttribute("aria-pressed") === "true",
  };
}

function renderNow(): void {
  if (!img) return;
  const nm = normalMap(img.data, opts());
  normals = normalsAsFloat(nm);
  outCv.width = W;
  outCv.height = H;
  outCv.getContext("2d")!.putImageData(nm, 0, 0);
  litCv.width = W;
  litCv.height = H;
  updateCaption();
}

function render(): void {
  clearTimeout(renderTimer);
  renderTimer = window.setTimeout(renderNow, 100);
}

for (const inp of [inStrength, inBlur, inSource, inYdir]) inp.addEventListener("input", () => {
  if (!img) return;
  $("#nm-strength-val").textContent = String(Number(inStrength.value));
  $("#nm-blur-val").textContent = String(Math.round(Number(inBlur.value)));
  render();
});
inInvert.addEventListener("click", () => {
  const on = inInvert.getAttribute("aria-pressed") !== "true";
  inInvert.setAttribute("aria-pressed", String(on));
  if (img) renderNow();
});

// pointer moves the light; after 2.5s of no input it orbits on its own
litCv.addEventListener("pointermove", (e) => {
  const r = litCv.getBoundingClientRect();
  light.x = ((e.clientX - r.left) / r.width) * W;
  light.y = ((e.clientY - r.top) / r.height) * H;
  pointerAt = performance.now();
});
litCv.addEventListener("pointerdown", (e) => {
  const r = litCv.getBoundingClientRect();
  light.x = ((e.clientX - r.left) / r.width) * W;
  light.y = ((e.clientY - r.top) / r.height) * H;
  pointerAt = performance.now();
});

// ---- live lighting loop ----

const litCtx = litCv.getContext("2d")!;
let frame: ImageData | null = null; // reused output buffer (same size as the sprite)

function drawLit(now: number): void {
  if (img && W && H) {
    const src = img.data.data;
    if (!frame || frame.width !== W || frame.height !== H) frame = litCtx.createImageData(W, H);
    const out = frame.data;
    const ambient = 0.42;
    const zLight = light.z * Math.max(W, H);
    // auto-orbit while the pointer rests
    if (now - pointerAt > 2500) {
      const a = now / 1600;
      light.x = W / 2 + (Math.cos(a) * W) / 2.6;
      light.y = H / 2 + (Math.sin(a * 1.3) * H) / 3;
    }
    const lx = light.x;
    const ly = light.y;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const j = i * 4;
        if (src[j + 3] < 8) {
          out[j + 3] = 0;
          continue;
        }
        // light vector (normalized)
        let vx = lx - x;
        let vy = ly - y;
        let vz = zLight;
        const vl = Math.hypot(vx, vy, vz);
        vx /= vl;
        vy /= vl;
        vz /= vl;
        const nx = normals[i * 3];
        const ny = normals[i * 3 + 1];
        const nz = normals[i * 3 + 2];
        let diff = nx * vx + ny * vy + nz * vz;
        if (diff < 0) diff = 0;
        // half vector with view (0,0,1): h = normalize(v + view)
        let hx = vx;
        let hy = vy;
        let hz = vz + 1;
        const hl = Math.hypot(hx, hy, hz);
        hx /= hl;
        hy /= hl;
        hz /= hl;
        let spec = nx * hx + ny * hy + nz * hz;
        spec = spec > 0 ? spec * spec * spec * diff : 0; // cheap shininess
        const lit2 = ambient + (1 - ambient) * diff;
        out[j] = Math.min(255, src[j] * lit2 + spec * 235);
        out[j + 1] = Math.min(255, src[j + 1] * lit2 + spec * 235);
        out[j + 2] = Math.min(255, src[j + 2] * lit2 + spec * 235);
        out[j + 3] = src[j + 3];
      }
    }
    litCtx.putImageData(frame, 0, 0);
    // the bulb: a small cross at the light position
    const bx = Math.round(lx);
    const by = Math.round(ly);
    litCtx.fillStyle = "rgba(255, 236, 39, 0.95)";
    litCtx.fillRect(bx - 3, by, 7, 1);
    litCtx.fillRect(bx, by - 3, 1, 7);
  }
  requestAnimationFrame(drawLit);
}
requestAnimationFrame(drawLit);

// ---- export ----

function setNote(msg: string, ok = false): void {
  note.innerHTML = ok ? `<span class="export-ok">${msg}</span>` : msg;
}

$("#nm-exp").addEventListener("click", () => {
  if (busy || !img) return;
  busy = true;
  for (const b of document.querySelectorAll<HTMLButtonElement>("#nm-tool .btn:not(.vip)")) b.disabled = true;
  try {
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    cv.getContext("2d")!.drawImage(outCv, 0, 0);
    void canvasToBlob(cv).then((blob) => {
      const name = `${base}-normal.png`;
      downloadBlob(blob, name);
      setNote(t("ed.noteDone", { name, kb: Math.max(1, Math.round(blob.size / 1024)) }), true);
    });
  } catch (err) {
    setNote(t("ed.noteFail", { msg: err instanceof Error ? err.message : String(err) }));
  } finally {
    busy = false;
    for (const b of document.querySelectorAll<HTMLButtonElement>("#nm-tool .btn:not(.vip)")) b.disabled = false;
  }
});

// ---- boot ----

applyStaticText();
mountLangSwitcher();
mountToolsMenu();
if (getLocale() !== "en") document.title = t("title.nm");
onLocaleChange(refreshTexts);
