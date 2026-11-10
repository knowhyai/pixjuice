// Animated PNG encoder, written by hand for PixJuice VIP: RGBA frames with
// per-frame alpha, assembled as an acTL + fcTL/fdAT APNG over hand-built PNG
// chunks (deflate via the browser's CompressionStream — no dependencies).
// Loaded as a VIP-only chunk: only import() it after activation.

import type { RenderedFrames } from "../lib/exports";
import { upscale } from "../lib/exports";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** zlib-wrapped deflate (RFC 1950) — what PNG IDAT/fdAT chunks require. */
async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** One PNG chunk: length, type, data, CRC-32 over type + data. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Filter-0 scanlines: every row prefixed with a filter-type byte. */
function scanlines(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const stride = w * 4;
  const out = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    out[y * (stride + 1)] = 0; // filter: None
    out.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return out;
}

/**
 * Assemble an APNG. Frames are full-canvas, dispose NONE, blend SOURCE —
 * every frame carries complete pixels, which keeps alpha exact.
 */
export async function buildApng(
  r: RenderedFrames,
  scale = 1,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const { w, h, fps, n, frames } = r;
  const W = w * scale;
  const H = h * scale;
  const delayNum = Math.max(1, Math.round(1000 / fps));
  const parts: Uint8Array[] = [];
  const push = (c: Uint8Array) => parts.push(c);

  // IHDR: 8-bit RGBA, no interlace
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W);
  dv.setUint32(4, H);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  push(chunk("IHDR", ihdr));

  // acTL: frame count, loop forever
  const actl = new Uint8Array(8);
  new DataView(actl.buffer).setUint32(0, n);
  new DataView(actl.buffer).setUint32(4, 0);
  push(chunk("acTL", actl));

  let seq = 0;
  const fctl = (): Uint8Array => {
    const f = new Uint8Array(26);
    const v = new DataView(f.buffer);
    v.setUint32(0, seq++);
    v.setUint32(4, W);
    v.setUint32(8, H);
    // x_offset (12) and y_offset (16) stay 0 — full-canvas frames
    v.setUint16(20, delayNum);
    v.setUint16(22, 1000); // delay_num/delay_den = ms precision
    f[24] = 0; // dispose: none
    f[25] = 0; // blend: source
    return f;
  };

  for (let i = 0; i < n; i++) {
    const rgba = scale === 1 ? new Uint8ClampedArray(frames[i]) : upscale(frames[i], w, h, scale);
    const raw = scanlines(rgba, W, H);
    push(chunk("fcTL", fctl()));
    if (i === 0) {
      push(chunk("IDAT", await deflate(raw)));
    } else {
      // fdAT = sequence number + the same datastream an IDAT would carry
      const z = await deflate(raw);
      const fdat = new Uint8Array(4 + z.length);
      new DataView(fdat.buffer).setUint32(0, seq++);
      fdat.set(z, 4);
      push(chunk("fdAT", fdat));
    }
    onProgress?.(i + 1, n);
    if (i % 2 === 1) await new Promise((res) => setTimeout(res, 0)); // keep the UI responsive
  }

  push(chunk("IEND", new Uint8Array()));
  const SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  return new Blob([SIG, ...parts] as BlobPart[], { type: "image/apng" });
}
