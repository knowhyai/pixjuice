import "../style.css";
import "./audio-envelope.css";
import { syncHeaderOffset } from "../lib/header-offset";
import { getLocale, mountLangSwitcher, onLocaleChange } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { createEnvelope, envelopePoints } from "../lib/audio-envelope/envelope";
import { downloadPatch, patchJson } from "../lib/audio-envelope/export";
import { clampPatch, DEFAULT_PATCH, LIMITS, paramsForMode } from "../lib/audio-envelope/params";
import { patchForPreset, PRESETS } from "../lib/audio-envelope/presets";
import { STRINGS, type StringKey } from "../lib/audio-envelope/strings";
import { playWithWebAudio, renderPcm, type Voice } from "../lib/audio-envelope/synth";
import { WAVEFORMS, type Mode, type Patch } from "../lib/audio-envelope/types";
import { wavBlob } from "../lib/audio-envelope/wav";

mountToolsMenu();
mountLangSwitcher();
syncHeaderOffset();

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const preset = byId<HTMLSelectElement>("lab-preset");
const waveform = byId<HTMLSelectElement>("lab-waveform");
const slide = byId<HTMLInputElement>("lab-slide");
const mine = byId<HTMLButtonElement>("lab-mine");
const pageDefault = byId<HTMLButtonElement>("lab-default");
const stop = byId<HTMLButtonElement>("lab-stop");
const statusLabel = byId("lab-status");
const canvas = byId<HTMLCanvasElement>("lab-envelope");
const durationLabel = byId("lab-duration");

let tune: Patch = { ...DEFAULT_PATCH };
let mode: Mode = "mine";
let context: AudioContext | undefined;
let voice: Voice | undefined;
let request = 0;
let status: StringKey = "ready";
const activePatch = () => paramsForMode(tune, DEFAULT_PATCH, mode);

function option(select: HTMLSelectElement, key: StringKey): void {
  const node = new Option("", key);
  node.dataset.envelope = key;
  select.add(node);
}
option(preset, "starter");
for (const { id } of PRESETS) option(preset, id);
option(preset, "custom");
for (const shape of WAVEFORMS) option(waveform, shape);
preset.value = "starter";

type SliderKey = keyof typeof LIMITS | "endFrequency";
const sliders = new Map<SliderKey, { input: HTMLInputElement; output: HTMLOutputElement; unit: string }>();

function addSlider(parent: string, key: SliderKey, unit: string): void {
  const [min, max, step] = LIMITS[key === "endFrequency" ? "frequency" : key];
  const row = document.createElement("div");
  row.className = "envelope-slider";
  const label = document.createElement("label");
  label.dataset.envelope = key;
  const input = document.createElement("input");
  input.id = `lab-${key}`;
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  label.htmlFor = input.id;
  const output = document.createElement("output");
  output.htmlFor.add(input.id);
  output.setAttribute("aria-hidden", "true");
  row.append(label, output, input);
  byId(parent).append(row);
  sliders.set(key, { input, output, unit });
  input.addEventListener("input", () => edit({ [key]: input.valueAsNumber }));
}

addSlider("lab-adsr", "attack", "ms");
addSlider("lab-adsr", "decay", "ms");
addSlider("lab-adsr", "sustainLevel", "%");
addSlider("lab-adsr", "sustainTime", "ms");
addSlider("lab-adsr", "release", "ms");
addSlider("lab-pitch", "frequency", "Hz");
addSlider("lab-end", "endFrequency", "Hz");
addSlider("lab-gain", "gain", "%");

function drawEnvelope(): void {
  const ctx = canvas.getContext("2d");
  const { clientWidth: width, clientHeight: height } = canvas;
  if (!ctx || !width || !height) return;
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  ctx.scale(canvas.width / width, canvas.height / height);

  const style = getComputedStyle(canvas);
  const color = (key: string) => style.getPropertyValue(key).trim();
  const current = activePatch();
  const duration = createEnvelope(current).duration;
  const span = Math.max(duration, createEnvelope(DEFAULT_PATCH).duration);
  const left = 42;
  const right = width - 16;
  const top = 18;
  const bottom = height - 30;
  const plotX = (time: number) => left + time / span * (right - left);
  const plotY = (level: number) => bottom - level * (bottom - top);
  const format = new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 3 });
  durationLabel.textContent = `${format.format(duration)} s`;

  ctx.font = `11px ${style.fontFamily}`;
  ctx.fillStyle = color("--dim");
  ctx.strokeStyle = color("--line");
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const level of [0, 0.5, 1]) {
    const y = plotY(level);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    ctx.fillText(format.format(level), left - 7, y);
  }

  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.fillText("0", left, bottom + 8);
  ctx.fillText(`${format.format(span / 2)} s`, plotX(span / 2), bottom + 8);
  ctx.textAlign = "right";
  ctx.fillText(`${format.format(span)} s`, right, bottom + 8);

  function curve(patch: Readonly<Patch>, comparison: boolean): void {
    const points = envelopePoints(patch);
    ctx!.beginPath();
    ctx!.moveTo(left, bottom);
    for (const { time, level } of points) ctx!.lineTo(plotX(time), plotY(level));
    ctx!.strokeStyle = color(comparison ? "--acc2" : "--acc");
    ctx!.lineJoin = "round";
    ctx!.lineWidth = comparison ? 5 : 2;
    ctx!.setLineDash(comparison ? [5, 5] : []);
    ctx!.stroke();
  }
  curve(DEFAULT_PATCH, true);
  curve(current, false);
}

