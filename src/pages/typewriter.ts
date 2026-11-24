import "../style.css";
import "./typewriter.css";
import { syncHeaderOffset } from "../lib/header-offset";
import { getLocale, mountLangSwitcher, onLocaleChange } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { exportJson } from "../lib/typewriter/export";
import { checkText, INPUT_CAPS, visibleText } from "../lib/typewriter/graphemes";
import { LIMITS, PARAM_KEYS, paramsForMode, STARTER, updateParam, type Configuration, type Mode } from "../lib/typewriter/params";
import { IDLE, motionIsReduced, playback, previewElapsed, type Action, type Playback } from "../lib/typewriter/playback";
import { buildShareUrl, parseConfiguration, resolveIncomingShare, serialize, SHARE_CAPS, SHARE_PARAM } from "../lib/typewriter/share";
import { STRINGS, type CopyKey } from "../lib/typewriter/strings";
import { PUNCTUATION, revealTimes, visibleIndex } from "../lib/typewriter/timing";

function element<T extends HTMLElement>(selector: string, type: { new(): T }): T {
  const found = document.querySelector(selector);
  if (!(found instanceof type)) throw new Error("Missing Typewriter Lab control: " + selector);
  return found;
}

function readLocal(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}

function writeLocal(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* The current session remains usable. */ }
}

mountToolsMenu();
mountLangSwitcher();
syncHeaderOffset();

const tuneKey = "pixjuice-typewriter-tune";
const motionKey = "pixjuice-typewriter-motion";
const incomingShare = resolveIncomingShare(new URL(location.href));
if (incomingShare.cleanedUrl) history.replaceState(history.state, "", incomingShare.cleanedUrl);
let config: Configuration = incomingShare.config ?? parseConfiguration(readLocal(tuneKey)) ?? { mode: "mine", mine: STARTER };
let shareNotice: "oversizedShare" | null = null;
let inputNotice: CopyKey | null = null;
let state: Playback = IDLE;
let frame: number | null = null;
const supported = checkText("").kind === "complete";

const dialogue = element("#tw-input", HTMLTextAreaElement);
const motion = element("#tw-motion", HTMLSelectElement);
const preference = readLocal(motionKey);
motion.value = preference === "on" || preference === "off" ? preference : "auto";
const media = matchMedia("(prefers-reduced-motion: reduce)");
const reduced = () => motionIsReduced(motion.value, media.matches);

const status = element("#tw-status", HTMLElement);
const inputStatus = element("#tw-input-status", HTMLElement);
const shareStatus = element("#tw-share-status", HTMLElement);
const shareResult = element("#tw-share-result", HTMLElement);
const shareInput = element("#tw-share-url", HTMLInputElement);
const shareOpen = element("#tw-share-open", HTMLAnchorElement);
const shareButton = element("#tw-share", HTMLButtonElement);
const downloadButton = element("#tw-json", HTMLButtonElement);
const buttons = {
  start: element("#tw-start", HTMLButtonElement), pause: element("#tw-pause", HTMLButtonElement),
  resume: element("#tw-resume", HTMLButtonElement), skip: element("#tw-skip", HTMLButtonElement),
  reset: element("#tw-reset", HTMLButtonElement),
};
const modes: readonly Mode[] = ["default", "mine"];
type Preview = {
  mode: Mode;
  select: HTMLButtonElement;
  view: HTMLElement;
  count: HTMLElement;
  clusters: readonly string[];
  times: readonly number[];
  visible: number;
};
const previews = modes.map<Preview>(mode => ({
  mode,
  select: element("#tw-" + mode, HTMLButtonElement),
  view: element("#tw-" + mode + "-text", HTMLElement),
  count: element("#tw-" + mode + "-count", HTMLElement),
  clusters: [],
  times: [],
  visible: -1,
}));

const controls = PARAM_KEYS.map(key => {
  const input = element("#tw-" + key, HTMLInputElement);
  const output = element("#tw-" + key + "-value", HTMLOutputElement);
  const [min, max, step] = LIMITS[key];
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.disabled = !supported;
  input.addEventListener("input", () => {
    save({ mode: "mine", mine: updateParam(config.mine, key, input.valueAsNumber) });
    refreshPreviews();
  });
  return { key, input, output };
});

function copy(key: CopyKey): string {
  return STRINGS[getLocale()][key];
}

function renderNotices(): void {
  inputStatus.textContent = inputNotice ? copy(inputNotice) : "";
  inputStatus.hidden = !inputNotice;
  const notices: string[] = [];
  if (incomingShare.notice) notices.push(copy(incomingShare.notice));
  if (shareNotice) notices.push(copy(shareNotice));
  shareStatus.textContent = notices.join(" ");
  shareStatus.hidden = notices.length === 0;
}

function renderControls(): void {
  const number = new Intl.NumberFormat(getLocale());
  for (const { mode, select } of previews) select.setAttribute("aria-pressed", String(config.mode === mode));
  for (const { key, input, output } of controls) {
    const value = config.mine.params[key];
    const formatted = number.format(value);
    input.value = String(value);
    output.value = key === "speed" ? copy("speedUnit").replace("{value}", formatted) : formatted + " ms";
    input.setAttribute("aria-valuetext", output.value);
  }
}

