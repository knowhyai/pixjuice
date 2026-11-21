import "../style.css";
import "../templates/templates.css";
import "./feel.css";
import "./feel-move.css";
import { JumpClock, JumpControls, type JumpAction } from "../feel/jump";
import {
  MoveRoom, MOVE_LIMITS, TRACK, moveJson, moveParamsForMode, readMoveTune, serializeMoveTune,
  type MoveMode, type MoveParams,
} from "../feel/move";
import { buildShareUrl } from "../feel/share";
import { syncHeaderOffset } from "../lib/header-offset";
import { applyStaticText, mountLangSwitcher, onLocaleChange, t } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";

mountToolsMenu();
mountLangSwitcher();

const room = new MoveRoom();
const clock = new JumpClock();
const controls = new JumpControls();
const canvas = document.querySelector<HTMLCanvasElement>("#move-room")!;
const ctx = canvas.getContext("2d")!;
const buttons = document.querySelectorAll<HTMLButtonElement>("[data-move-action]");
const modes = document.querySelectorAll<HTMLButtonElement>("[data-move-mode]");
const speed = document.querySelector<HTMLElement>("#move-speed")!;
const distance = document.querySelector<HTMLElement>("#move-distance")!;
const surface = document.querySelector<HTMLElement>("#move-surface")!;
const status = document.querySelector<HTMLElement>("#move-status")!;
const code = document.querySelector<HTMLElement>("#move-code")!;
const shareLink = document.querySelector<HTMLInputElement>("#move-share-link")!;
const tune = readMoveTune(location.search);
let mode: MoveMode = "mine";
let previousFrame: number | null = null;

function activeParams(): Readonly<MoveParams> {
  return moveParamsForMode(tune, mode);
}

function text(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function render(): void {
  text(speed, `${Math.round(Math.abs(room.vx))} px/s`);
  text(distance, room.trace ? `${room.stopDistance.toFixed(1)} px` : "—");
  text(surface, t(room.grounded ? "move.ground" : "move.air"));
  text(status, room.trace ? t(`move.${room.trace.status}`) : "");
  for (const button of buttons) {
    const held = String(controls.has(button.dataset.moveAction as JumpAction));
    if (button.dataset.held !== held) button.dataset.held = held;
  }

  ctx.fillStyle = "#151726";
  ctx.fillRect(0, 0, TRACK.width, TRACK.height);
  ctx.fillStyle = "#252a41";
  for (let x = 20; x < TRACK.width; x += 20) {
    for (let y = 10; y < TRACK.floor; y += 20) ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = "#313754";
  ctx.fillRect(0, TRACK.floor, TRACK.width, TRACK.height - TRACK.floor);
  ctx.fillStyle = "#81dcc2";
  ctx.fillRect(0, TRACK.floor, TRACK.width, 2);
  for (let x = 20; x < TRACK.width; x += 20) ctx.fillRect(x, TRACK.floor, 1, 6);
  ctx.fillRect(2, 30, 2, TRACK.floor - 30);
  ctx.fillRect(TRACK.width - 4, 30, 2, TRACK.floor - 30);

  if (room.trace) {
    const start = Math.round(room.trace.start);
    const end = Math.round(room.trace.end);
    ctx.fillStyle = "#ffcf70";
    ctx.fillRect(Math.min(start, end), 168, Math.abs(end - start) + 1, 2);
    ctx.fillRect(start - 1, 163, 3, 13);
    ctx.fillStyle = room.trace.status === "wall" ? "#fc8b8b" : "#fff4cf";
    ctx.fillRect(end - 1, 164, 3, 11);
  }
  const x = Math.round(room.x);
  const y = Math.round(room.y);
  ctx.fillStyle = "#0b0c14";
  ctx.fillRect(x - 9, y - 22, 18, 22);
  ctx.fillStyle = "#ffcf70";
  ctx.fillRect(x - 6, y - 20, 12, 16);
  ctx.fillRect(x - 5, y - 4, 3, 4);
  ctx.fillRect(x + 2, y - 4, 3, 4);
  ctx.fillStyle = "#45364e";
  ctx.fillRect(x - 3, y - 17, 2, 3);
  ctx.fillRect(x + 2, y - 17, 2, 3);
}

function resetRoom(): void {
  room.reset();
  controls.clear();
  clock.reset();
  previousFrame = null;
  render();
}

function updateMode(): void {
  for (const button of modes) {
    button.setAttribute("aria-pressed", String(button.dataset.moveMode === mode));
  }
  text(code, moveJson(activeParams()));
  shareLink.hidden = true;
}

for (const button of modes) {
  button.addEventListener("click", () => {
    mode = button.dataset.moveMode as MoveMode;
    updateMode();
    resetRoom();
  });
}

for (const input of document.querySelectorAll<HTMLInputElement>("[data-move-param]")) {
  const key = input.dataset.moveParam as keyof MoveParams;
  const [min, max, step] = MOVE_LIMITS[key];
  const output = input.closest("label")!.querySelector("output")!;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(tune[key]);
  text(output, input.value);
  input.addEventListener("input", () => {
    if (mode !== "mine") resetRoom();
    tune[key] = input.valueAsNumber;
    mode = "mine";
    text(output, input.value);
    updateMode();
  });
}

document.querySelector("#move-reset")!.addEventListener("click", () => {
  resetRoom();
  canvas.focus({ preventScroll: true });
});

const keys = new Map<string, JumpAction>([
  ["ArrowLeft", "left"], ["KeyA", "left"], ["ArrowRight", "right"], ["KeyD", "right"],
  ["Space", "jump"], ["ArrowUp", "jump"],
]);

canvas.addEventListener("keydown", (event) => {
  const action = keys.get(event.code);
  if (!action || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  if (!event.repeat) controls.down(event.code, action);
});
canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }));
window.addEventListener("keyup", (event) => controls.up(event.code));
canvas.addEventListener("blur", () => controls.clear());
window.addEventListener("blur", () => controls.clear());
document.addEventListener("visibilitychange", () => {
  controls.clear();
  clock.reset();
  previousFrame = null;
});

