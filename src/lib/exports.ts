// Export pipeline: render an effect's frames offscreen (exactly like upstream tools/render.mjs --sheet),
// then pack them as a transparent PNG sprite sheet + Aseprite-style JSON, a GIF, or a single frame.

import { createFrame, clearFrame, createFx, composite, actTiming } from "pixelfx";
import type { Frame, FxOptions } from "pixelfx";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { frameCount, isScreen, type CatalogEntry } from "./catalog";
import type { PlayerStyle } from "./player";
import { placement } from "./player";

export interface RenderedFrames {
  w: number;
  h: number;
  fps: number;
  n: number;
  /** RGBA over transparency, one per frame. */
  frames: Uint8ClampedArray[];
}

function fxOptionsFor(style: PlayerStyle): FxOptions {
  const { flip, angle } = placement(style);
  return {
    flip,
    angle,
    light: style.light,
    ...(style.palette ? { palette: style.palette } : {}),
    ...(style.seed !== null ? { seed: style.seed } : {}),
  };
}

/** Ease a glow cut off by the canvas edge out over the last E pixels, so it doesn't show as a box in game. */
function edgeFade(f: Frame, E = 8) {
  const { w, h, light: L } = f;
  for (let y = 0; y < h; y++) {
    const ey = Math.min(y, h - 1 - y);
    for (let x = 0; x < w; x++) {
      const e = Math.min(ey, x, w - 1 - x);
      if (e >= E) {
        x = w - 1 - E;
        continue;
      }
      const i = y * w + x;
      const l = L[i];
      if (!(l & 0xffffff)) continue;
      const u = (e + 0.5) / E;
      const k = u * u * (3 - 2 * u);
      L[i] =
        (l & 0xff000000) |
        Math.round((l & 255) * k) |
        (Math.round(((l >>> 8) & 255) * k) << 8) |
        (Math.round(((l >>> 16) & 255) * k) << 16);
    }
  }
}

/** The effect alone on transparency, like upstream renderFrames with margin 0. */
export function renderBareFrames(entry: CatalogEntry, style: PlayerStyle): RenderedFrames {
  const meta = entry.meta;
  const [w, h] = meta.size;
  const [ox, oy] = meta.origin;
  const fps = meta.fps ?? 30;
  const n = frameCount(meta);
  const inst = createFx(entry.mod, { x: ox, y: oy, ...fxOptionsFor(style) });
  const bare = createFrame(w, h);
  const fade = !isScreen(meta);
  const frames: Uint8ClampedArray[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) inst.update(1 / fps);
    clearFrame(bare);
    inst.draw(bare);
    if (fade) edgeFade(bare);
    frames.push(composite(bare, new Uint8ClampedArray(w * h * 4), null) as Uint8ClampedArray);
  }
  return { w, h, fps, n, frames };
}

/** One bare frame at a given effect time (snapped to the frame grid), for the single-frame export. */
export function renderBareFrameAt(entry: CatalogEntry, style: PlayerStyle, t: number): Uint8ClampedArray {
  const meta = entry.meta;
  const [w, h] = meta.size;
  const [ox, oy] = meta.origin;
  const fps = meta.fps ?? 30;
  const n = frameCount(meta);
  const idx = Math.max(0, Math.min(n - 1, Math.round(t * fps)));
  const inst = createFx(entry.mod, { x: ox, y: oy, ...fxOptionsFor(style) });
  const bare = createFrame(w, h);
  for (let i = 0; i < idx; i++) inst.update(1 / fps);
  clearFrame(bare);
  inst.draw(bare);
  if (!isScreen(meta)) edgeFade(bare);
  return composite(bare, new Uint8ClampedArray(w * h * 4), null) as Uint8ClampedArray;
}

