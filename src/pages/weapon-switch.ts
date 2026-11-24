import "../style.css";
import "./weapon-switch.css";
import { getLocale, mountLangSwitcher, onLocaleChange } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { syncHeaderOffset } from "../lib/header-offset";
import { exportFilename, exportJson } from "../lib/weapon-switch/export";
import { WeaponSwitchMachine } from "../lib/weapon-switch/machine";
import { DEFAULTS, editMineField, LIMITS, mineFieldBounds, paramsForMode, type MineFieldEdit, type NumericParam } from "../lib/weapon-switch/params";
import { buildShareUrl, initializeLabState, SHARE_PARAM } from "../lib/weapon-switch/share";
import { COPY, type CopyKey } from "../lib/weapon-switch/strings";
import { SLOTS, type LogEntry, type Phase } from "../lib/weapon-switch/types";

mountToolsMenu();
mountLangSwitcher();
syncHeaderOffset();

const node = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const track = node("swap-track");
const log = node("swap-log");
const phaseLabel = node("swap-phase");
const busyBar = node<HTMLProgressElement>("swap-busy");
const sharePanel = node("swap-share-panel");
const shareButton = node<HTMLButtonElement>("swap-share");
const shareInput = node<HTMLInputElement>("swap-url");
const shareLink = node<HTMLAnchorElement>("swap-open");
const optionFields = [...document.querySelectorAll<HTMLSelectElement>("[data-option]")];
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-mode]")];
const storageKey = "pixjuice-weapon-switch-mine";
function loadMine(): unknown {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "null");
  } catch {
    return null;
  }
}

let { mine, mode } = initializeLabState({
  token: new URL(location.href).searchParams.get(SHARE_PARAM),
  storedMine: loadMine(),
});
const activeParams = () => paramsForMode(mine, DEFAULTS, mode);
const machine = new WeaponSwitchMachine(activeParams());
let frame = 0;
let lastTime: number | null = null;
let timelineStart = 0;
let timelineLength = 1200;
let visibleEntries: readonly Readonly<LogEntry>[] = [];
let emptyLog: HTMLElement | null = null;

const copy = (key: CopyKey) => COPY[getLocale()][key];
const ms = (value: number) => `${Math.round(value)} ms`;
const setText = (element: HTMLElement, text: string) => {
  if (element.textContent !== text) element.textContent = text;
};

const slots = SLOTS.map((slot, index) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "swap-slot";
  button.style.setProperty("--slot-color", ["#e87248", "#279dbc", "#8d78d9"][index]);
  button.setAttribute("aria-keyshortcuts", String(slot));
  const name = document.createElement("strong");
  const status = document.createElement("span");
  const cooldown = document.createElement("span");
  const fill = document.createElement("progress");
  fill.max = 1;
  fill.setAttribute("aria-hidden", "true");
  button.append(name, status, cooldown, fill);
  button.addEventListener("click", () => act(() => machine.inputSwitch(slot)));
  node("swap-slots").append(button);
  return { slot, button, name, status, cooldown, fill };
});

const mainFields = new Set<NumericParam>(["holsterMs", "drawMs", "bufferTtlMs"]);
const ranges = (Object.keys(LIMITS) as NumericParam[]).map(key => {
  const label = document.createElement("label");
  label.className = "swap-field";
  const caption = document.createElement("span");
  caption.id = `swap-label-${key}`;
  caption.dataset.copy = key;
  const output = document.createElement("output");
  output.setAttribute("aria-live", "off");
  const input = document.createElement("input");
  input.type = "range";
  input.step = "1";
  input.id = `swap-${key}`;
  input.setAttribute("aria-labelledby", caption.id);
  input.addEventListener("input", () => edit(key, input.valueAsNumber));
  label.append(caption, output, input);
  node(mainFields.has(key) ? "swap-main-fields" : "swap-advanced-fields").append(label);
  return { key, output, input };
});

function renderSettings() {
  for (const { key, output, input } of ranges) {
    const { min, max } = mineFieldBounds(mine, key);
    input.min = String(min);
    input.max = String(max);
    input.value = String(mine[key]);
    input.setAttribute("aria-valuetext", ms(mine[key]));
    output.value = ms(mine[key]);
  }
  for (const select of optionFields) {
    const key = select.dataset.option;
    if (key === "busyKind" || key === "busyPolicy") select.value = mine[key];
  }
  for (const button of modeButtons) button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  const url = buildShareUrl(location.href, mine, mode);
  if (shareInput.value !== url) shareInput.value = url;
  shareLink.href = url;
}