for (const button of buttons) {
  const action = button.dataset.moveAction as JumpAction;
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    controls.down(`pointer:${event.pointerId}`, action);
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    button.addEventListener(eventName, (event) => controls.up(`pointer:${event.pointerId}`));
  }
  button.addEventListener("click", (event) => {
    if (event.detail === 0) controls.tap(action);
  });
}

document.querySelector("#move-json")!.addEventListener("click", () => {
  const href = URL.createObjectURL(new Blob([moveJson(activeParams())], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = href;
  link.download = "movement-tune.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
});

const shareButton = document.querySelector<HTMLButtonElement>("#move-share")!;
shareButton.addEventListener("click", async () => {
  const { origin, pathname, search, hash } = location;
  const url = buildShareUrl(origin, pathname, search, hash, serializeMoveTune(tune));
  try {
    await navigator.clipboard.writeText(url);
    shareLink.hidden = true;
    text(shareButton, t("feel.shareDone"));
    setTimeout(() => text(shareButton, t("feel.share")), 1400);
  } catch {
    shareLink.value = url;
    shareLink.hidden = false;
    shareLink.select();
  }
});

function localize(): void {
  applyStaticText(document);
  document.title = `${t("move.h1")} – PixJuice`;
  render();
}

function frame(now: number): void {
  const elapsed = previousFrame === null ? 0 : (now - previousFrame) / 1000;
  previousFrame = now;
  const params = activeParams();
  clock.advance(elapsed, () => {
    const { direction, pressed } = controls.sample();
    room.step(params, direction, pressed);
  });
  render();
  requestAnimationFrame(frame);
}

updateMode();
localize();
onLocaleChange(localize);
syncHeaderOffset();
requestAnimationFrame(frame);
