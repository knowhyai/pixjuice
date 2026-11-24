import "../style.css";
import "./camera-shake.css";
import { syncHeaderOffset } from "../lib/header-offset";
import { getLocale, mountLangSwitcher, onLocaleChange } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { patchFilename, patchJson } from "../lib/camera-shake/export";
import { motionIsReduced, REST, sampleTrace, ShakeComparison } from "../lib/camera-shake/motion";
import { clampParams, DEFAULTS, LIMITS, PARAM_KEYS, paramsForMode, STARTER } from "../lib/camera-shake/params";
import { buildShareUrl, decodeShare, encodeShare, SHARE_PARAM } from "../lib/camera-shake/share";
import { STRINGS, type ShakeString } from "../lib/camera-shake/strings";
import type { MotionPreference, ShakeMode, ShakeParams, ShakePose } from "../lib/camera-shake/types";

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeLocal(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* Controls still work in this tab. */ }
}

mountToolsMenu();
mountLangSwitcher();
syncHeaderOffset();

const tuneKey = "pixjuice-camera-shake-tune";
const motionKey = "pixjuice-camera-shake-motion";
const fromUrl = decodeShare(new URL(location.href).searchParams.get(SHARE_PARAM));
const saved = fromUrl ?? decodeShare(readLocal(tuneKey));
let tune = saved?.tune ?? { ...STARTER };
let mode: ShakeMode = saved?.mode ?? "mine";

const motionSelect = byId<HTMLSelectElement>("lab-motion");
const savedMotion = readLocal(motionKey);
motionSelect.value = savedMotion === "reduce" || savedMotion === "allow" ? savedMotion : "auto";
const systemMotion = matchMedia("(prefers-reduced-motion: reduce)");
const reduced = () => motionIsReduced(motionSelect.value as MotionPreference, systemMotion.matches);

const comparison = new ShakeComparison();
const scenes = ["default", "mine"].map(name => byId<HTMLCanvasElement>("lab-scene-" + name));
const traceCanvas = byId<HTMLCanvasElement>("lab-trace");
const sliderGroup = byId("lab-sliders");
const defaultButton = byId("lab-default");
const mineButton = byId("lab-mine");
const statusElement = byId("lab-status");
const shareResult = byId("lab-share-result");
const shareInput = byId<HTMLInputElement>("lab-share-url");
const shareLink = byId<HTMLAnchorElement>("lab-open-share");
const shareStatus = byId("lab-share-status");
let status: ShakeString = "ready";
let frame: number | null = null;
let poses: readonly ShakePose[] = [REST, REST];
let shareCopied = false;
const units: Record<keyof ShakeParams, string> = {
  positionAmplitude: "px", rotationAmplitude: "°", frequency: "Hz", decay: "s⁻¹", duration: "s",
};

const controls = PARAM_KEYS.map(key => {
  const label = document.createElement("label");
  label.className = "shake-control";
  const name = document.createElement("span");
  const value = document.createElement("span");
  value.className = "shake-value";
  value.setAttribute("aria-hidden", "true");
  const input = document.createElement("input");
  input.type = "range";
  input.id = "lab-" + key;
  const [min, max, step] = LIMITS[key];
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  label.append(name, value, input);
  sliderGroup.append(label);
  input.addEventListener("input", () => {
    tune = clampParams({ ...tune, [key]: input.valueAsNumber });
    selectMode("mine");
  });
  return { key, name, input, value };
});

function number(value: number): string {
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 }).format(value);
}

function setStatus(value: ShakeString): void {
  status = value;
  statusElement.textContent = STRINGS[getLocale()][value];
}

function params(mode: ShakeMode): ShakeParams {
  return paramsForMode(tune, DEFAULTS, mode);
}

function syncPatch(): void {
  defaultButton.setAttribute("aria-pressed", String(mode === "default"));
  mineButton.setAttribute("aria-pressed", String(mode === "mine"));
  for (const { key, input, value } of controls) {
    input.value = String(tune[key]);
    value.textContent = `${number(tune[key])} ${units[key]}`;
    input.setAttribute("aria-valuetext", value.textContent);
  }
}

function selectMode(next: ShakeMode): void {
  mode = next;
  writeLocal(tuneKey, encodeShare(mode, tune));
  shareResult.hidden = true;
  syncPatch();
  drawTrace();
}

function surface(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas.getBoundingClientRect();
  if (!ctx || width <= 0 || height <= 0) return null;
  const scale = Math.min(devicePixelRatio || 1, 3);
  const pixelsWide = Math.max(1, Math.round(width * scale));
  const pixelsHigh = Math.max(1, Math.round(height * scale));
  if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
  if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
  ctx.setTransform(pixelsWide / width, 0, 0, pixelsHigh / height, 0, 0);
  return { ctx, width, height };
}