function renderLog(retranslate = false) {
  const entries = machine.log;
  if (retranslate || entries.length === 0) {
    if (visibleEntries.length || retranslate) {
      log.replaceChildren();
      visibleEntries = [];
      emptyLog = null;
    }
    if (entries.length === 0 && !emptyLog) {
      emptyLog = document.createElement("p");
      emptyLog.textContent = copy("empty");
      log.append(emptyLog);
    }
  }
  if (entries.length === 0 || entries.at(-1) === visibleEntries.at(-1)) return;

  emptyLog?.remove();
  emptyLog = null;
  const follow = log.scrollHeight - log.scrollTop - log.clientHeight < 12;
  const firstRetained = visibleEntries.indexOf(entries[0]);
  const removed = firstRetained === -1 ? visibleEntries.length : firstRetained;
  for (let index = 0; index < removed; index++) log.firstElementChild?.remove();

  const newest = visibleEntries.at(-1);
  const skip = newest ? entries.indexOf(newest) + 1 : 0;
  for (const entry of entries.slice(skip)) {
    const row = document.createElement("p");
    const time = document.createElement("time");
    time.dateTime = `PT${(entry.time / 1000).toFixed(3)}S`;
    time.textContent = ms(entry.time);
    const slot = copy("slot").replace("{n}", String(entry.slot));
    row.append(time, `${copy(entry.outcome)} · ${slot} · ${copy(entry.reason)}`);
    log.append(row);
  }
  visibleEntries = [...entries];
  if (follow || retranslate) log.scrollTop = log.scrollHeight;
}

function renderTimeline(phase: Readonly<Phase>) {
  const now = machine.now;
  const end = Math.max(timelineStart + timelineLength, now + 40);
  const position = (time: number) => 100 * (time - timelineStart) / (end - timelineStart);
  const fragments = document.createDocumentFragment();
  function bar(className: string, start: number, finish: number, kind?: Phase["kind"], projected = false) {
    if (finish < timelineStart || start > end) return;
    const segment = document.createElement("div");
    segment.className = className;
    const left = position(Math.max(start, timelineStart));
    segment.style.left = `${left}%`;
    segment.style.width = `${Math.max(0, position(Math.min(finish, end)) - left)}%`;
    if (kind) segment.dataset.phase = kind;
    if (projected) segment.dataset.projected = "true";
    fragments.append(segment);
  }
  function segment(item: Readonly<Phase>, finish: number, projected = false) {
    bar("swap-segment", item.start, finish, item.kind, projected);
    if (item.kind === "busy" && item.opens <= finish) {
      bar("swap-window", item.opens, Math.min(finish, item.closes));
    }
  }
  for (const entry of machine.history) segment(entry.phase, entry.end);
  const plannedEnd = phase.kind === "idle" ? now : phase.end;
  if (plannedEnd > now) bar("swap-segment", phase.start, plannedEnd, phase.kind, true);
  segment(phase, now);
  if (phase.kind === "busy" && phase.opens > now) bar("swap-window", phase.opens, phase.closes);
  else if (phase.kind === "busy" && phase.closes > now) bar("swap-window", now, phase.closes);
  const head = document.createElement("div");
  head.className = "swap-head";
  head.style.left = `${position(now)}%`;
  fragments.append(head);
  track.replaceChildren(fragments);
  setText(node("swap-time-start"), ms(timelineStart));
  setText(node("swap-time-now"), ms(now));
  setText(node("swap-time-end"), ms(end));
}

