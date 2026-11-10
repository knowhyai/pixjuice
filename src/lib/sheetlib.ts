// Sprite sheet tool core: grid slicing, transparent-gap auto-detection, re-packing,
// and the export encoders (GIF via gifenc, store-only ZIP, Sparrow XML, TexturePacker JSON).
// Deliberately self-contained — importing lib/exports.ts would drag the whole pixelfx
// catalog into this page's bundle for the sake of one GIF helper.

import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { makeZip, type ZipEntry } from "./zip";

/** How a sheet is measured: explicit cell size, or a columns × rows count. */
export type SliceMode = "cells" | "count";

export interface SheetGrid {
  mode: SliceMode;
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
  offsetX: number;
  offsetY: number;
  spacingX: number;
  spacingY: number;
}

/** One grid cell (a candidate frame) in source-sheet coordinates. */
export interface FrameDef {
  /** Cell index in reading order (row-major), 0-based. */
  i: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** All cells of the grid that fully fit inside the image. */
export function sliceSheet(W: number, H: number, g: SheetGrid): FrameDef[] {
  const frames: FrameDef[] = [];
  const stepX = g.cellW + g.spacingX;
  const stepY = g.cellH + g.spacingY;
  if (g.cellW < 1 || g.cellH < 1 || g.cols < 1 || g.rows < 1) return frames;
  let i = 0;
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const x = g.offsetX + c * stepX;
      const y = g.offsetY + r * stepY;
      if (x + g.cellW <= W && y + g.cellH <= H && x >= 0 && y >= 0)
        frames.push({ i: i++, x, y, w: g.cellW, h: g.cellH });
    }
  }
  return frames;
}

/** In "count" mode the cell size is whatever remains after offset and spacing. */
export function cellFromCount(W: number, H: number, g: SheetGrid): { cellW: number; cellH: number } {
  const cw = Math.max(1, Math.floor((W - g.offsetX - g.spacingX * (g.cols - 1)) / g.cols));
  const ch = Math.max(1, Math.floor((H - g.offsetY - g.spacingY * (g.rows - 1)) / g.rows));
  return { cellW: cw, cellH: ch };
}

/** In "cells" mode the count is however many strides fit after the offset. */
export function countFromCell(W: number, H: number, g: SheetGrid): { cols: number; rows: number } {
  const fit = (span: number, cell: number, spacing: number) => {
    if (cell < 1) return 1;
    return Math.max(1, Math.floor((span + spacing) / (cell + spacing)));
  };
  return {
    cols: fit(W - g.offsetX, g.cellW, g.spacingX),
    rows: fit(H - g.offsetY, g.cellH, g.spacingY),
  };
}

// ---- auto-detect: frames separated by fully transparent rows/columns ----

/** Alpha threshold: a pixel counts as "there" from this alpha up. */
const ALPHA = 8;

interface Band {
  start: number;
  end: number; // inclusive
}

/** Contiguous runs of `true` in the mask. */
function runs(mask: Uint8Array): Band[] {
  const out: Band[] = [];
  let s = -1;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && s < 0) s = i;
    if (!mask[i] && s >= 0) {
      out.push({ start: s, end: i - 1 });
      s = -1;
    }
  }
  if (s >= 0) out.push({ start: s, end: mask.length - 1 });
  return out;
}

function median(nums: number[]): number {
  const a = [...nums].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export interface DetectResult {
  grid: SheetGrid | null;
  /** Human-readable outcome for the note line; values map to i18n keys. */
  outcome: "ok" | "fail";
}

/**
 * Find the grid by projecting alpha onto both axes: a column (or row) with no opaque
 * pixel is a gap, and the runs between gaps are frame bands. Uniform bands → a plain
 * grid (cell = median band size, spacing = median gap). Degenerate single bands fall
 * back to strip heuristics (a seamless horizontal strip of square frames, etc.).
 */
export function detectGrid(img: ImageData): DetectResult {
  const { width: W, height: H, data } = img;
  const colAny = new Uint8Array(W);
  const rowAny = new Uint8Array(H);
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      if (data[row + x * 4 + 3] >= ALPHA) {
        colAny[x] = 1;
        rowAny[y] = 1;
      }
    }
  }
  const xb = runs(colAny);
  const yb = runs(rowAny);
  if (!xb.length || !yb.length) return { grid: null, outcome: "fail" }; // fully transparent

  let cols = xb.length;
  let rows = yb.length;
  let cellW = Math.round(median(xb.map((b) => b.end - b.start + 1)));
  let cellH = Math.round(median(yb.map((b) => b.end - b.start + 1)));
  let spacingX = xb.length > 1 ? xb[1].start - xb[0].end - 1 : 0;
  let spacingY = yb.length > 1 ? yb[1].start - yb[0].end - 1 : 0;
  const offsetX = xb[0].start;
  const offsetY = yb[0].start;

  if (cols === 1 && rows === 1) {
    // No gaps at all: assume a seamless strip of square frames, if the math allows.
    if (W % H === 0 && W / H > 1) {
      cols = W / H;
      rows = 1;
      cellW = cellH = H;
    } else if (H % W === 0 && H / W > 1) {
      cols = 1;
      rows = H / W;
      cellW = cellH = W;
    } else return { grid: null, outcome: "fail" };
  } else if (cols === 1) {
    // Frames touch inside a row, but rows are separated: square-cell heuristic.
    const spanW = xb[0].end - xb[0].start + 1;
    cols = spanW % cellH === 0 ? spanW / cellH : Math.max(1, Math.round(spanW / cellH));
    cellW = Math.max(1, Math.floor(spanW / cols));
  } else if (rows === 1) {
    const spanH = yb[0].end - yb[0].start + 1;
    rows = spanH % cellW === 0 ? spanH / cellW : Math.max(1, Math.round(spanH / cellW));
    cellH = Math.max(1, Math.floor(spanH / rows));
  }

  if (cols < 1 || rows < 1 || cellW < 1 || cellH < 1 || cols * rows > 8192)
    return { grid: null, outcome: "fail" };
  // A grid this lopsided is usually noise (a text label, a border), not frames.
  if (cols * rows === 1) return { grid: null, outcome: "fail" };

  return {
    grid: {
      mode: "cells",
      cellW,
      cellH,
      cols,
      rows,
      offsetX,
      offsetY,
      spacingX: Math.max(0, spacingX),
      spacingY: Math.max(0, spacingY),
    },
    outcome: "ok",
  };
}

