// Sound-file encoders: WAV (always), OGG/Opus (WebCodecs AudioEncoder, where the browser
// has one) and MP3 (@breezystack/lamejs — an ESM build of lamejs — imported on demand so it
// never lands in the entry bundle).

import { encodeWav } from "./sfx";

export type SfxFormat = "wav" | "ogg" | "mp3";

/** Can this browser encode OGG? AudioEncoder needs a secure context (https or localhost). */
export function oggSupported(): boolean {
  return (
    typeof window !== "undefined" && typeof AudioEncoder !== "undefined" && window.isSecureContext === true
  );
}

/** Any format can be picked in the UI; OGG is the only conditional one. */
export async function encodeSfx(buffer: AudioBuffer, fmt: SfxFormat): Promise<Blob> {
  if (fmt === "ogg") return encodeOgg(buffer);
  if (fmt === "mp3") return encodeMp3(buffer);
  return encodeWav(buffer);
}

// ---- MP3 (lamejs)

async function encodeMp3(buffer: AudioBuffer): Promise<Blob> {
  // lazy: the encoder (and its ~170KB) only loads on the first MP3 export
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const enc = new Mp3Encoder(1, buffer.sampleRate, 128);
  const pcm = buffer.getChannelData(0);
  const i16 = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const parts: Uint8Array[] = [];
  const BLOCK = 1152; // lame's frame size — feeding it exact blocks avoids internal buffering
  for (let at = 0; at < i16.length; at += BLOCK) {
    const b = enc.encodeBuffer(i16.subarray(at, at + BLOCK));
    if (b.length) parts.push(new Uint8Array(b));
  }
  const tail = enc.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  return new Blob(parts as BlobPart[], { type: "audio/mpeg" });
}

// ---- OGG (RFC 3533 pages carrying an RFC 7845 Opus stream)

/** CRC for Ogg pages: poly 0x04c11db7, init 0, no reflection (not the zip CRC). */
const OGG_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n << 24;
    for (let k = 0; k < 8; k++) c = c & 0x80000000 ? ((c << 1) ^ 0x04c11db7) >>> 0 : (c << 1) >>> 0;
    t[n] = c >>> 0;
  }
  return t;
})();

function oggCrc(d: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < d.length; i++) c = ((c << 8) ^ OGG_CRC[((c >>> 24) ^ d[i]) & 0xff]) >>> 0;
  return c >>> 0;
}

/** One Ogg page holding whole packets (each packet ≤ 65k of lacing — plenty for 20ms Opus). */
function oggPage(serial: number, seq: number, granule: number, flags: number, packets: Uint8Array[]): Uint8Array {
  const lacing: number[] = [];
  for (const p of packets) for (let n = p.length; n > 0; n -= 255) lacing.push(Math.min(255, n));
  const body = packets.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(27 + lacing.length + body);
  const dv = new DataView(out.buffer);
  out.set([0x4f, 0x67, 0x67, 0x53], 0); // "OggS"
  out[5] = flags; // 0x02 BOS, 0x04 EOS
  dv.setBigUint64(6, BigInt.asUintN(64, BigInt(Math.max(0, Math.round(granule)))), true);
  dv.setUint32(14, serial, true);
  dv.setUint32(18, seq, true);
  out[26] = lacing.length;
  out.set(lacing, 27);
  let at = 27 + lacing.length;
  for (const p of packets) {
    out.set(p, at);
    at += p.length;
  }
  dv.setUint32(22, oggCrc(out), true);
  return out;
}

/** Chrome's Opus encoder lookahead, in 48kHz samples — players trim it on decode. */
const OPUS_PRESKIP = 312;

async function encodeOgg(buffer: AudioBuffer): Promise<Blob> {
  if (!oggSupported()) throw new Error("this browser can't encode OGG (needs WebCodecs)");
  const sr = buffer.sampleRate;
  const pcm = buffer.getChannelData(0);
  const packets: { data: Uint8Array; granule: number }[] = [];
  let encErr: unknown = null;
  const enc = new AudioEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      // the granule position of a page is the 48kHz sample count at its end, preskip included
      const dur = chunk.duration ?? 0;
      const endUs = dur > 0 ? chunk.timestamp + dur : chunk.timestamp;
      packets.push({ data, granule: (endUs * 48000) / 1e6 });
    },
    error: (e) => (encErr = e),
  });
  enc.configure({ codec: "opus", sampleRate: sr, numberOfChannels: 1, bitrate: 96_000 });
  const SLICE = Math.floor(sr / 10); // feed ~100ms at a time
  for (let at = 0; at < pcm.length; at += SLICE) {
    const n = Math.min(SLICE, pcm.length - at);
    enc.encode(
      new AudioData({
        format: "f32",
        sampleRate: sr,
        numberOfFrames: n,
        numberOfChannels: 1,
        timestamp: Math.round((at / sr) * 1e6),
        data: pcm.slice(at, at + n) as unknown as BufferSource,
      }),
    );
  }
  await enc.flush();
  enc.close();
  if (encErr) throw encErr;
  if (!packets.length) throw new Error("the Opus encoder returned no audio");

  // OpusHead: magic, v1, mono, preskip, input rate, gain 0, mapping family 0
  const head = new Uint8Array(19);
  head.set([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64], 0);
  head[8] = 1;
  head[9] = 1;
  head[10] = OPUS_PRESKIP & 0xff;
  head[11] = OPUS_PRESKIP >> 8;
  new DataView(head.buffer).setUint32(12, sr, true);
  // OpusTags: magic, one vendor string, zero user comments
  const vendor = new TextEncoder().encode("PixJuice (jsfxr)");
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  tags.set([0x4f, 0x70, 0x75, 0x73, 0x54, 0x61, 0x67, 0x73], 0);
  new DataView(tags.buffer).setUint32(8, vendor.length, true);
  tags.set(vendor, 12);

  const serial = 1; // fixed: deterministic files from the same samples
  const pages: Uint8Array[] = [oggPage(serial, 0, 0, 0x02, [head]), oggPage(serial, 1, 0, 0, [tags])];
  packets.forEach((p, i) =>
    pages.push(
      oggPage(serial, 2 + i, p.granule + OPUS_PRESKIP, i === packets.length - 1 ? 0x04 : 0, [p.data]),
    ),
  );
  return new Blob(pages as BlobPart[], { type: "audio/ogg" });
}

/** Ships inside every batch ZIP: what the sounds are, and that they're free to use. */
export const SFX_LICENSE = [
  "PixJuice sound effects — license",
  "=================================",
  "",
  "These sound effects were generated in your browser with jsfxr",
  "(https://github.com/chr15m/jsfxr) — a JavaScript port of sfxr by DrPetter,",
  "by Eric Fredicksen, maintained by Chris McCormick — released under",
  "The Unlicense (public domain, https://unlicense.org).",
  "",
  "They are free to use, modify and redistribute, including in commercial",
  "games and projects. No attribution is required.",
  "",
  "MP3 files in this archive (if any) were encoded with lamejs",
  "(https://github.com/breezystack/lamejs, LGPL-3.0), used as an unmodified library.",
  "",
  "Generated with PixJuice — https://pixjuice.pages.dev",
  "",
].join("\n");
