import "../style.css";
import "./reload.css";
import { syncHeaderOffset } from "../lib/header-offset";
import { getLocale, mountLangSwitcher, onLocaleChange } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { exportJson } from "../lib/reload/export";
import { createReloadMachine } from "../lib/reload/machine";
import { DEFAULTS, NUMBER_FIELDS, editLabField, mineFieldBounds, paramsForMode } from "../lib/reload/params";
import { SHARE_PARAM, buildShareUrl, initializeLabState } from "../lib/reload/share";
import { STRINGS, type ReloadString } from "../lib/reload/strings";
import type { Command, Mode, ReloadParams } from "../lib/reload/types";

function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

mountToolsMenu();
mountLangSwitcher();
syncHeaderOffset();

const storageKey = "pixjuice-reload-mine-v1";
function readMine(): unknown {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? "null");
  } catch {
    return null;
  }
}

const token = new URL(location.href).searchParams.get(SHARE_PARAM);
let state = initializeLabState({ token, storedMine: readMine() });
const activeParams = () => paramsForMode(state.mine, DEFAULTS, state.mode);
let machine = createReloadMachine(activeParams());
let frame: number | undefined;
let lastTick = 0;
let copy = STRINGS[getLocale()];
let number = new Intl.NumberFormat(getLocale());
const ms = (time: number) => number.format(Math.floor(time)) + " " + copy.ms;

const controls = byId("reload-controls");
const keep = byId<HTMLInputElement>("reload-keep");
const defaultButton = byId("reload-default");
const mineButton = byId("reload-mine");
const chamberBox = byId("reload-chamber-box");
const chamberCell = byId("reload-chamber-cell");
const magCount = byId("reload-mag-count");
const reserveCount = byId("reload-reserve");
const chamberCount = byId("reload-chamber");
const cells = byId("reload-cells");
const track = document.querySelector<HTMLElement>(".reload-track")!;
const clock = byId("reload-clock");
const phaseDisplay = byId("reload-phase");
const log = byId("reload-log");
const noEvents = byId("reload-no-events");
const download = byId<HTMLAnchorElement>("reload-download");
const share = byId<HTMLAnchorElement>("reload-share");

const sliders = NUMBER_FIELDS.map(key => {
  const label = document.createElement("label");
  const name = document.createElement("span");
  const value = document.createElement("span");
  value.setAttribute("aria-hidden", "true");
  const input = document.createElement("input");
  input.type = "range";
  input.step = "1";
  input.addEventListener("input", () => edit(key, input.valueAsNumber));
  label.append(name, value, input);
  controls.insertBefore(label, keep.parentElement);
  return { key, name, value, input };
});

function renderRecipe() {
  const params = activeParams();
  const bounds = mineFieldBounds(state.mine);
  defaultButton.setAttribute("aria-pressed", String(state.mode === "default"));
  mineButton.setAttribute("aria-pressed", String(state.mode === "mine"));
  for (const { key, input, value, name } of sliders) {
    const [min, max] = bounds[key];
    input.min = String(min);
    input.max = String(max);
    input.value = String(state.mine[key]);
    value.textContent = key.endsWith("Ms") ? ms(state.mine[key]) : number.format(state.mine[key]);
    input.setAttribute("aria-valuetext", value.textContent);
    name.textContent = copy[key];
  }
  keep.checked = state.mine.keepChamberRound;
  chamberBox.hidden = !params.keepChamberRound;
  cells.replaceChildren(...Array.from({ length: params.magCapacity }, () => {
    const cell = document.createElement("span");
    cell.className = "reload-cell";
    return cell;
  }));
  track.style.setProperty("--out", params.magOutMs / params.finishMs * 100 + "%");
  track.style.setProperty("--attach", params.commitMs / params.finishMs * 100 + "%");
  byId("reload-out-range").textContent = number.format(0) + "–" + ms(params.magOutMs);
  byId("reload-attach-range").textContent = number.format(params.magOutMs) + "–" + ms(params.commitMs);
  byId("reload-finish-range").textContent = number.format(params.commitMs) + "–" + ms(params.finishMs);
  byId("reload-marker-time").textContent = ms(params.commitMs);
  download.href = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportJson(params, state.mode), null, 2));
  share.href = buildShareUrl(location.href, state.mine, state.mode);
}