function refresh(): void {
  mine.setAttribute("aria-pressed", String(mode === "mine"));
  pageDefault.setAttribute("aria-pressed", String(mode === "default"));
  waveform.value = tune.waveform;
  slide.checked = tune.endFrequency !== null;
  slide.disabled = tune.waveform === "noise";
  const number = new Intl.NumberFormat(getLocale());
  const percent = new Intl.NumberFormat(getLocale(), { style: "percent" });
  for (const [key, { input, output, unit }] of sliders) {
    const value = tune[key] ?? tune.frequency;
    const label = unit === "%" ? percent.format(value) : `${number.format(value)} ${unit}`;
    input.value = String(value);
    input.setAttribute("aria-valuetext", label);
    input.disabled = (key === "frequency" || key === "endFrequency") &&
      (tune.waveform === "noise" || (key === "endFrequency" && !slide.checked));
    output.value = label;
  }
  drawEnvelope();
}

function edit(changes: Partial<Patch>): void {
  mode = "mine";
  tune = clampPatch({ ...tune, ...changes });
  preset.value = "custom";
  refresh();
}

function setStatus(next: StringKey): void {
  status = next;
  statusLabel.textContent = STRINGS[getLocale()][status];
}

function localize(): void {
  const strings = STRINGS[getLocale()];
  document.querySelectorAll<HTMLElement>("[data-envelope]").forEach((node) => {
    node.textContent = strings[node.dataset.envelope as StringKey];
  });
  document.title = `${strings.title} — PixJuice`;
  setStatus(status);
  refresh();
}

mine.addEventListener("click", () => { mode = "mine"; refresh(); });
pageDefault.addEventListener("click", () => { mode = "default"; refresh(); });
waveform.addEventListener("change", () => edit({ waveform: waveform.value as Patch["waveform"] }));
slide.addEventListener("change", () => edit({ endFrequency: slide.checked ? tune.frequency : null }));
preset.addEventListener("change", () => {
  const selected = PRESETS.find(({ id }) => id === preset.value);
  if (selected) tune = patchForPreset(selected);
  if (preset.value === "starter") tune = { ...DEFAULT_PATCH };
  mode = "mine";
  refresh();
});

function stopPlayback(message: StringKey): void {
  request++;
  voice?.stop();
  voice = undefined;
  stop.disabled = true;
  setStatus(message);
}

byId("lab-play").addEventListener("click", async () => {
  // Creating or resuming the context and starting a voice requires a Play gesture.
  stopPlayback("starting");
  const pending = request;
  const patch = activePatch();
  stop.disabled = false;
  try {
    context ??= new AudioContext();
    if (context.state !== "running") await context.resume();
    if (pending !== request) return;
    const playing = playWithWebAudio(context, patch);
    voice = playing;
    setStatus("playing");
    await playing.ended;
    if (pending === request) stopPlayback("ready");
  } catch {
    if (pending === request) stopPlayback("playError");
  }
});

stop.addEventListener("click", () => stopPlayback("stopped"));
byId("lab-reset").addEventListener("click", () => stopPlayback("resetDone"));
window.addEventListener("pagehide", () => stopPlayback("ready"));

function patchName(): string {
  return mode === "default" || preset.value === "starter" ? "default" : preset.value;
}

byId("lab-wav").addEventListener("click", () => {
  const { samples, sampleRate } = renderPcm(activePatch());
  downloadPatch(patchName(), "wav", wavBlob(samples, sampleRate));
});
byId("lab-json").addEventListener("click", () => {
  const name = patchName();
  downloadPatch(name, "json", new Blob([patchJson(name, activePatch())], { type: "application/json" }));
});

onLocaleChange(localize);
new ResizeObserver(drawEnvelope).observe(canvas);
new MutationObserver(drawEnvelope).observe(document.documentElement, {
  attributes: true, attributeFilter: ["data-theme"],
});
localize();
