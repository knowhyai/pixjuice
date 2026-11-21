import "../style.css";
import "../templates/templates.css";
import "./feel.css";
import "./feel-small-lab.css";
import { CameraRoom, CAMERA_DEFAULTS, CAMERA_STARTER, CAMERA_LIMITS, CAMERA_WORLD, type CameraParams } from "../feel/camera";
import { JumpClock, JumpControls } from "../feel/jump";
import { syncHeaderOffset } from "../lib/header-offset";
import { applyStaticText, mountLangSwitcher, onLocaleChange, t } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { bindSmallLab } from "./feel-small-lab";

mountToolsMenu();
mountLangSwitcher();

const room = new CameraRoom();
const input = new JumpControls();
const clock = new JumpClock();
const canvas = document.querySelector<HTMLCanvasElement>("#camera-room")!;
const ctx = canvas.getContext("2d")!;
const status = document.querySelector<HTMLElement>("#camera-status")!;
const buttons = document.querySelectorAll<HTMLButtonElement>("[data-camera-direction]");
let previous: number | null = null;

function reset(): void {
  room.reset();
  input.clear();
  clock.reset();
  previous = null;
}

const active = bindSmallLab<CameraParams>({
  prefix: "camera1", defaults: CAMERA_DEFAULTS, starter: CAMERA_STARTER, limits: CAMERA_LIMITS, reset,
});

const keys = new Map<string, "left" | "right">([
  ["ArrowLeft", "left"], ["KeyA", "left"], ["ArrowRight", "right"], ["KeyD", "right"],
]);

canvas.addEventListener("keydown", (event) => {
  const direction = keys.get(event.code);
  if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  if (!event.repeat) input.down(event.code, direction);
});
canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }));
window.addEventListener("keyup", (event) => input.up(event.code));
canvas.addEventListener("blur", () => input.clear());
window.addEventListener("blur", () => input.clear());
document.addEventListener("visibilitychange", () => {
  input.clear();
  clock.reset();
  previous = null;
});
for (const button of buttons) {
  const direction = button.dataset.cameraDirection as "left" | "right";
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    input.down(`pointer:${event.pointerId}`, direction);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    button.addEventListener(type, (event) => input.up(`pointer:${event.pointerId}`));
  }
  button.addEventListener("click", (event) => { if (event.detail === 0) input.tap(direction); });
}

function render(): void {
  const { view, height, width } = CAMERA_WORLD;
  const { deadzonePx } = active();
  const targetX = room.target - room.left;
  const color = room.atBound ? "#fc8b8b" : "#81dcc2";
  const lag = Math.abs(room.target - room.center);
  const key = room.atBound ? "camera.bound" : deadzonePx > 0 && lag <= deadzonePx ? "camera.inside" : "camera.following";
  const reading = t(key, { n: Math.round(lag) });
  if (status.textContent !== reading) status.textContent = reading;
  for (const button of buttons) {
    const held = String(input.has(button.dataset.cameraDirection as "left" | "right"));
    if (button.dataset.held !== held) button.dataset.held = held;
  }

  ctx.fillStyle = "#151726";
  ctx.fillRect(0, 0, view, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, view, 177);
  ctx.clip();
  ctx.translate(-room.left, 0);
  ctx.fillStyle = "#313754";
  ctx.fillRect(0, 140, width, 37);
  for (let x = 0; x < width; x += 40) {
    ctx.strokeStyle = "#353d5c";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 177);
    ctx.stroke();
    if (x % 160 === 0) {
      ctx.fillStyle = "#a6b1d0";
      ctx.font = "12px monospace";
      ctx.fillText(String(x), x + 4, 156);
    }
  }
  ctx.fillStyle = "#81dcc2";
  ctx.fillRect(0, 139, width, 2);
  ctx.restore();

  ctx.strokeStyle = "#a6b1d0";
  ctx.setLineDash([5, 4]);
  if (deadzonePx > 0) ctx.strokeRect(view / 2 - deadzonePx, 25, deadzonePx * 2, 123);
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffcf70";
  ctx.fillRect(targetX - 7, 115, 14, 24);
  ctx.fillStyle = "#45364e";
  ctx.fillRect(targetX - 3, 119, 2, 3);
  ctx.fillRect(targetX + 2, 119, 2, 3);
  ctx.strokeStyle = color;
  ctx.strokeRect(1, 1, view - 2, 175);

  const scale = (view - 24) / width;
  ctx.fillStyle = "#313754";
  ctx.fillRect(12, 193, view - 24, 20);
  ctx.strokeStyle = color;
  ctx.strokeRect(12 + room.left * scale, 193, view * scale, 20);
  ctx.fillStyle = "#ffcf70";
  ctx.fillRect(10 + room.target * scale, 197, 4, 12);
}

function localize(): void {
  applyStaticText(document);
  document.title = `${t("camera.h1")} – PixJuice`;
  render();
}

function frame(now: number): void {
  const dt = previous === null ? 0 : (now - previous) / 1000;
  previous = now;
  clock.advance(dt, () => room.step(active(), input.sample().direction));
  render();
  requestAnimationFrame(frame);
}

localize();
onLocaleChange(localize);
syncHeaderOffset();
requestAnimationFrame(frame);
