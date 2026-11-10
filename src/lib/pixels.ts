// Shared core for the three image tools (image→pixel art, normal map, upscaler):
// upload/decode helpers, palette quantization + dithering, background removal,
// outline, Sobel normal mapping, and the pixel scaling algorithms (nearest /
// Scale2x / Scale3x / xBR-style corner blending). Deliberately self-contained —
// importing sheetlib would drag gifenc into these pages' bundles.

export type RGB = [number, number, number];

// ---- files & canvas ----

export interface DecodedImage {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  data: ImageData;
}

/** Decode an uploaded image file to a canvas + its pixels. Throws on failure. */
export async function loadImageFile(file: File): Promise<DecodedImage> {
  const bmp = await createImageBitmap(file);
  const cv = document.createElement("canvas");
  cv.width = bmp.width;
  cv.height = bmp.height;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return { cv, ctx, data: ctx.getImageData(0, 0, cv.width, cv.height) };
}

export function canvasToBlob(cv: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    cv.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), "image/png"),
  );
}

/** A download-friendly base name from the uploaded file name ("Hero Sheet.png" → "hero-sheet"). */
export function sanitizeBase(name: string, fallback = "image"): string {
  const base = name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || fallback;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** New ImageData-compatible buffer without touching the DOM (workers-free pages). */
export function newImageData(w: number, h: number): ImageData {
  return new ImageData(w, h);
}

// ---- palettes ----

/** "#ff0044"-style list → RGB triples. Accepts 3/6-digit hex, commas/spaces/newlines. */
export function parseHexPalette(text: string): RGB[] {
  const out: RGB[] = [];
  const re = /#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  for (const m of text.matchAll(re)) {
    const h = m[1];
    if (h.length === 3)
      out.push([parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]);
    else out.push([parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]);
  }
  return out;
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Well-known public palette data (color values as such; lists as commonly embedded in OSS tools). */
export const BUILTIN_PALETTES: { id: string; label: string; colors: string[] }[] = [
  {
    id: "pico-8",
    label: "PICO-8 (16)",
    colors: ["000000", "1D2B53", "7E2553", "008751", "AB5236", "5F574F", "C2C3C7", "FFF1E8", "FF004D", "FFA300", "FFEC27", "00E436", "29ADFF", "83769C", "FF77A8", "FFCCAA"],
  },
  {
    id: "gameboy",
    label: "Game Boy (4)",
    colors: ["0F380F", "306230", "8BAC0F", "9BBC0F"],
  },
  {
    id: "cga",
    label: "CGA (16)",
    colors: ["000000", "0000AA", "00AA00", "00AAAA", "AA0000", "AA00AA", "AA5500", "AAAAAA", "555555", "5555FF", "55FF55", "55FFFF", "FF5555", "FF55FF", "FFFF55", "FFFFFF"],
  },
  {
    id: "gray4",
    label: "1-bit (2)",
    colors: ["000000", "FFFFFF"],
  },
];

/**
 * Median-cut quantization on the opaque pixels → up to `n` representative colors.
 * Samples the image if it's huge, so the cost stays bounded.
 */
export function autoPalette(img: ImageData, n: number): RGB[] {
  const { width: W, height: H, data } = img;
  const total = W * H;
  const stride = Math.max(1, Math.floor(total / 65536));
  const px: number[] = []; // flat r,g,b triples of sampled opaque pixels
  for (let i = 0; i < total; i += stride) {
    if (data[i * 4 + 3] < 128) continue;
    px.push(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  }
  if (!px.length) return [[0, 0, 0]];

  let buckets: number[][][] = [[]]; // each bucket: list of [r,g,b]
  for (let i = 0; i < px.length; i += 3) buckets[0].push([px[i], px[i + 1], px[i + 2]]);

  while (buckets.length < n) {
    // split the bucket with the largest channel range
    let best = -1;
    let bestRange = -1;
    let bestAxis = 0;
    for (let b = 0; b < buckets.length; b++) {
      if (buckets[b].length < 2) continue;
      for (let ax = 0; ax < 3; ax++) {
        let lo = 255;
        let hi = 0;
        for (const p of buckets[b]) {
          if (p[ax] < lo) lo = p[ax];
          if (p[ax] > hi) hi = p[ax];
        }
        if (hi - lo > bestRange) {
          bestRange = hi - lo;
          best = b;
          bestAxis = ax;
        }
      }
    }
    if (best < 0 || bestRange === 0) break;
    const bucket = buckets[best].sort((a, b) => a[bestAxis] - b[bestAxis]);
    const mid = bucket.length >> 1;
    buckets.splice(best, 1, bucket.slice(0, mid), bucket.slice(mid));
  }

  return buckets
    .filter((b) => b.length)
    .map((b) => {
      let r = 0;
      let g = 0;
      let bl = 0;
      for (const p of b) {
        r += p[0];
        g += p[1];
        bl += p[2];
      }
      return [Math.round(r / b.length), Math.round(g / b.length), Math.round(bl / b.length)] as RGB;
    });
}

// ---- image → pixel art ----

export type DitherMode = "none" | "bayer" | "floyd";

export interface BgRemove {
  mode: "none" | "corner" | "color";
  color: RGB; // used by "color"; "corner" samples the four corners
  tolerance: number; // 0–100 → max RGB distance (0–441)
}

export interface PixelateOpts {
  block: number; // source pixels per block, ≥1
  palette: RGB[];
  dither: DitherMode;
  bg: BgRemove;
  outline: RGB | null; // 1-block outline color around opaque blocks
}

/** Bayer 4×4 ordered-dither threshold offsets, ±16/16 around zero. */
const BAYER = [
  [-8, 2, -6, 4],
  [6, -3, 8, -5],
  [-4, 8, -2, 10],
  [10, -1, 5, -7],
];

/** Downsample → drop background → map to palette (with dithering) → optional outline. */
export function pixelate(src: ImageData, o: PixelateOpts): ImageData {
  const { width: W, height: H, data } = src;
  const b = Math.max(1, Math.round(o.block));
  const gw = Math.ceil(W / b);
  const gh = Math.ceil(H / b);
  const out = newImageData(gw, gh);
  const od = out.data;

  // 1. area-average each block (alpha-weighted, so transparent edges don't tint)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let r = 0;
      let g = 0;
      let bl = 0;
      let a = 0;
      let n = 0;
      for (let y = gy * b; y < Math.min((gy + 1) * b, H); y++) {
        for (let x = gx * b; x < Math.min((gx + 1) * b, W); x++) {
          const i = (y * W + x) * 4;
          const al = data[i + 3] / 255;
          r += data[i] * al;
          g += data[i + 1] * al;
          bl += data[i + 2] * al;
          a += data[i + 3];
          n++;
        }
      }
      const j = (gy * gw + gx) * 4;
      if (a > 0) {
        od[j] = Math.round(r / (a / 255));
        od[j + 1] = Math.round(g / (a / 255));
        od[j + 2] = Math.round(bl / (a / 255));
      }
      od[j + 3] = Math.round(a / n);
    }
  }

  // 2. background removal (key-color with tolerance)
  if (o.bg.mode !== "none") {
    let kc: RGB = o.bg.color;
    if (o.bg.mode === "corner") {
      // average of the four corner blocks — usually the matte/sky color
      const at = (gx: number, gy: number) => {
        const j = (gy * gw + gx) * 4;
        return [od[j], od[j + 1], od[j + 2]] as RGB;
      };
      const cs = [at(0, 0), at(gw - 1, 0), at(0, gh - 1), at(gw - 1, gh - 1)];
      kc = [
        Math.round(cs.reduce((s, c) => s + c[0], 0) / 4),
        Math.round(cs.reduce((s, c) => s + c[1], 0) / 4),
        Math.round(cs.reduce((s, c) => s + c[2], 0) / 4),
      ];
    }
    const thr = (o.bg.tolerance / 100) * 441;
    for (let j = 0; j < gw * gh; j++) {
      const i = j * 4;
      if (od[i + 3] < 8) continue;
      const d = Math.hypot(od[i] - kc[0], od[i + 1] - kc[1], od[i + 2] - kc[2]);
      if (d <= thr) od[i + 3] = 0;
    }
  }

  // 3. palette mapping (+ dithering) on opaque blocks
  const pal = o.palette.length ? o.palette : ([[0, 0, 0]] as RGB[]);
  const nearest = (r: number, g: number, bl2: number): RGB => {
    let bi = 0;
    let bd = Infinity;
    for (let p = 0; p < pal.length; p++) {
      const dr = r - pal[p][0];
      const dg = g - pal[p][1];
      const db = bl2 - pal[p][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) {
        bd = d;
        bi = p;
      }
    }
    return pal[bi];
  };

  if (o.dither === "floyd") {
    // error diffusion on float copies of the RGB channels
    const fr = new Float32Array(gw * gh);
    const fg = new Float32Array(gw * gh);
    const fb = new Float32Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) {
      fr[i] = od[i * 4];
      fg[i] = od[i * 4 + 1];
      fb[i] = od[i * 4 + 2];
    }
    const push = (x: number, y: number, er: number, eg: number, eb: number, f: number) => {
      if (x < 0 || x >= gw || y >= gh) return;
      const i = y * gw + x;
      if (od[i * 4 + 3] < 8) return;
      fr[i] += er * f;
      fg[i] += eg * f;
      fb[i] += eb * f;
    };
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        const j = i * 4;
        if (od[j + 3] < 8) continue;
        const [pr, pg, pb] = nearest(fr[i], fg[i], fb[i]);
        od[j] = pr;
        od[j + 1] = pg;
        od[j + 2] = pb;
        const er = fr[i] - pr;
        const eg = fg[i] - pg;
        const eb = fb[i] - pb;
        push(x + 1, y, er, eg, eb, 7 / 16);
        push(x - 1, y + 1, er, eg, eb, 3 / 16);
        push(x, y + 1, er, eg, eb, 5 / 16);
        push(x + 1, y + 1, er, eg, eb, 1 / 16);
      }
    }
  } else {
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const j = (y * gw + x) * 4;
        if (od[j + 3] < 8) continue;
        let r = od[j];
        let g = od[j + 1];
        let bl2 = od[j + 2];
        if (o.dither === "bayer") {
          const t = BAYER[y & 3][x & 3];
          r += t * 2;
          g += t * 2;
          bl2 += t * 2;
        }
        const [pr, pg, pb] = nearest(r, g, bl2);
        od[j] = pr;
        od[j + 1] = pg;
        od[j + 2] = pb;
      }
    }
  }

  // 4. 1-block outline around opaque blocks (4-neighborhood)
  if (o.outline) {
    const alpha = new Uint8Array(gw * gh);
    for (let i = 0; i < gw * gh; i++) alpha[i] = od[i * 4 + 3] >= 8 ? 1 : 0;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        if (alpha[i]) continue;
        const near =
          (x > 0 && alpha[i - 1]) || (x < gw - 1 && alpha[i + 1]) || (y > 0 && alpha[i - gw]) || (y < gh - 1 && alpha[i + gw]);
        if (near) {
          const j = i * 4;
          od[j] = o.outline[0];
          od[j + 1] = o.outline[1];
          od[j + 2] = o.outline[2];
          od[j + 3] = 255;
        }
      }
    }
  }

  return out;
}