// ---- packing & atlases ----

export interface Placed {
  frame: FrameDef;
  x: number;
  y: number;
}

/** Layout for a re-packed sheet: frames in playback order, left-to-right, top-to-bottom. */
export function packLayout(frames: FrameDef[], cols: number): { w: number; h: number; placed: Placed[] } {
  const c = Math.max(1, Math.min(cols, frames.length));
  const rows = Math.ceil(frames.length / c);
  const w = Math.max(...frames.map((f) => f.w));
  const h = Math.max(...frames.map((f) => f.h));
  const placed = frames.map((frame, i) => ({
    frame,
    x: (i % c) * w,
    y: Math.floor(i / c) * h,
  }));
  return { w: w * c, h: h * rows, placed };
}

/** Draw the re-packed sheet (uniform cell = largest frame, each frame at its slot origin). */
export function packCanvas(
  src: CanvasImageSource,
  placed: Placed[],
  w: number,
  h: number,
): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d")!;
  for (const p of placed)
    ctx.drawImage(src, p.frame.x, p.frame.y, p.frame.w, p.frame.h, p.x, p.y, p.frame.w, p.frame.h);
  return cv;
}

function xmlEscape(s: string): string {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Sparrow/Starling TextureAtlas XML (also read by Cocos2d-x and friends). */
export function sparrowXml(
  imageName: string,
  placed: Placed[],
  w: number,
  h: number,
  nameOf: (i: number) => string,
): string {
  const subs = placed
    .map(
      (p, i) =>
        `    <SubTexture name="${xmlEscape(nameOf(i))}" x="${p.x}" y="${p.y}" width="${p.frame.w}" height="${p.frame.h}"/>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Created with PixJuice — https://pixjuice.pages.dev/sprite-sheet/ -->
<TextureAtlas imagePath="${xmlEscape(imageName)}" width="${w}" height="${h}">
${subs}
</TextureAtlas>
`;
}

/** TexturePacker-style hash atlas (Phaser, PixiJS, …). */
export function texturePackerJson(
  imageName: string,
  placed: Placed[],
  w: number,
  h: number,
  nameOf: (i: number) => string,
): string {
  const frames: Record<string, unknown> = {};
  placed.forEach((p, i) => {
    frames[nameOf(i)] = {
      frame: { x: p.x, y: p.y, w: p.frame.w, h: p.frame.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: p.frame.w, h: p.frame.h },
      sourceSize: { w: p.frame.w, h: p.frame.h },
    };
  });
  return `${JSON.stringify(
    {
      frames,
      meta: {
        app: "https://pixjuice.pages.dev/sprite-sheet/",
        version: "1.0",
        image: imageName,
        format: "RGBA8888",
        size: { w, h },
        scale: "1",
      },
    },
    null,
    2,
  )}\n`;
}

// ---- encoders ----

export function canvasToBlob(cv: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png"),
  );
}

export async function blobBytes(b: Blob): Promise<Uint8Array> {
  return new Uint8Array(await b.arrayBuffer());
}

/** Nearest-neighbour upscale so GIFs stay crisp at 2×/3× (same trick as lib/exports.ts). */
function upscale(rgba: Uint8ClampedArray, w: number, h: number, k: number): Uint8ClampedArray {
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

/** Animated GIF with transparency: one local color table per frame, 1-bit alpha, dispose 2. */
export async function encodeGif(
  frames: Uint8ClampedArray[],
  w: number,
  h: number,
  fps: number,
  scale: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const gif = GIFEncoder();
  const delay = Math.max(2, Math.round(1000 / fps));
  for (let i = 0; i < frames.length; i++) {
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
    onProgress?.(i + 1, frames.length);
    if (i % 4 === 3) await new Promise((res) => setTimeout(res, 0)); // keep the UI responsive
  }
  gif.finish();
  return new Blob([gif.bytes() as unknown as BlobPart], { type: "image/gif" });
}

export function zipBlob(entries: ZipEntry[]): Blob {
  return makeZip(entries);
}

/** A download-friendly base name from the uploaded file name ("Hero Sheet.png" → "hero-sheet"). */
export function sanitizeBase(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "spritesheet";
}
