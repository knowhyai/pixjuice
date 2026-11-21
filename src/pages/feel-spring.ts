import "../style.css";
import "../templates/templates.css";
import "./feel.css";
import "./feel-small-lab.css";
import { JumpClock } from "../feel/jump";
import { SpringRoom, SPRING_DEFAULTS, SPRING_LIMITS, type SpringParams } from "../feel/spring";
import { syncHeaderOffset } from "../lib/header-offset";
import { applyStaticText, mountLangSwitcher, onLocaleChange, t } from "../lib/i18n";
import { mountToolsMenu } from "../lib/navmenu";
import { bindSmallLab } from "./feel-small-lab";

mountToolsMenu();
mountLangSwitcher();

const room = new SpringRoom();
const clock = new JumpClock();
const canvas = document.querySelector<HTMLCanvasElement>("#spring-room")!;
const ctx = canvas.getContext("2d")!;
const status = document.querySelector<HTMLElement>("#spring-status")!;
const trigger = document.querySelector<HTMLButtonElement>("#spring-trigger")!;
let previous: number | null = null;

const active = bindSmallLab<SpringParams>({
  prefix: "spring1", defaults: SPRING_DEFAULTS, starter: SPRING_DEFAULTS, limits: SPRING_LIMITS,
  reset: () => {
    room.reset();
    clock.reset();
    previous = null;
    trigger.setAttribute("aria-pressed", "false");
    render();
  },
});

trigger.addEventListener("click", () => {
  room.toggle();
  trigger.setAttribute("aria-pressed", String(room.target === 1));
  render();
});
document.addEventListener("visibilitychange", () => {
  previous = null;
  clock.reset();
});

function render(): void {
  const reading = t(room.settled ? "spring.settled" : "spring.moving", {
    x: room.position.toFixed(2), peak: Math.round(room.peak * 100),
  });
  if (status.textContent !== reading) status.textContent = reading;

  ctx.fillStyle = "#151726";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#313754";
  ctx.fillRect(24, 28, 432, 54);
  ctx.strokeStyle = "#a6b1d0";
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(136 + room.target * 110, 32, 96, 46);
  ctx.setLineDash([]);

  const panelX = 136 + room.position * 110;
  ctx.fillStyle = "#ffcf70";
  ctx.fillRect(panelX, 34, 96, 42);
  ctx.fillStyle = "#45364e";
  ctx.fillRect(panelX + 9, 44, 38, 5);
  ctx.fillRect(panelX + 9, 55, 68, 4);
  ctx.fillRect(panelX + 9, 64, 52, 3);

  const left = 34;
  const span = 414;
  const graphY = (position: number) => 169 - position * 28;
  ctx.fillStyle = "#22273b";
  ctx.fillRect(left, 107, span, 91);
  ctx.strokeStyle = "#a6b1d0";
  ctx.font = "12px monospace";
  for (const value of [0, 1]) {
    const y = graphY(value);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + span, y);
    ctx.stroke();
    ctx.fillStyle = "#a6b1d0";
    ctx.fillText(String(value), 15, y + 4);
  }
  const from = Math.max(0, room.time - 4);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, 107, span, 91);
  ctx.clip();
  ctx.strokeStyle = "#81dcc2";
  ctx.lineWidth = 2;
  ctx.beginPath();
  room.trace.forEach((point, i) => {
    const x = left + (point.time - from) * span / 4;
    if (i === 0) ctx.moveTo(x, graphY(point.position));
    else ctx.lineTo(x, graphY(point.position));
  });
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "#a6b1d0";
  ctx.fillText(`${from.toFixed(1)} s`, left, 216);
  ctx.fillText(`${(from + 4).toFixed(1)} s`, left + span - 42, 216);
}

function localize(): void {
  applyStaticText(document);
  document.title = `${t("spring.h1")} – PixJuice`;
  render();
}

function frame(now: number): void {
  const dt = previous === null ? 0 : (now - previous) / 1000;
  previous = now;
  clock.advance(dt, () => room.step(active()));
  render();
  requestAnimationFrame(frame);
}

localize();
onLocaleChange(localize);
syncHeaderOffset();
requestAnimationFrame(frame);