// ---- normal maps ----

export interface NormalOpts {
  strength: number; // Sobel multiplier
  blur: number; // box-blur passes on the height field (0–5)
  invertY: boolean; // green channel up (OpenGL) vs down (DirectX)
  heightFrom: "luma" | "alpha";
  invertHeight: boolean;
}

/**
 * Height field (luminance or alpha, optionally inverted, optionally blurred) →
 * Sobel gradients → RGB-encoded normals. Source alpha is preserved.
 */
export function normalMap(src: ImageData, o: NormalOpts): ImageData {
  const { width: W, height: H, data } = src;
  const h = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    let v: number;
    if (o.heightFrom === "alpha") v = data[i * 4 + 3] / 255;
    // luma relief: brightness inside the sprite, floor outside (alpha just masks)
    else v = data[i * 4 + 3] < 8 ? 0 : (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
    h[i] = o.invertHeight ? 1 - v : v;
  }

  // separable box blur, radius 1, `blur` passes
  for (let p = 0; p < o.blur; p++) {
    const tmp = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        tmp[i] = (h[i] + h[x > 0 ? i - 1 : i] + h[x < W - 1 ? i + 1 : i]) / 3;
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        h[i] = (tmp[i] + tmp[y > 0 ? i - W : i] + tmp[y < H - 1 ? i + W : i]) / 3;
      }
    }
  }

  const out = newImageData(W, H);
  const od = out.data;
  const k = (o.strength * 8) / 255;
  for (let y = 0; y < H; y++) {
    const yUp = y > 0 ? y - 1 : y;
    const yDn = y < H - 1 ? y + 1 : y;
    for (let x = 0; x < W; x++) {
      const xL = x > 0 ? x - 1 : x;
      const xR = x < W - 1 ? x + 1 : x;
      // Sobel (light-weight: central differences on the blurred field)
      const gx =
        h[yUp * W + xR] + 2 * h[y * W + xR] + h[yDn * W + xR] -
        (h[yUp * W + xL] + 2 * h[y * W + xL] + h[yDn * W + xL]);
      const gy =
        h[yDn * W + xL] + 2 * h[yDn * W + x] + h[yDn * W + xR] -
        (h[yUp * W + xL] + 2 * h[yUp * W + x] + h[yUp * W + xR]);
      let nx = -gx * k;
      let ny = -gy * k;
      if (o.invertY) ny = -ny;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      const i = (y * W + x) * 4;
      od[i] = Math.round((nx * 0.5 + 0.5) * 255);
      od[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      od[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      od[i + 3] = data[i];
    }
  }
  return out;
}

/** Decoded normals as signed floats, for the live lighting preview. */
export function normalsAsFloat(nm: ImageData): Float32Array {
  const out = new Float32Array(nm.width * nm.height * 3);
  for (let i = 0; i < nm.width * nm.height; i++) {
    out[i * 3] = (nm.data[i * 4] / 255) * 2 - 1;
    out[i * 3 + 1] = (nm.data[i * 4 + 1] / 255) * 2 - 1;
    out[i * 3 + 2] = (nm.data[i * 4 + 2] / 255) * 2 - 1;
  }
  return out;
}

// ---- upscaling ----

const px = (d: Uint8ClampedArray, i: number) => [d[i], d[i + 1], d[i + 2], d[i + 3]] as const;
const eq = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
const mix = (a: readonly number[], b: readonly number[], w: number) =>
  [Math.round(a[0] + (b[0] - a[0]) * w), Math.round(a[1] + (b[1] - a[1]) * w), Math.round(a[2] + (b[2] - a[2]) * w), Math.round(a[3] + (b[3] - a[3]) * w)] as const;

/** Nearest-neighbour integer scale (what every other algorithm multiplies with). */
export function nearestScale(src: ImageData, k: number): ImageData {
  if (k === 1) return src;
  const { width: W, height: H, data } = src;
  const out = newImageData(W * k, H * k);
  const od = out.data;
  for (let y = 0; y < H * k; y++) {
    const sy = (y / k) | 0;
    for (let x = 0; x < W * k; x++) {
      const s = (sy * W + ((x / k) | 0)) * 4;
      const d = (y * W * k + x) * 4;
      od[d] = data[s];
      od[d + 1] = data[s + 1];
      od[d + 2] = data[s + 2];
      od[d + 3] = data[s + 3];
    }
  }
  return out;
}

/** AdvMAME Scale2x: fills the stair-step corners of 2× blocks from equal neighbors. */
export function scale2x(src: ImageData): ImageData {
  const { width: W, height: H, data } = src;
  const out = newImageData(W * 2, H * 2);
  const od = out.data;
  const at = (x: number, y: number) => px(data, (Math.min(W - 1, Math.max(0, x)) + Math.min(H - 1, Math.max(0, y)) * W) * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const B = at(x, y - 1);
      const D = at(x - 1, y);
      const E = at(x, y);
      const F = at(x + 1, y);
      const Hn = at(x, y + 1);
      const diag = !eq(B, Hn) && !eq(D, F);
      const subs = [
        diag && eq(D, B) ? D : E, // top-left
        diag && eq(B, F) ? B : E, // top-right
        diag && eq(Hn, D) ? Hn : E, // bottom-left
        diag && eq(F, Hn) ? F : E, // bottom-right
      ];
      for (let s = 0; s < 4; s++) {
        const d = ((y * 2 + (s >> 1)) * W * 2 + x * 2 + (s & 1)) * 4;
        od[d] = subs[s][0];
        od[d + 1] = subs[s][1];
        od[d + 2] = subs[s][2];
        od[d + 3] = subs[s][3];
      }
    }
  }
  return out;
}