function renderStatus(): void {
  const next = copy(!supported ? "unsupported" : reduced() ? "reduced" : state.kind);
  if (status.textContent !== next) status.textContent = next;
  buttons.start.disabled = !supported || (!reduced() && state.kind !== "idle");
  buttons.pause.disabled = !supported || reduced() || state.kind !== "playing";
  buttons.resume.disabled = !supported || reduced() || state.kind !== "paused";
  buttons.skip.disabled = !supported || reduced() || state.kind === "done";
  buttons.reset.disabled = !supported;
}

function renderPreviews(now: number): void {
  const elapsed = previewElapsed(state, now, reduced());
  for (const preview of previews) {
    const index = visibleIndex(preview.times, elapsed);
    if (index === preview.visible) continue;
    const { view } = preview;
    const follow = state.kind === "playing" && view.scrollHeight - view.clientHeight - view.scrollTop <= 2;
    preview.visible = index;
    view.textContent = supported
      ? visibleText(preview.clusters, index)
      : paramsForMode(config.mine, preview.mode).text;
    if (follow) view.scrollTop = view.scrollHeight;
    preview.count.textContent = supported ? index + " / " + preview.clusters.length : "";
  }
}

function run(action: Action, now = performance.now()): void {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
  const duration = Math.max(...previews.map(({ times }) => times.at(-1) ?? 0));
  const previous = state;
  state = playback(state, action, now, duration, reduced());
  renderPreviews(now);
  if (action !== "tick" || state !== previous) renderStatus();
  if (state.kind === "playing") frame = requestAnimationFrame(time => {
    frame = null;
    run("tick", time);
  });
}

function refreshPreviews(): void {
  for (const preview of previews) {
    const { params, text } = paramsForMode(config.mine, preview.mode);
    const checked = checkText(text);
    preview.clusters = checked.kind === "complete" ? checked.clusters : [];
    preview.times = revealTimes(preview.clusters, params);
    preview.visible = -1;
    preview.view.scrollTop = 0;
  }
  run("reset");
}

function save(next: Configuration): void {
  config = next;
  writeLocal(tuneKey, serialize(config));
  const url = new URL(location.href);
  if (url.searchParams.has(SHARE_PARAM)) {
    // The incoming link is a snapshot. Refresh after editing should use the saved edits.
    url.searchParams.delete(SHARE_PARAM);
    history.replaceState(history.state, "", url);
  }
  shareResult.hidden = true;
  shareNotice = null;
  renderControls();
  renderNotices();
}

function acceptDialogue(): void {
  const text = dialogue.value;
  if (text === config.mine.text) return;
  if (checkText(text).kind !== "complete") {
    dialogue.value = config.mine.text;
    inputNotice = "rejected";
    renderNotices();
    return;
  }
  inputNotice = null;
  save({ mode: "mine", mine: { ...config.mine, text } });
  refreshPreviews();
}

dialogue.value = config.mine.text;
dialogue.disabled = !supported;
shareButton.disabled = !supported;
downloadButton.disabled = !supported;
dialogue.addEventListener("input", event => {
  if (!(event instanceof InputEvent) || !event.isComposing) acceptDialogue();
});
dialogue.addEventListener("compositionend", acceptDialogue);
for (const preview of previews) {
  preview.select.disabled = !supported;
  preview.select.addEventListener("click", () => save({ ...config, mode: preview.mode }));
}
for (const action of ["start", "pause", "resume", "skip", "reset"] as const) {
  buttons[action].addEventListener("click", () => run(action));
}

let wasReduced = reduced();
function motionChanged(): void {
  if (reduced() === wasReduced) return;
  wasReduced = reduced();
  run("reset");
}
media.addEventListener("change", motionChanged);
motion.addEventListener("change", () => {
  writeLocal(motionKey, motion.value);
  motionChanged();
});

shareButton.addEventListener("click", () => {
  const url = buildShareUrl(location.href, config);
  shareNotice = url ? null : "oversizedShare";
  shareResult.hidden = !url;
  renderNotices();
  if (url) {
    shareInput.value = url;
    shareOpen.href = url;
    shareInput.focus();
    shareInput.select();
  }
});

downloadButton.addEventListener("click", () => {
  const blob = new Blob([exportJson(config, location.href)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pixjuice-typewriter-" + config.mode + ".json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function localize(): void {
  const dictionary = STRINGS[getLocale()];
  document.title = dictionary.title + " — PixJuice";
  const number = new Intl.NumberFormat(getLocale());
  const vars = {
    graphemes: number.format(INPUT_CAPS.graphemes), units: number.format(INPUT_CAPS.utf16Units),
    token: number.format(SHARE_CAPS.tokenChars), url: number.format(SHARE_CAPS.urlChars),
    short: PUNCTUATION.short, sentence: PUNCTUATION.sentence,
  };
  document.querySelectorAll<HTMLElement>("[data-typewriter]").forEach(node => {
    const key = node.dataset.typewriter;
    if (!key) return;
    if (!isCopyKey(key)) return;
    let text = dictionary[key];
    for (const [name, replacement] of Object.entries(vars)) text = text.replaceAll("{" + name + "}", replacement);
    node.textContent = text;
  });
  renderControls();
  renderStatus();
  renderNotices();
}

function isCopyKey(key: string): key is CopyKey {
  return Object.hasOwn(STRINGS.en, key);
}

onLocaleChange(localize);
localize();
refreshPreviews();
