// A live effect on a canvas, at an integer scale that fits the stage.
// Pure effects re-render from t alone; simulated ones step at their own fps, like the upstream gallery.

import {
  createFrame,
  clearFrame,
  createFx,
  createAct,
  composite,
  backdrop,
  painterFor,
  drawActor,
  stockActor,
  actorAlphaOf,
  actBounds,
} from "pixelfx";
import type { ActInstance, FxInstance, FxOptions, Frame } from "pixelfx";
import { type CatalogEntry } from "./catalog";

export interface PlayerStyle {
  /** Palette override (hex ramp) or null to use the effect's own. */
  palette: string[] | null;
  seed: number | null;
  flipH: boolean;
  flipV: boolean;
  /** Rotation in degrees. */
  angle: number;
  /** Glow strength multiplier. */
  light: number;
  backdrop: string;
  actor: boolean;
  speed: number;
  playing: boolean;
  /** Replay one-shots when they finish. */
  replay: boolean;
}

export function defaultStyle(entry: CatalogEntry): PlayerStyle {
  return {
    palette: null,
    seed: null,
    flipH: false,
    flipV: false,
    angle: 0,
    light: 1,
    backdrop: entry.meta.bg ?? "dark",
    actor: true,
    speed: 1,
    playing: true,
    replay: true,
  };
}

/** flipV is mirror + 180° rotation in the painter's terms. */
export function placement(s: PlayerStyle): { flip: boolean; angle: number } {
  return { flip: s.flipH !== s.flipV, angle: (s.angle * Math.PI) / 180 + (s.flipV ? Math.PI : 0) };
}

export class Player {
  readonly canvas: HTMLCanvasElement;
  readonly entry: CatalogEntry;
  readonly ctx: CanvasRenderingContext2D;
  style: PlayerStyle;
  /** Called each time the effect starts over (used to fire the synced SFX). */
  onRestart: (() => void) | null = null;
  /** Called after any rendered tick (used to move the scrubber). */
  onTick: (() => void) | null = null;

  W = 0;
  H = 0;
  x = 0;
  y = 0;
  private frame!: Frame;
  private img!: ImageData;
  private inst!: FxInstance | ActInstance;
  private acc = 0;
  private wait = 0;
  private dirty = true;
  private bgBuf: Uint32Array | null = null;

  constructor(canvas: HTMLCanvasElement, entry: CatalogEntry, aspect: number, pad: number, style: PlayerStyle) {
    this.canvas = canvas;
    this.entry = entry;
    this.ctx = canvas.getContext("2d")!;
    this.style = style;
    this.layout(aspect, pad);
  }

  /** The art-pixel stage: the effect's canvas plus breathing room, stretched to the tile's aspect. */
  layout(aspect: number, pad: number) {
    const meta = this.entry.meta;
    const acted = this.acted;
    const b = acted ? { ...actBounds(this.entry.mod) } : null;
    if (b) b.y1 = Math.min(b.y1, 22); // an act happens above the floor: don't spend the tile on bricks
    const [w, h] = acted && b ? [b.x1 - b.x0, b.y1 - b.y0] : meta.size;
    const [ox, oy] = acted && b ? [-b.x0, -b.y0] : meta.origin;
    const k = acted ? Math.min(pad, 1.1) : pad;
    this.W = Math.ceil(Math.max(w * k, h * k * aspect));
    this.H = Math.ceil(this.W / aspect);
    this.x = Math.floor((this.W - w) / 2) + ox;
    this.y = acted ? Math.max(oy + 2, this.H - b!.y1 - 2) : Math.floor((this.H - h) / 2) + oy;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    // shrinking pixel art nearest-neighbour drops whole 1px lines; smooth only when it has to shrink
    const shown = this.canvas.getBoundingClientRect().width * (window.devicePixelRatio || 1);
    this.canvas.style.imageRendering = shown && shown < this.W ? "auto" : "pixelated";
    this.frame = createFrame(this.W, this.H);
    this.img = this.ctx.createImageData(this.W, this.H);
    this.setBg(this.style.backdrop);
    this.restart();
  }