/** AdvMAME Scale3x (the 9-subpixel rule table from the Scale2x project). */
export function scale3x(src: ImageData): ImageData {
  const { width: W, height: H, data } = src;
  const out = newImageData(W * 3, H * 3);
  const od = out.data;
  const at = (x: number, y: number) => px(data, (Math.min(W - 1, Math.max(0, x)) + Math.min(H - 1, Math.max(0, y)) * W) * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const A = at(x - 1, y - 1);
      const B = at(x, y - 1);
      const C = at(x + 1, y - 1);
      const D = at(x - 1, y);
      const E = at(x, y);
      const F = at(x + 1, y);
      const G = at(x - 1, y + 1);
      const Hn = at(x, y + 1);
      const I = at(x + 1, y + 1);
      const bne = !eq(B, Hn);
      const dnf = !eq(D, F);
      const dbA = eq(D, B) && !eq(A, E);
      const bfC = eq(B, F) && !eq(C, E);
      const hdG = eq(Hn, D) && !eq(G, E);
      const fhI = eq(F, Hn) && !eq(I, E);
      const e0 = bne && dnf && dbA ? D : E;
      const e1 = bne && dnf && (dbA || bfC) ? (dbA ? D : B) : E;
      const e2 = bne && dnf && bfC ? B : E;
      const e3 = bne && dnf && (dbA || hdG) ? (dbA ? D : Hn) : E;
      const e4 = E;
      const e5 = bne && dnf && (bfC || fhI) ? (bfC ? B : F) : E;
      const e6 = bne && dnf && hdG ? Hn : E;
      const e7 = bne && dnf && (hdG || fhI) ? (hdG ? Hn : F) : E;
      const e8 = bne && dnf && fhI ? F : E;
      const subs = [e0, e1, e2, e3, e4, e5, e6, e7, e8];
      for (let s = 0; s < 9; s++) {
        const d = ((y * 3 + ((s / 3) | 0)) * W * 3 + x * 3 + (s % 3)) * 4;
        od[d] = subs[s][0];
        od[d + 1] = subs[s][1];
        od[d + 2] = subs[s][2];
        od[d + 3] = subs[s][3];
      }
    }
  }
  return out;
}