function drawScene(canvas: HTMLCanvasElement, pose: ShakePose): void {
  const view = surface(canvas);
  if (!view) return;
  const { ctx, width, height } = view;
  const scale = Math.min(width / 300, height / 160);
  const overscan = Math.hypot(width, height) / scale + 100 / scale;

  ctx.translate(width / 2 + pose.x, height / 2 + pose.y);
  ctx.rotate(pose.rotation);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#182135";
  ctx.fillRect(-overscan, -overscan, 2 * overscan, 2 * overscan);
  ctx.fillStyle = "#242e44";
  ctx.fillRect(-overscan, 25, 2 * overscan, overscan);
  ctx.strokeStyle = "#40516e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const y of [25, 36, 52, 75, 110]) {
    ctx.moveTo(-overscan, y);
    ctx.lineTo(overscan, y);
  }
  for (let x = -192; x <= 192; x += 24) {
    ctx.moveTo(x, 25);
    ctx.lineTo(x * 6, 150);
  }
  ctx.stroke();

  ctx.fillStyle = "#101929";
  ctx.fillRect(-114, -55, 65, 75);
  ctx.fillStyle = "#35526d";
  ctx.fillRect(-108, -49, 53, 46);
  ctx.strokeStyle = "#6590a2";
  ctx.strokeRect(-108, -49, 53, 46);
  ctx.fillRect(-108, -28, 53, 4);
  ctx.strokeRect(-83, -49, 3, 46);

  ctx.fillStyle = "#ad673d";
  ctx.fillRect(39, 1, 44, 42);
  ctx.strokeStyle = "#f3b879";
  ctx.lineWidth = 2;
  ctx.strokeRect(42, 4, 38, 36);
  ctx.beginPath();
  ctx.moveTo(42, 40);
  ctx.lineTo(80, 4);
  ctx.stroke();

  ctx.fillStyle = "#0f1827";
  ctx.fillRect(-18, 8, 24, 30);
  ctx.fillRect(-17, 36, 8, 12);
  ctx.fillRect(-3, 36, 8, 12);
  ctx.fillStyle = "#71d6ce";
  ctx.fillRect(-17, -7, 22, 15);
  ctx.fillStyle = "#143342";
  ctx.fillRect(-7, -2, 12, 5);
}

function drawScenes(): void {
  scenes.forEach((canvas, i) => drawScene(canvas, poses[i]));
}

function drawTrace(): void {
  const view = surface(traceCanvas);
  if (!view) return;
  const { ctx, width, height } = view;
  const defaults = params("default");
  const mine = params("mine");
  const duration = Math.max(defaults.duration, mine.duration);
  const traces = [sampleTrace(defaults, duration), sampleTrace(mine, duration)];
  const peaks = traces.map(trace => Math.max(...trace.map(pose => Math.abs(pose.x))));
  const css = getComputedStyle(traceCanvas);
  const extent = Math.max(1, ...peaks);

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = css.getPropertyValue("--line").trim();
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
  traces.forEach((trace, i) => {
    ctx.strokeStyle = i === 0 ? css.color : css.getPropertyValue("--acc").trim();
    ctx.lineWidth = i === 0 ? 1.5 : 2;
    ctx.setLineDash(i === 0 ? [4, 3] : []);
    ctx.beginPath();
    trace.forEach(({ x }, index) => {
      const px = (width - 4) * index / (trace.length - 1) + 2;
      const py = height / 2 - (height / 2 - 5) * x / extent;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });
  ctx.setLineDash([]);
  byId("lab-trace-duration").textContent = number(duration) + " s";
  byId("lab-peak-default").textContent = "max |x| ≈ " + number(peaks[0]) + " px";
  byId("lab-peak-mine").textContent = "max |x| ≈ " + number(peaks[1]) + " px";
}

function cancel(next: ShakeString): void {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  comparison.reset();
  poses = [REST, REST];
  drawScenes();
  setStatus(next);
}

function advance(now: number): void {
  frame = null;
  poses = comparison.sample(now / 1000, reduced());
  drawScenes();
  if (poses.some(pose => pose.active)) frame = requestAnimationFrame(advance);
  else setStatus(reduced() ? "reduced" : "finished");
}

function localize(): void {
  const copy = STRINGS[getLocale()];
  document.title = copy.title + " — PixJuice";
  document.querySelectorAll<HTMLElement>("[data-shake]").forEach(element => {
    element.textContent = copy[element.dataset.shake as ShakeString];
  });
  for (const { key, name } of controls) name.textContent = copy[key];
  syncPatch();
  setStatus(status);
  shareStatus.textContent = shareCopied ? copy.copied : "";
  drawTrace();
}

mineButton.addEventListener("click", () => selectMode("mine"));
defaultButton.addEventListener("click", () => selectMode("default"));
byId("lab-trigger").addEventListener("click", () => {
  if (reduced()) {
    cancel("reduced");
    return;
  }
  if (frame !== null) cancelAnimationFrame(frame);
  const now = performance.now();
  comparison.trigger(now / 1000, params("default"), params("mine"));
  setStatus("playing");
  advance(now);
});
byId("lab-stop").addEventListener("click", () => cancel("stopped"));
byId("lab-reset").addEventListener("click", () => cancel("resetDone"));

function motionChanged(): void {
  if (reduced() && frame !== null) cancel("reduced");
  else if (!reduced() && status === "reduced") setStatus("ready");
}

systemMotion.addEventListener("change", motionChanged);
motionSelect.addEventListener("change", () => {
  writeLocal(motionKey, motionSelect.value);
  motionChanged();
});

byId("lab-json").addEventListener("click", () => {
  const file = new Blob([patchJson(mode, params(mode))], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = patchFilename(mode);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

byId("lab-share").addEventListener("click", async () => {
  const url = buildShareUrl(location.href, mode, tune);
  shareInput.value = url;
  shareLink.href = url;
  shareResult.hidden = false;
  shareCopied = false;
  shareStatus.textContent = "";
  try {
    await navigator.clipboard.writeText(url);
    if (shareResult.hidden || shareInput.value !== url) return;
    shareCopied = true;
    shareStatus.textContent = STRINGS[getLocale()].copied;
  } catch {
    // The revealed URL remains available when clipboard access is unavailable.
  }
});

onLocaleChange(localize);
const resize = new ResizeObserver(() => {
  drawScenes();
  drawTrace();
});
for (const canvas of [...scenes, traceCanvas]) resize.observe(canvas);
new MutationObserver(drawTrace).observe(document.documentElement, {
  attributes: true, attributeFilter: ["data-theme"],
});
localize();
drawScenes();
