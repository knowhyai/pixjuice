import "../style.css";
import "../templates/templates.css";
import "./feel.css";
import "./feel-jump.css";
import { applyStaticText, mountLangSwitcher, onLocaleChange, t } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { syncHeaderOffset } from "../lib/header-offset";
import { buildShareUrl } from "../feel/share";
import { godotJump, jumpJson } from "../feel/jump-codegen";
import {
  JUMP_LIMITS, JumpClock, JumpControls, JumpRoom, JumpTrial, ROOM,
  jumpParamsForMode, readJumpTune, serializeJumpTune, type JumpAction, type JumpMode, type JumpParams, type JumpTrialKind,
} from "../feel/jump";

mountToolsMenu();
mountLangSwitcher();

const room = new JumpRoom();
const clock = new JumpClock();
const controls = new JumpControls();
const canvas = document.querySelector<HTMLCanvasElement>("#jump-room")!;
const ctx = canvas.getContext("2d")!;
const code = document.querySelector<HTMLElement>("#jump-code")!;
const result = document.querySelector<HTMLElement>("#jump-result")!;
const since = document.querySelector<HTMLElement>("#jump-since")!;
const coyote = document.querySelector<HTMLElement>("#jump-coyote-left")!;
const buffer = document.querySelector<HTMLElement>("#jump-buffer-left")!;
const shareLink = document.querySelector<HTMLInputElement>("#jump-share-link")!;
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-jump-hold]"));
const modes = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-jump-mode]"));
const tune = readJumpTune(location.search);
let mode: JumpMode = "mine";
let trial: JumpTrial | null = null;
let previousFrame: number | null = null;

function activeParams(): JumpParams {
  return jumpParamsForMode(tune, mode);
}

function updateText(node: HTMLElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function updateHUD(): void {
  const ms = (seconds: number) => `${Math.round(seconds * 1000)} ms`;
  updateText(since, room.sinceEdge === null ? "—" : ms(room.sinceEdge));
  updateText(coyote, ms(room.coyote));
  updateText(buffer, ms(room.buffer));
  updateText(result, t(`jump.result.${room.result}`));
  for (const button of buttons) {
    const held = String(controls.has(button.dataset.jumpHold as JumpAction));
    if (button.dataset.held !== held) button.dataset.held = held;
  }
}

function paint(): void {
  ctx.fillStyle = "#151726";
  ctx.fillRect(0, 0, ROOM.width, ROOM.height);
  ctx.fillStyle = "#252a41";
  for (let x = 16; x < ROOM.width; x += 16) {
    for (let y = 16; y < ROOM.floor; y += 16) ctx.fillRect(x, y, 1, 1);
  }
  const ledge = ROOM.ledge;
  ctx.fillStyle = "#313754";
  ctx.fillRect(0, ROOM.floor, ROOM.width, ROOM.height - ROOM.floor);
  ctx.fillRect(ledge.left, ledge.y, ledge.right - ledge.left, 14);
  ctx.fillStyle = "#81dcc2";
  ctx.fillRect(0, ROOM.floor, ROOM.width, 3);
  ctx.fillRect(ledge.left, ledge.y, ledge.right - ledge.left, 3);
  ctx.fillStyle = "#ffcf70";
  ctx.fillRect(ledge.right - 3, ledge.y, 3, 14);
  if (room.coyote > 0) {
    for (let y = ledge.y + 9; y < ROOM.floor; y += 11) ctx.fillRect(ledge.right, y, 1, 5);
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

function reset(kind?: JumpTrialKind): void {
  controls.clear();
  clock.reset();
  previousFrame = null;
  room.reset(kind === "landing");
  trial = kind ? new JumpTrial(kind) : null;
  paint();
  updateHUD();
}

function setMode(next: typeof mode): void {
  mode = next;
  for (const button of modes) {
    button.setAttribute("aria-pressed", String(button.dataset.jumpMode === mode));
  }
  updateText(code, godotJump(activeParams()));
  shareLink.hidden = true;
  reset();
}

for (const button of modes) {
  button.addEventListener("click", () => setMode(button.dataset.jumpMode as typeof mode));
}

for (const input of document.querySelectorAll<HTMLInputElement>("[data-jump-param]")) {
  if (input.type === "checkbox") {
    const key = input.dataset.jumpParam as "coyoteEnabled" | "bufferEnabled" | "variableHeight";
    input.checked = tune[key];
    input.addEventListener("change", () => {
      tune[key] = input.checked;
      setMode("mine");
    });
  } else {
    const key = input.dataset.jumpParam as keyof typeof JUMP_LIMITS;
    const [min, max, step] = JUMP_LIMITS[key];
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.required = true;
    input.value = String(tune[key]);
    input.addEventListener("change", () => {
      if (input.validity.valid) {
        tune[key] = input.valueAsNumber;
        setMode("mine");
      }
      input.value = String(tune[key]);
    });
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-jump-trial]")) {
  button.addEventListener("click", () => {
    reset(button.dataset.jumpTrial as JumpTrialKind);
    canvas.focus({ preventScroll: true });
  });
}
document.querySelector("#jump-reset")!.addEventListener("click", () => {
  reset();
  canvas.focus({ preventScroll: true });
});

const keys = new Map<string, JumpAction>([
  ["ArrowLeft", "left"], ["KeyA", "left"], ["ArrowRight", "right"], ["KeyD", "right"],
  ["Space", "jump"], ["ArrowUp", "jump"],
]);

function down(source: string, action: JumpAction): void {
  trial = null;
  controls.down(source, action);
}

canvas.addEventListener("keydown", (event) => {
  const action = keys.get(event.code);
  if (!action || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  if (!event.repeat) down(event.code, action);
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
  const action = button.dataset.jumpHold as JumpAction;
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    down(`pointer:${event.pointerId}`, action);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    button.addEventListener(type, (event) => controls.up(`pointer:${event.pointerId}`));
  }
  button.addEventListener("click", (event) => {
    // Native keyboard and assistive activation queues one tap for the next tick.
    if (event.detail !== 0) return;
    trial = null;
    controls.tap(action);
  });
}

function download(name: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.querySelector("#jump-json")!.addEventListener("click", () => {
  download("jump-tune.json", jumpJson(activeParams()), "application/json");
});
document.querySelector("#jump-godot")!.addEventListener("click", () => {
  download("jump_forgiveness.gd", godotJump(activeParams()), "text/plain");
});
document.querySelector("#jump-share")!.addEventListener("click", async () => {
  const { origin, pathname, search, hash } = location;
  const url = buildShareUrl(origin, pathname, search, hash, serializeJumpTune(tune));
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    shareLink.hidden = false;
    shareLink.value = url;
    shareLink.select();
  }
  if (shareLink.hidden) {
    const button = document.querySelector<HTMLElement>("#jump-share")!;
    button.textContent = t("feel.shareDone");
    setTimeout(() => { button.textContent = t("feel.share"); }, 1400);
  }
});

function localize(): void {
  applyStaticText(document);
  document.title = `${t("jump.h1")} – PixJuice`;
  updateHUD();
}

function frame(now: number): void {
  const dt = previousFrame === null ? 0 : (now - previousFrame) / 1000;
  previousFrame = now;
  const params = activeParams();
  clock.advance(dt, () => {
    room.step(params, trial?.input(room, params) ?? controls.sample());
    if (trial?.done) trial = null;
  });
  paint();
  updateHUD();
  requestAnimationFrame(frame);
}

setMode("mine");
localize();
onLocaleChange(localize);
syncHeaderOffset();
requestAnimationFrame(frame);