function renderStatus() {
  const snapshot = machine.snapshot();
  phaseDisplay.textContent = copy[snapshot.phase];
  magCount.textContent = snapshot.hasMagazine
    ? number.format(snapshot.mag) + " / " + number.format(activeParams().magCapacity)
    : copy.absent;
  cells.classList.toggle("is-absent", !snapshot.hasMagazine);
  for (const [index, cell] of Array.from(cells.children).entries()) {
    cell.classList.toggle("is-filled", index < snapshot.mag);
  }
  reserveCount.textContent = number.format(snapshot.reserve);
  chamberCount.textContent = number.format(snapshot.chamber) + " / " + number.format(1);
  chamberCell.classList.toggle("is-filled", snapshot.chamber === 1);

  noEvents.hidden = snapshot.log.length > 0;
  log.replaceChildren(...snapshot.log.reverse().map(entry => {
    const li = document.createElement("li");
    const time = document.createElement("span");
    time.className = "reload-log-time";
    time.textContent = ms(entry.timeMs);
    const detail = document.createElement("span");
    const ammo = document.createElement("small");
    const counts = [copy.magazine + " " + number.format(entry.mag), copy.reserve + " " + number.format(entry.reserve)];
    if (activeParams().keepChamberRound) counts.push(copy.chamber + " " + number.format(entry.chamber));
    ammo.textContent = counts.join(" · ");
    const received = entry.event === "reload" || entry.event === "fire" || entry.event === "cancel";
    detail.append(received ? copy.received + " · " + copy[entry.event] : copy[entry.event], ammo);
    li.append(time, detail);
    return li;
  }));
}

function renderPlayhead() {
  const timeMs = machine.timeMs;
  track.style.setProperty("--now", timeMs / activeParams().finishMs * 100 + "%");
  clock.textContent = ms(timeMs);
}

function advanceTo(now: number) {
  const previousPhase = machine.phase;
  machine.advance(now - lastTick);
  lastTick = now;
  if (machine.phase !== previousPhase) renderStatus();
  renderPlayhead();
}

function animate() {
  frame = undefined;
  advanceTo(performance.now());
  if (machine.phase !== "idle") frame = requestAnimationFrame(animate);
}

function command(kind: Command) {
  const now = performance.now();
  if (machine.phase !== "idle") advanceTo(now);
  machine.input(kind);
  renderStatus();
  renderPlayhead();
  lastTick = now;
  if (machine.phase !== "idle" && frame === undefined) frame = requestAnimationFrame(animate);
}

function resetDemo() {
  if (frame !== undefined) cancelAnimationFrame(frame);
  frame = undefined;
  machine.resetDemo();
  renderStatus();
  renderPlayhead();
}

function applyRecipe() {
  machine = createReloadMachine(activeParams());
  renderRecipe();
  resetDemo();
}

function edit(key: keyof ReloadParams, value: unknown) {
  state = editLabField(state, key, value);
  try {
    localStorage.setItem(storageKey, JSON.stringify(state.mine));
  } catch {
    // The tune still works for the duration of this tab.
  }
  applyRecipe();
}

function setMode(mode: Mode) {
  if (state.mode === mode) return;
  state = { ...state, mode };
  applyRecipe();
}

function localize() {
  copy = STRINGS[getLocale()];
  number = new Intl.NumberFormat(getLocale());
  for (const item of document.querySelectorAll<HTMLElement>("[data-reload]")) {
    item.textContent = copy[item.dataset.reload as ReloadString];
  }
  document.title = copy.title + " — PixJuice";
  renderRecipe();
  renderStatus();
  renderPlayhead();
}

defaultButton.addEventListener("click", () => setMode("default"));
mineButton.addEventListener("click", () => setMode("mine"));
keep.addEventListener("change", () => edit("keepChamberRound", keep.checked));
byId("reload-reset").addEventListener("click", resetDemo);
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-command]")) {
  button.addEventListener("click", () => command(button.dataset.command as Command));
}
const keys: Record<string, Command | undefined> = { f: "fire", r: "reload", c: "cancel", escape: "cancel" };
document.addEventListener("keydown", event => {
  if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey
    || (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]"))) return;
  const kind = keys[event.key.toLowerCase()];
  if (!kind) return;
  event.preventDefault();
  command(kind);
});

onLocaleChange(localize);
localize();
