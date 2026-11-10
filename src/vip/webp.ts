// Animated lossless WebP encoder, written by hand for PixJuice VIP: each frame
// is a minimal VP8L bitstream (no transforms, no color cache, no palette —
// literals plus greedy LZ77 over ARGB pixels, canonical Huffman codes), and the
// frames are wrapped in the VP8X/ANIM/ANMF animation container. Pixel art is
// exactly what VP8L was built for, so the output is crisp and lossless.
// Loaded as a VIP-only chunk: only import() it after activation.

import type { RenderedFrames } from "../lib/exports";
import { upscale } from "../lib/exports";

// ---- bit writer: LSB-first, as the VP8L bitstream requires

class BitWriter {
  private bytes: number[] = [];
  private cur = 0;
  private used = 0; // bits filled in the current byte

  /** Write n bits of value; the value's LSB goes first (the reader's order). */
  bits(value: number, n: number): void {
    for (let i = 0; i < n; i++) {
      this.cur |= (value >>> i) & 1 ? 1 << this.used : 0;
      if (++this.used === 8) {
        this.bytes.push(this.cur);
        this.cur = 0;
        this.used = 0;
      }
    }
  }

  /** A prefix-code word: the decoder peeks k bits from the LSB-first stream as
   *  a natural integer and indexes its table by the REVERSED canonical code —
   *  so the code's MSB must land in the stream first. */
  code(c: number, len: number): void {
    for (let i = len - 1; i >= 0; i--) this.bits((c >>> i) & 1, 1);
  }

  finish(): Uint8Array {
    if (this.used > 0) this.bytes.push(this.cur); // pad with zero bits
    return new Uint8Array(this.bytes);
  }
}

// ---- value → (prefix code, extra bits, extra value) for lengths and distances
// Built by inverting the spec's decoder formula; one table serves both.

const VALUE_TO_CODE: { code: number; extraBits: number; extraVal: number }[] = (() => {
  const table: { code: number; extraBits: number; extraVal: number }[] = [];
  for (let code = 0; code < 40; code++) {
    if (code < 4) {
      table[code + 1] = { code, extraBits: 0, extraVal: 0 };
      continue;
    }
    const extra = (code - 2) >> 1;
    const offset = (2 + (code & 1)) << extra;
    for (let v = offset + 1; v <= offset + (1 << extra) && v <= 1048576; v++) {
      table[v] = { code, extraBits: extra, extraVal: v - offset - 1 };
    }
  }
  return table;
})();

const MAX_LENGTH = 4096;
const MAX_DIST = 1048576 - 120; // v = dist + 120 must stay inside the code space

// ---- Huffman: package-merge lengths (bounded), then canonical codes

/** Code lengths with a hard cap: an ordinary Huffman tree, falling back to a
 *  complete flat-ish tree when the optimum would exceed the cap (rare with
 *  pixel frequencies; the fallback keeps Kraft equality exact either way). */
function huffmanLengths(freqs: number[], cap: number): number[] {
  const n = freqs.length;
  const lens = new Array<number>(n).fill(0);
  const used: number[] = [];
  for (let i = 0; i < n; i++) if (freqs[i] > 0) used.push(i);
  if (used.length === 0) return lens;
  if (used.length === 1) {
    lens[used[0]] = 1; // a single leaf consumes zero bits
    return lens;
  }

  // ordinary Huffman: two-queue merge over weight-sorted leaves
  interface Node {
    w: number;
    syms: number[];
    l?: Node;
    r?: Node;
  }
  const q1: Node[] = used.map((s) => ({ w: freqs[s], syms: [s] })).sort((a, b) => a.w - b.w);
  const q2: Node[] = [];
  const take = (): Node => {
    if (!q1.length) return q2.shift()!;
    if (!q2.length) return q1.shift()!;
    return q2[0].w < q1[0].w ? q2.shift()! : q1.shift()!;
  };
  while (q1.length + q2.length > 1) {
    const a = take();
    const b = take();
    q2.push({ w: a.w + b.w, syms: [...a.syms, ...b.syms], l: a, r: b });
  }
  const root = q1[0] ?? q2[0];
  let overflow = false;
  const walk = (node: Node, depth: number) => {
    if (depth > cap) overflow = true;
    if (node.l && node.r) {
      walk(node.l, depth + 1);
      walk(node.r, depth + 1);
      return;
    }
    lens[node.syms[0]] = depth;
  };
  walk(root, 0);

  if (!overflow) return lens;

  // flat fallback: a complete tree over k leaves at two adjacent depths
  const k = used.length;
  const b = Math.ceil(Math.log2(k));
  const short = 2 ** b - k; // symbols one bit shorter
  used.forEach((s, i) => {
    lens[s] = i < short ? b - 1 : b;
  });
  return lens;
}