  setBg(kind: string) {
    this.style.backdrop = kind;
    this.bgBuf = kind === "none" ? null : backdrop(kind, this.W, this.H, this.y);
    this.dirty = true;
  }

  /** An effect with an act plays the whole performance while the character is switched on. */
  get acted(): boolean {
    return !!this.entry.mod.act && this.style.actor;
  }

  restart() {
    const { flip, angle } = placement(this.style);
    const o: FxOptions = {
      x: this.x,
      y: this.y,
      flip,
      angle,
      light: this.style.light,
      ...(this.style.palette ? { palette: this.style.palette } : {}),
      ...(this.style.seed !== null ? { seed: this.style.seed } : {}),
    };
    this.inst = this.acted ? createAct(this.entry.mod, o) : createFx(this.entry.mod, o);
    this.acc = 0;
    this.wait = 0;
    this.dirty = true;
    this.onRestart?.();
  }

  /** Absolute time range the effect can be scrubbed over. */
  span(): { from: number; to: number } {
    const meta = this.entry.meta;
    if (this.acted) {
      const k = this.entry.mod.act?.poses ?? [];
      const from = Math.min(0, k[0]?.[0] ?? 0);
      const to = meta.loop ? meta.duration : Math.max(meta.duration, k[k.length - 1]?.[0] ?? 0);
      return { from, to };
    }
    return { from: 0, to: meta.duration };
  }

  get t(): number {
    return this.inst.t;
  }

  tick(dt: number) {
    const meta = this.entry.meta;
    const step = 1 / (meta.fps ?? 30);
    if (this.style.playing) this.acc = Math.min(this.acc + dt * this.style.speed, 0.25);
    let moved = false;
    while (this.acc >= step) {
      this.acc -= step;
      const over =
        !meta.loop && (this.acted ? (this.inst as ActInstance).done() : (this.inst as FxInstance).t >= meta.duration);
      if (over) {
        this.wait += step;
        if (this.wait > 0.45) {
          if (this.style.replay) this.restart();
          this.wait = 0;
        }
      } else {
        this.inst.update(step);
      }
      moved = true;
    }
    if (moved || this.dirty) {
      this.render();
      this.onTick?.();
    }
  }

  seek(t: number) {
    this.restart(); // restart fires onRestart; silence the SFX when scrubbing
    const onRestart = this.onRestart;
    this.onRestart = null;
    this.inst.update(Math.max(0, t - this.inst.t));
    this.onRestart = onRestart;
    this.render();
    this.onTick?.();
  }

  render() {
    const f = clearFrame(this.frame);
    const meta = this.entry.meta;
    if (this.acted) {
      const act = this.inst as ActInstance;
      act.draw(f);
      composite(f, this.img.data, this.bgBuf);
      const [sx, sy] = act.shake;
      if (sx || sy) this.ctx.clearRect(0, 0, this.W, this.H);
      this.ctx.putImageData(this.img, sx, sy);
      this.dirty = false;
      return;
    }
    const fx = this.inst as FxInstance;
    const { flip } = placement(this.style);
    fx.draw(f, "back");
    const tt = meta.loop ? fx.t % meta.duration : Math.min(fx.t, meta.duration);
    if (meta.actor && this.style.actor)
      drawActor(
        painterFor(f).place(this.x, this.y, flip),
        (fx.options.actor as ReturnType<typeof stockActor>) ?? stockActor(),
        actorAlphaOf(this.entry.mod, tt, fx.options),
      );
    fx.draw(f, "front");
    composite(f, this.img.data, this.bgBuf);
    this.ctx.putImageData(this.img, 0, 0);
    this.dirty = false;
  }

  refresh() {
    // after a style change that needs a new instance (palette, seed, flips, angle)
    this.restart();
  }

  redraw() {
    // after a pure style change (backdrop)
    this.dirty = true;
  }
}