function renderDemo() {
  const phase = machine.phase;
  const target = phase.kind === "holster" || phase.kind === "draw" ? phase.target : null;
  for (const { slot, button, name, status, cooldown, fill } of slots) {
    const equipped = slot === machine.equipped;
    const pending = slot === machine.pending?.slot;
    const timer = machine.cooldown(slot);
    button.dataset.equipped = String(equipped);
    button.dataset.next = String(pending || slot === target);
    setText(name, copy("slot").replace("{n}", String(slot)));
    setText(status, copy(pending ? "pending" : slot === target ? "target" : equipped ? "equipped" : "stowed"));
    setText(cooldown, timer.remaining > 0 ? `${copy("cooldown")} · ${ms(timer.remaining)}` : copy("ready"));
    fill.value = timer.duration > 0 ? timer.remaining / timer.duration : 0;
  }
  const visual = phase.kind === "busy" ? copy(phase.visual === "fire" ? "recovery" : "reload") : null;
  setText(phaseLabel, visual ? `${copy("busy")} · ${visual}` : copy(phase.kind));
  busyBar.hidden = phase.kind !== "busy" || phase.visual !== "reload";
  if (phase.kind === "busy") {
    busyBar.value = (machine.now - phase.start) / Math.max(1, phase.end - phase.start);
    busyBar.setAttribute("aria-label", copy("reload"));
  }
  renderTimeline(phase);
  renderLog();
}

function tick() {
  const now = performance.now();
  if (lastTime !== null) machine.advance(Math.max(0, now - lastTime));
  lastTime = now;
}

function animate() {
  frame = 0;
  tick();
  renderDemo();
  schedule();
}

function schedule() {
  const active = machine.phase.kind !== "idle" || SLOTS.some(slot => machine.cooldown(slot).remaining > 0);
  if (active && !frame) frame = requestAnimationFrame(animate);
  if (!active) lastTime = null;
}

function act(action: () => unknown) {
  tick();
  const idle = machine.phase.kind === "idle";
  const historyEnd = machine.history.at(-1);
  action();
  if (idle && machine.history.at(-1) !== historyEnd) {
    // Keep the previous completed sequence until the next action starts.
    timelineStart = Math.max(0, machine.now - 70);
    const p = activeParams();
    timelineLength = Math.max(1200, 110 + p.busyMs + p.holsterMs + p.drawMs);
  }
  renderDemo();
  schedule();
}

function applySettings() {
  tick();
  machine.configure(activeParams());
  renderSettings();
  renderDemo();
  schedule();
}

function edit(...field: MineFieldEdit) {
  mine = editMineField(mine, ...field);
  mode = "mine";
  try {
    localStorage.setItem(storageKey, JSON.stringify(mine));
  } catch {
    // The in-memory tune remains available when browser storage is unavailable.
  }
  applySettings();
}

function translate() {
  document.title = `${copy("title")} — PixJuice`;
  for (const element of document.querySelectorAll<HTMLElement>("[data-copy]")) {
    setText(element, copy(element.dataset.copy as CopyKey));
  }
  renderLog(true);
  renderDemo();
}

for (const button of modeButtons) button.addEventListener("click", () => {
  const selected = button.dataset.mode;
  if (selected !== "default" && selected !== "mine") return;
  mode = selected;
  applySettings();
});
for (const select of optionFields) select.addEventListener("change", () => {
  const { value } = select;
  if (select.dataset.option === "busyKind" && (value === "fire" || value === "reload")) edit("busyKind", value);
  if (select.dataset.option === "busyPolicy" && (value === "interrupt" || value === "buffer")) edit("busyPolicy", value);
});
node("swap-fire").addEventListener("click", () => act(() => machine.inputFire()));
node("lab-reset").addEventListener("click", () => {
  cancelAnimationFrame(frame);
  frame = 0;
  lastTime = null;
  timelineStart = 0;
  timelineLength = 1200;
  machine.resetDemo();
  renderDemo();
});
document.addEventListener("keydown", event => {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
  const slot = SLOTS.find(value => String(value) === event.key);
  if (slot) {
    event.preventDefault();
    act(() => machine.inputSwitch(slot));
  } else if (event.key.toLowerCase() === "f") {
    event.preventDefault();
    act(() => machine.inputFire());
  }
});
node("swap-export").addEventListener("click", () => {
  const blob = new Blob([exportJson(activeParams(), mode)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = exportFilename(mode);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
});
shareButton.addEventListener("click", () => {
  sharePanel.hidden = !sharePanel.hidden;
  shareButton.setAttribute("aria-expanded", String(!sharePanel.hidden));
  if (!sharePanel.hidden) {
    shareInput.focus();
    shareInput.select();
  }
});

onLocaleChange(translate);
renderSettings();
translate();