/** Canonical codes: sorted by (length, symbol); the first bit written is the MSB. */
function canonicalCodes(lens: number[]): number[] {
  let maxLen = 0;
  for (const l of lens) maxLen = Math.max(maxLen, l);
  const codes = new Array<number>(lens.length).fill(0);
  let code = 0;
  for (let len = 1; len <= maxLen; len++) {
    for (let s = 0; s < lens.length; s++) {
      if (lens[s] === len) codes[s] = code++;
    }
    code <<= 1;
  }
  return codes;
}

// ---- prefix-code serialization

const CODE_LENGTH_ORDER = [17, 18, 0, 1, 2, 3, 4, 5, 16, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/** The tree the writer serialized — emission must use exactly these codes. */
interface PrefixTable {
  lens: number[];
  codes: number[];
}

/** Serialize one prefix code (the "simple" or "normal" header + tree). */
function writePrefixCode(bw: BitWriter, freqs: number[], alphabetSize: number): PrefixTable {
  const lens = new Array<number>(alphabetSize).fill(0);
  const used: number[] = [];
  for (let i = 0; i < alphabetSize; i++) if (freqs[i] > 0) used.push(i);

  if (used.length === 0) {
    // Never used; a one-symbol simple code satisfies the format.
    bw.bits(1, 1); // simple
    bw.bits(0, 1); // 1 symbol
    bw.bits(0, 1); // 1-bit first symbol
    bw.bits(0, 1);
    return { lens, codes: new Array<number>(alphabetSize).fill(0) };
  }
  // (a one-symbol simple code consumes zero bits per read: its tree maps every
  //  lookups to the lone symbol, so the emitter must write nothing for it)
  // Simple codes carry their symbols in 8-bit fields, so they only fit when
  // every used symbol is ≤ 255 (the green alphabet reaches 279 with lengths).
  if (used.length <= 2 && used.every((s) => s <= 255)) {
    bw.bits(1, 1); // simple
    bw.bits(used.length - 1, 1);
    bw.bits(used[0] > 1 ? 1 : 0, 1); // first symbol needs 8 bits only when > 1
    bw.bits(used[0], used[0] > 1 ? 8 : 1);
    if (used.length === 2) bw.bits(used[1], 8);
    // first symbol → code 0, second → code 1. With one symbol the code length
    // stays 0 — a lone leaf is a zero-bit code.
    const codes = new Array<number>(alphabetSize).fill(0);
    if (used.length === 2) {
      lens[used[0]] = 1;
      lens[used[1]] = 1;
      codes[used[0]] = 0;
      codes[used[1]] = 1;
    }
    return { lens, codes };
  }

  let finalLens = huffmanLengths(freqs, 15);
  // All-equal lengths would leave a single code-length token in the serialized
  // tree; break the tie so the tree always carries two distinct lengths.
  const distinct = new Set(used.map((s) => finalLens[s]));
  if (distinct.size === 1) {
    const bumped = [...freqs];
    bumped[used[0]] += freqs.reduce((a, b) => a + b, 0);
    finalLens = huffmanLengths(bumped, 15);
  }

  // Tokenize the symbol-length stream: literals 0..15, 17 (3..10 zeros), 18 (11..138 zeros).
  const tokens: { sym: number; extra: number; extraBits: number }[] = [];
  let run = 0; // pending zeros
  const flushZeros = () => {
    while (run >= 3) {
      if (run >= 11) {
        const c = Math.min(run, 138);
        tokens.push({ sym: 18, extra: c - 11, extraBits: 7 });
        run -= c;
      } else {
        const c = Math.min(run, 10);
        tokens.push({ sym: 17, extra: c - 3, extraBits: 3 });
        run -= c;
      }
    }
    for (; run > 0; run--) tokens.push({ sym: 0, extra: 0, extraBits: 0 });
  };
  for (let s = 0; s < alphabetSize; s++) {
    const len = finalLens[s];
    if (len === 0) {
      run++;
      continue;
    }
    flushZeros();
    tokens.push({ sym: len, extra: 0, extraBits: 0 });
  }
  flushZeros();

  // Huffman over the 19 code-length symbols, capped at 7 (3-bit serialized) lengths.
  const clFreqs = new Array<number>(19).fill(0);
  for (const tok of tokens) clFreqs[tok.sym]++;
  const clLens = huffmanLengths(clFreqs, 7);
  const clCodes = canonicalCodes(clLens);
  let numCodeLengths = CODE_LENGTH_ORDER.length;
  while (numCodeLengths > 4 && clLens[CODE_LENGTH_ORDER[numCodeLengths - 1]] === 0) numCodeLengths--;

  bw.bits(0, 1); // normal code
  bw.bits(numCodeLengths - 4, 4);
  for (let i = 0; i < numCodeLengths; i++) bw.bits(clLens[CODE_LENGTH_ORDER[i]], 3);
  bw.bits(0, 1); // max_symbol = alphabet size (lengths follow for every symbol)
  for (const tok of tokens) {
    bw.code(clCodes[tok.sym], clLens[tok.sym]);
    if (tok.extraBits) bw.bits(tok.extra, tok.extraBits);
  }
  return { lens: finalLens, codes: canonicalCodes(finalLens) };
}

// ---- LZ77 over ARGB pixels (u32 units)

interface Match {
  len: number;
  dist: number;
}

/** Greedy longest-match search with a small hash of recent positions. */
function tokenize(pixels: Uint32Array): (Match | number)[] {
  const out: (Match | number)[] = [];
  const HASH_BITS = 14;
  const table = new Int32Array(1 << HASH_BITS).fill(-1);
  const hash = (at: number) =>
    (((pixels[at] ^ (pixels[at + 1] << 8) ^ (pixels[at] << 4)) >>> 0) * 0x9e3779b1 >>> (32 - HASH_BITS)) & ((1 << HASH_BITS) - 1);

  let i = 0;
  const n = pixels.length;
  while (i < n) {
    let best: Match | null = null;
    if (i + 2 < n) {
      const h = hash(i);
      const cand = table[h];
      if (cand >= 0) {
        const dist = i - cand;
        if (dist >= 1 && dist <= Math.min(i, MAX_DIST)) {
          let len = 0;
          const lim = Math.min(n - i, MAX_LENGTH);
          while (len < lim && pixels[cand + len] === pixels[i + len]) len++;
          if (len >= 3) best = { len, dist };
        }
      }
      table[h] = i;
    }
    if (best) {
      out.push(best);
      // insert the covered positions so later matches can find them
      for (let j = i + 1; j < i + best.len && j + 2 < n; j++) table[hash(j)] = j;
      i += best.len;
    } else {
      out.push(i); // literal pixel index
      i++;
    }
  }
  return out;
}

// ---- one VP8L frame bitstream

function encodeFrame(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const pixels = new Uint32Array(w * h);
  let hasAlpha = false;
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const a = rgba[i * 4 + 3];
    if (a < 255) hasAlpha = true;
    // channel packing is arbitrary as long as it's used consistently here:
    // a<<24 | b<<16 | g<<8 | r (the little-endian RGBA view)
    pixels[i] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  const tokens = tokenize(pixels);

  // Count symbol frequencies first (green also carries the length codes).
  const gFreq = new Array<number>(280).fill(0);
  const rFreq = new Array<number>(256).fill(0);
  const bFreq = new Array<number>(256).fill(0);
  const aFreq = new Array<number>(256).fill(0);
  const dFreq = new Array<number>(40).fill(0);
  const ch = (px: number) => [px & 255, (px >>> 8) & 255, (px >>> 16) & 255, (px >>> 24) & 255] as const;
  for (const tok of tokens) {
    if (typeof tok === "number") {
      const [r, g, b, a] = ch(pixels[tok]);
      gFreq[g]++;
      rFreq[r]++;
      bFreq[b]++;
      aFreq[a]++;
    } else {
      gFreq[256 + VALUE_TO_CODE[tok.len].code]++;
      dFreq[VALUE_TO_CODE[Math.min(tok.dist + 120, 1048576)].code]++;
    }
  }

  const bw = new BitWriter();
  bw.bits(0x2f, 8); // VP8L signature
  bw.bits(w - 1, 14);
  bw.bits(h - 1, 14);
  bw.bits(hasAlpha ? 1 : 0, 1);
  bw.bits(0, 3); // version
  bw.bits(0, 1); // no transform
  bw.bits(0, 1); // no color cache
  bw.bits(0, 1); // no meta prefix
  const gT = writePrefixCode(bw, gFreq, 280);
  const rT = writePrefixCode(bw, rFreq, 256);
  const bT = writePrefixCode(bw, bFreq, 256);
  const aT = writePrefixCode(bw, aFreq, 256);
  const dT = writePrefixCode(bw, dFreq, 40);

  for (const tok of tokens) {
    if (typeof tok === "number") {
      const [r, g, b, a] = ch(pixels[tok]);
      bw.code(gT.codes[g], gT.lens[g]); // green
      bw.code(rT.codes[r], rT.lens[r]); // red
      bw.code(bT.codes[b], bT.lens[b]); // blue
      bw.code(aT.codes[a], aT.lens[a]); // alpha
    } else {
      const l = VALUE_TO_CODE[tok.len];
      bw.code(gT.codes[256 + l.code], gT.lens[256 + l.code]);
      if (l.extraBits) bw.bits(l.extraVal, l.extraBits);
      const d = VALUE_TO_CODE[Math.min(tok.dist + 120, 1048576)];
      bw.code(dT.codes[d.code], dT.lens[d.code]);
      if (d.extraBits) bw.bits(d.extraVal, d.extraBits);
    }
  }
  return bw.finish();
}

// ---- container

function fourCC(tag: string, payload: Uint8Array, pad = true): Uint8Array[] {
  const head = new Uint8Array(8);
  for (let i = 0; i < 4; i++) head[i] = tag.charCodeAt(i);
  new DataView(head.buffer).setUint32(4, payload.length, true);
  const parts: Uint8Array[] = [head, payload];
  if (pad && payload.length % 2 === 1) parts.push(new Uint8Array([0]));
  return parts;
}

function u24(value: number): Uint8Array {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255]);
}