/** Perceptual-ish distance for the corner decisions (alpha counts as a channel). */
const colorDist = (a: readonly number[], b: readonly number[]) => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  const da = a[3] - b[3];
  return (dr * dr * 2 + dg * dg * 4 + db * db * 3 + da * da * 4) / 10;
};

/**
 * xBR-style 2× (clean-room): for each source pixel, each output corner checks its two
 * orthogonal neighbors — if both differ from the center but match each other, a diagonal
 * edge runs through the corner and it takes the neighbor color (straightening stairs);
 * a lone corner tip blends toward the diagonal neighbor. Scales by xBR-then-nearest.
 */
export function xbr2x(src: ImageData): ImageData {
  const { width: W, height: H, data } = src;
  const out = newImageData(W * 2, H * 2);
  const od = out.data;
  const at = (x: number, y: number) => px(data, (Math.min(W - 1, Math.max(0, x)) + Math.min(H - 1, Math.max(0, y)) * W) * 4);
  const T = 350; // "same color" threshold on colorDist
  const near = (a: readonly number[], b: readonly number[]) => colorDist(a, b) <= T;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const A = at(x - 1, y - 1);
      const B = at(x, y - 1);
      const C = at(x + 1, y - 1);
      const D = at(x - 1, y);
      const E = at(x, y);
      const F = at(x + 1, y);
      const G = at(x - 1, y + 1);
      const Hn = at(x, y + 1);
      const I = at(x + 1, y + 1);
      // [diagonal, ortho1, ortho2] per output corner: TL, TR, BL, BR
      const corners: [readonly number[], readonly number[], readonly number[]][] = [
        [A, B, D],
        [C, B, F],
        [G, Hn, D],
        [I, Hn, F],
      ];
      for (let s = 0; s < 4; s++) {
        const [X, g1, g2] = corners[s];
        let v: readonly number[] = E;
        const e1 = !near(g1, E);
        const e2 = !near(g2, E);
        if (e1 && e2) {
          if (near(g1, g2)) v = g1; // diagonal edge through the corner → fill it
          else if (!near(X, E) && (near(X, g1) || near(X, g2))) v = mix(E, X, 0.6); // lone corner tip → soften
        }
        const d = ((y * 2 + (s >> 1)) * W * 2 + x * 2 + (s & 1)) * 4;
        od[d] = v[0];
        od[d + 1] = v[1];
        od[d + 2] = v[2];
        od[d + 3] = v[3];
      }
    }
  }
  return out;
}

export type UpscaleAlgo = "nearest" | "scale2x" | "scale3x" | "xbr";

/** Base factor each algorithm produces before integer nearest multiplication. */
export function algoBase(algo: UpscaleAlgo): number {
  return algo === "scale3x" ? 3 : algo === "nearest" ? 1 : 2;
}

/** algo at its base scale, then nearest-multiplied to `k` (must be a multiple of the base). */
export function upscale(src: ImageData, algo: UpscaleAlgo, k: number): ImageData {
  if (algo === "nearest") return nearestScale(src, k);
  const base = algo === "scale3x" ? scale3x(src) : algo === "scale2x" ? scale2x(src) : xbr2x(src);
  return nearestScale(base, Math.max(1, Math.round(k / algoBase(algo))));
}