/** Aseprite-style JSON sidecar, the same shape as upstream tools/render.mjs --sheet. */
export function sheetJson(
  entry: CatalogEntry,
  r: RenderedFrames,
  imageName: string,
  style: PlayerStyle,
): unknown {
  const { w, h, fps, n, frames } = r;
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt((n * h) / w))));
  const rows = Math.ceil(n / cols);
  const m = entry.meta;
  const tag = entry.id.split("/")[1];
  const json: {
    frames: unknown[];
    meta: Record<string, unknown>;
  } = { frames: [], meta: {} };
  frames.forEach((_, i) => {
    const x = (i % cols) * w;
    const y = Math.floor(i / cols) * h;
    json.frames.push({
      filename: `${tag} ${i}`,
      frame: { x, y, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
      duration: Math.round(1000 / fps),
    });
  });
  const act = entry.mod.act ? actTiming(entry.mod) : null;
  json.meta = {
    app: "https://github.com/patch-gg/pixelfx",
    version: "1",
    image: imageName,
    format: "RGBA8888",
    size: { w: cols * w, h: rows * h },
    scale: "1",
    frameTags: [{ name: tag, from: 0, to: n - 1, direction: "forward" }],
    pixelfx: {
      id: entry.id,
      name: m.name,
      fps,
      loop: !!m.loop,
      frames: n,
      frameSize: [w, h],
      pivot: m.origin,
      columns: cols,
      ...(act ? { act } : {}),
    },
    // what PixJuice had dialed in when the sheet was exported
    pixjuice: {
      app: "PixJuice",
      url: "https://pixjuice.pages.dev",
      category: entry.cat,
      palette: style.palette ?? entry.meta.options?.palette ?? null,
      seed: style.seed ?? entry.meta.options?.seed ?? null,
      flip: style.flipH !== style.flipV,
      angle: style.angle,
    },
  };
  return json;
}

/** Pack rendered frames into a transparent sprite-sheet canvas. */
export function sheetCanvas(r: RenderedFrames): HTMLCanvasElement {
  const { w, h, n, frames } = r;
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt((n * h) / w))));
  const rows = Math.ceil(n / cols);
  const cv = document.createElement("canvas");
  cv.width = cols * w;
  cv.height = rows * h;
  const ctx = cv.getContext("2d")!;
  frames.forEach((f, i) => {
    const img = new ImageData(new Uint8ClampedArray(f), w, h);
    ctx.putImageData(img, (i % cols) * w, Math.floor(i / cols) * h);
  });
  return cv;
}

export function canvasToBlob(cv: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png"),
  );
}

/** Nearest-neighbour upscale, so GIFs stay crisp at 2x/3x (and VIP exports at 4x-8x). */
export function upscale(rgba: Uint8ClampedArray, w: number, h: number, k: number): Uint8ClampedArray {
  if (k === 1) return rgba;
  const out = new Uint8ClampedArray(w * k * h * k * 4);
  const src = new Uint32Array(rgba.buffer, rgba.byteOffset, w * h);
  const dst = new Uint32Array(out.buffer);
  for (let y = 0; y < h * k; y++) {
    const sy = (y / k) | 0;
    for (let x = 0; x < w * k; x++) dst[y * w * k + x] = src[sy * w + ((x / k) | 0)];
  }
  return out;
}

/**
 * Animated GIF with transparency. One local color table per frame (pixel-art ramps differ frame to frame),
 * snapped to 1-bit alpha the way the format works.
 */
export async function buildGif(
  r: RenderedFrames,
  scale = 2,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const { w, h, fps, n, frames } = r;
  const gif = GIFEncoder();
  const delay = Math.max(2, Math.round(1000 / fps));
  for (let i = 0; i < n; i++) {
    const rgba = upscale(frames[i], w, h, scale);
    const palette = quantize(rgba, 256, { format: "rgba4444", oneBitAlpha: true });
    const index = applyPalette(rgba, palette, "rgba4444");
    let transparentIndex = palette.findIndex((c) => c.length === 4 && c[3] === 0);
    if (transparentIndex === -1 && palette.length < 256) {
      palette.push([0, 0, 0, 0]);
      transparentIndex = palette.length - 1;
    }
    gif.writeFrame(index, w * scale, h * scale, {
      palette,
      delay,
      repeat: 0,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
      dispose: 2,
    });
    onProgress?.(i + 1, n);
    if (i % 4 === 3) await new Promise((res) => setTimeout(res, 0)); // keep the UI responsive
  }
  gif.finish();
  return new Blob([gif.bytes() as unknown as BlobPart], { type: "image/gif" });
}

/** Save a blob as a download. */
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