/**
 * Assemble an animated lossless WebP. Every frame is a complete, full-canvas
 * VP8L image (no blend), so transparency and pixel colors are exact.
 */
export async function buildWebp(
  r: RenderedFrames,
  scale = 1,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const { w, h, fps, n, frames } = r;
  const W = w * scale;
  const H = h * scale;
  const duration = Math.max(1, Math.round(1000 / fps));

  const chunks: Uint8Array[] = [];

  // VP8X: animation (bit 6), alpha (bit 3) when used, canvas size − 1
  let anyAlpha = false;
  for (let i = 0; i < n && !anyAlpha; i++) {
    const f = frames[i];
    for (let p = 3; p < f.length; p += 4) {
      if (f[p] < 255) {
        anyAlpha = true;
        break;
      }
    }
  }
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x02 | (anyAlpha ? 0x08 : 0);
  vp8x.set(u24(W - 1), 4);
  vp8x.set(u24(H - 1), 7);
  chunks.push(...fourCC("VP8X", vp8x));

  // ANIM: transparent background, loop forever
  chunks.push(...fourCC("ANIM", new Uint8Array(6)));

  for (let i = 0; i < n; i++) {
    const rgba = scale === 1 ? new Uint8ClampedArray(frames[i]) : upscale(frames[i], w, h, scale);
    const vp8l = encodeFrame(rgba, W, H);
    // ANMF: full-canvas frame at (0,0), no blending, keep after display
    const head = new Uint8Array(16);
    head.set(u24(W - 1), 6);
    head.set(u24(H - 1), 9);
    head.set(u24(duration), 12);
    head[15] = 0x02; // B=1 (no blend: over-write, don't alpha-blend), D=0 (keep)
    const inner = fourCC("VP8L", vp8l);
    const payload = new Uint8Array(head.length + inner.reduce((a, c) => a + c.length, 0));
    payload.set(head, 0);
    let at = head.length;
    for (const part of inner) {
      payload.set(part, at);
      at += part.length;
    }
    chunks.push(...fourCC("ANMF", payload));
    onProgress?.(i + 1, n);
    if (i % 2 === 1) await new Promise((res) => setTimeout(res, 0)); // keep the UI responsive
  }

  // RIFF header over "WEBP" + all chunks
  let size = 4;
  for (const c of chunks) size += c.length;
  const riff = new Uint8Array(12);
  riff.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  riff.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  new DataView(riff.buffer).setUint32(4, size, true);
  return new Blob([riff, ...chunks] as BlobPart[], { type: "image/webp" });
}
