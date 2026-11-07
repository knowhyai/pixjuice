// PixJuice SFX: small chip-style sounds generated with Web Audio, one recipe per effect family.
// Every preset is plain oscillators + noise + envelopes, so the same graph renders offline into a WAV.

export type SfxFamily =
  | "boom"
  | "fire"
  | "water"
  | "ice"
  | "zap"
  | "laser"
  | "melee"
  | "impact"
  | "zip"
  | "portal"
  | "sparkle"
  | "chime"
  | "drone"
  | "nature"
  | "rain"
  | "blip"
  | "coin"
  | "sweep"
  | "chirp"
  | "status";

const FAMILY_BY_CATEGORY: Record<string, SfxFamily> = {
  moves: "melee",
  fire: "fire",
  explosions: "boom",
  water: "water",
  ice: "ice",
  lightning: "zap",
  scifi: "laser",
  melee: "melee",
  impacts: "impact",
  projectiles: "zip",
  spawn: "portal",
  arcane: "sparkle",
  holy: "chime",
  shadow: "drone",
  status: "status",
  nature: "nature",
  weather: "rain",
  ui: "blip",
  pickups: "coin",
  transitions: "sweep",
  critters: "chirp",
};

export function familyForCategory(cat: string): SfxFamily {
  return FAMILY_BY_CATEGORY[cat] ?? "sparkle";
}

export function familyLabel(f: SfxFamily): string {
  const names: Record<SfxFamily, string> = {
    boom: "explosion",
    fire: "fire",
    water: "splash",
    ice: "ice",
    zap: "zap",
    laser: "laser",
    melee: "whoosh + hit",
    impact: "thud",
    zip: "zip",
    portal: "portal",
    sparkle: "magic sparkle",
    chime: "chime",
    drone: "dark drone",
    nature: "rumble",
    rain: "rain",
    blip: "blip",
    coin: "coin",
    sweep: "sweep",
    chirp: "chirp",
    status: "aura",
  };
  return names[f];
}

// ---- small seeded RNG so a given effect + seed always sounds the same

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = BaseAudioContext;

function noiseBuffer(ctx: Ctx, seconds = 1): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = mulberry32(0x9e3779b9);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  return buf;
}

interface NoiseOpts {
  type?: BiquadFilterType;
  f0?: number;
  f1?: number;
  q?: number;
  dur: number;
  vol: number;
  attack?: number;
  /** exponential gain decay constant (bigger = faster fade) */
  decay?: number;
}

/** A filtered noise burst with an exponential-ish envelope. */
function noise(ctx: Ctx, dest: AudioNode, buf: AudioBuffer, t0: number, o: NoiseOpts) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = o.type ?? "bandpass";
  flt.frequency.setValueAtTime(o.f0 ?? 800, t0);
  if (o.f1 !== undefined) flt.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
  flt.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(o.vol, t0 + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(flt).connect(g).connect(dest);
  src.start(t0, mulberry32(t0 * 1000 | 0)() * 0.9);
  src.stop(t0 + o.dur + 0.05);
}

interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  dur: number;
  vol: number;
  attack?: number;
}

/** One oscillator with a pitch glide and an envelope. */
function tone(ctx: Ctx, dest: AudioNode, t0: number, o: ToneOpts) {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f0, t0);
  if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(o.vol, t0 + (o.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.05);
}

type Preset = (ctx: Ctx, dest: AudioNode, t0: number, rng: () => number) => void;

/** How long each family sounds, so the offline WAV render is sized right. */
const PRESET_DUR: Record<SfxFamily, number> = {
  boom: 1.6, fire: 1.2, water: 0.9, ice: 0.9, zap: 0.7, laser: 0.45, melee: 0.8, impact: 0.5,
  zip: 0.4, portal: 1.1, sparkle: 1.0, chime: 1.5, drone: 1.8, nature: 1.1, rain: 2.2, blip: 0.3,
  coin: 0.5, sweep: 0.9, chirp: 0.5, status: 1.0,
};

const PRESETS: Record<SfxFamily, Preset> = {
  boom(ctx, dest, t0) {
    const n = noiseBuffer(ctx);
    tone(ctx, dest, t0, { f0: 150, f1: 32, dur: 0.55, vol: 0.85 });
    noise(ctx, dest, n, t0, { type: "highpass", f0: 1500, dur: 0.07, vol: 0.5 });
    noise(ctx, dest, n, t0, { f0: 1100, f1: 90, dur: 1.0, vol: 0.7, q: 0.6 });
    noise(ctx, dest, n, t0 + 0.15, { type: "lowpass", f0: 130, dur: 1.3, vol: 0.5, attack: 0.05 });
  },
  fire(ctx, dest, t0, rng) {
    const n = noiseBuffer(ctx);
    noise(ctx, dest, n, t0, { f0: 350, f1: 800, dur: 0.6, vol: 0.3 });
    noise(ctx, dest, n, t0, { type: "lowpass", f0: 500, dur: 1.1, vol: 0.28, attack: 0.1 });
    for (let i = 0; i < 14; i++)
      noise(ctx, dest, n, t0 + rng() * 0.95, { type: "highpass", f0: 1800 + rng() * 2500, dur: 0.02 + rng() * 0.02, vol: 0.1 + rng() * 0.16 });
  },
  water(ctx, dest, t0, rng) {
    const n = noiseBuffer(ctx);
    noise(ctx, dest, n, t0, { f0: 500, f1: 1600, dur: 0.45, vol: 0.45, q: 0.8 });
    noise(ctx, dest, n, t0 + 0.12, { f0: 1200, f1: 350, dur: 0.4, vol: 0.3, q: 1.2 });
    for (let i = 0; i < 5; i++)
      tone(ctx, dest, t0 + 0.05 + rng() * 0.5, { f0: 260 + rng() * 380, f1: 900 + rng() * 500, dur: 0.07, vol: 0.12, type: "sine" });
  },
  ice(ctx, dest, t0, rng) {
    const n = noiseBuffer(ctx);
    const base = 1800 + rng() * 300;
    [1, 1.5, 2].forEach((m, i) =>
      tone(ctx, dest, t0 + i * 0.07, { f0: base * m, dur: 0.3 - i * 0.06, vol: 0.22 - i * 0.05 }),
    );
    noise(ctx, dest, n, t0, { type: "highpass", f0: 3800, dur: 0.3, vol: 0.18 });
    noise(ctx, dest, n, t0 + 0.05, { f0: 2400, dur: 0.05, vol: 0.3, q: 3 });
  },
  zap(ctx, dest, t0) {
    const n = noiseBuffer(ctx);
    noise(ctx, dest, n, t0, { type: "highpass", f0: 900, dur: 0.16, vol: 0.7 });
    tone(ctx, dest, t0, { type: "sawtooth", f0: 1900, f1: 90, dur: 0.22, vol: 0.35 });
    tone(ctx, dest, t0 + 0.06, { type: "square", f0: 210, f1: 55, dur: 0.3, vol: 0.25 });
    tone(ctx, dest, t0 + 0.1, { f0: 85, f1: 38, dur: 0.5, vol: 0.5 });
  },
  laser(ctx, dest, t0) {
    const n = noiseBuffer(ctx);
    tone(ctx, dest, t0, { type: "square", f0: 1750, f1: 160, dur: 0.28, vol: 0.32 });
    tone(ctx, dest, t0, { type: "square", f0: 1770, f1: 164, dur: 0.28, vol: 0.2 });
    noise(ctx, dest, n, t0, { type: "highpass", f0: 3000, dur: 0.04, vol: 0.25 });
  },
  melee(ctx, dest, t0) {
    const n = noiseBuffer(ctx);
    noise(ctx, dest, n, t0, { f0: 260, f1: 2400, dur: 0.22, vol: 0.4, q: 1.4 });
    noise(ctx, dest, n, t0 + 0.22, { type: "highpass", f0: 2800, dur: 0.09, vol: 0.45 });
    tone(ctx, dest, t0 + 0.24, { f0: 130, f1: 55, dur: 0.25, vol: 0.4 });
    noise(ctx, dest, n, t0 + 0.26, { type: "lowpass", f0: 700, dur: 0.3, vol: 0.3 });
  },
  impact(ctx, dest, t0) {
    const n = noiseBuffer(ctx);
    tone(ctx, dest, t0, { f0: 110, f1: 36, dur: 0.35, vol: 0.8 });
    noise(ctx, dest, n, t0, { type: "lowpass", f0: 900, dur: 0.09, vol: 0.5 });
  },
  zip(ctx, dest, t0) {
    const n = noiseBuffer(ctx);
    noise(ctx, dest, n, t0, { f0: 1100, f1: 6200, dur: 0.22, vol: 0.4, q: 2 });
    tone(ctx, dest, t0, { f0: 700, f1: 1700, dur: 0.12, vol: 0.18 });
  },
  portal(ctx, dest, t0) {
    const n = noiseBuffer(ctx);
    tone(ctx, dest, t0, { type: "triangle", f0: 170, f1: 680, dur: 0.75, vol: 0.3, attack: 0.05 });
    tone(ctx, dest, t0, { type: "triangle", f0: 174, f1: 700, dur: 0.75, vol: 0.3, attack: 0.05 });
    noise(ctx, dest, n, t0 + 0.3, { type: "highpass", f0: 3500, dur: 0.5, vol: 0.12 });
    tone(ctx, dest, t0 + 0.7, { f0: 1046, dur: 0.35, vol: 0.16 });
  },
  sparkle(ctx, dest, t0, rng) {
    const notes = [523, 622, 784, 1046, 1244];
    notes.forEach((f, i) =>
      tone(ctx, dest, t0 + i * 0.07, { type: "triangle", f0: f * (1 + (rng() - 0.5) * 0.01), dur: 0.16, vol: 0.22 }),
    );
    tone(ctx, dest, t0 + 0.38, { f0: 1568, dur: 0.5, vol: 0.18 });
  },
  chime(ctx, dest, t0) {
    [660, 990, 1320, 1980].forEach((f, i) =>
      tone(ctx, dest, t0 + i * 0.02, { f0: f, dur: 1.3 - i * 0.2, vol: 0.22 - i * 0.04, attack: 0.01 }),
    );
    const n = noiseBuffer(ctx);
    noise(ctx, dest, n, t0, { type: "highpass", f0: 6000, dur: 0.35, vol: 0.05 });
  },
  drone(ctx, dest, t0) {
    const flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.value = 240;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t0);
    bus.gain.linearRampToValueAtTime(0.5, t0 + 0.5);
    bus.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.7);
    bus.connect(dest);
    flt.connect(bus);
    for (const f of [55, 55.7]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      osc.connect(flt);
      osc.start(t0);
      osc.stop(t0 + 1.8);
    }
    tone(ctx, dest, t0, { f0: 27.5, dur: 1.6, vol: 0.35, attack: 0.3 });
  },
  nature(ctx, dest, t0, rng) {
    const n = noiseBuffer(ctx);
    noise(ctx, dest, n, t0, { type: "lowpass", f0: 150, dur: 0.9, vol: 0.55, attack: 0.03 });
    for (let i = 0; i < 4; i++)
      noise(ctx, dest, n, t0 + 0.1 + rng() * 0.4, { f0: 700 + rng() * 500, dur: 0.06, vol: 0.16 });
  },
  rain(ctx, dest, t0) {
    const n = noiseBuffer(ctx);
    noise(ctx, dest, n, t0, { type: "highpass", f0: 500, dur: 2.0, vol: 0.22, attack: 0.4 });
    noise(ctx, dest, n, t0, { type: "lowpass", f0: 1600, dur: 2.0, vol: 0.18, attack: 0.5 });
  },
  blip(ctx, dest, t0) {
    tone(ctx, dest, t0, { type: "square", f0: 880, dur: 0.07, vol: 0.25 });
    tone(ctx, dest, t0 + 0.09, { type: "square", f0: 1318, dur: 0.12, vol: 0.25 });
  },
  coin(ctx, dest, t0) {
    tone(ctx, dest, t0, { type: "square", f0: 987.77, dur: 0.08, vol: 0.25 });
    tone(ctx, dest, t0 + 0.08, { type: "square", f0: 1318.5, dur: 0.38, vol: 0.25 });
  },
  sweep(ctx, dest, t0) {
    const n = noiseBuffer(ctx);
    noise(ctx, dest, n, t0, { f0: 220, f1: 3800, dur: 0.45, vol: 0.35, q: 1.5 });
    noise(ctx, dest, n, t0 + 0.4, { f0: 3800, f1: 220, dur: 0.4, vol: 0.3, q: 1.5 });
  },
  chirp(ctx, dest, t0) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.2, t0 + 0.02);
    g.gain.setValueAtTime(0.2, t0 + 0.26);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
    osc.connect(g).connect(dest);
    for (let i = 0; i < 9; i++)
      osc.frequency.setValueAtTime(i % 2 ? 1650 : 1350, t0 + 0.02 + i * 0.03);
    osc.start(t0);
    osc.stop(t0 + 0.45);
  },
  status(ctx, dest, t0) {
    tone(ctx, dest, t0, { f0: 396, dur: 0.9, vol: 0.16, attack: 0.15, type: "triangle" });
    tone(ctx, dest, t0, { f0: 402.5, dur: 0.9, vol: 0.16, attack: 0.15, type: "triangle" });
    const n = noiseBuffer(ctx);
    noise(ctx, dest, n, t0, { type: "highpass", f0: 5000, dur: 0.7, vol: 0.05, attack: 0.2 });
  },
};

// ---- the engine

export class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  volume = 0.5;
  muted = false;

  /** Lazily create/resume the context; must be called from a user gesture at least once. */
  ensure(): AudioContext | null {
    if (typeof AudioContext === "undefined") return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  /** Fire a family preset now. Returns its duration in seconds, or 0 if audio is unavailable. */
  play(family: SfxFamily, seed: number): number {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return 0;
    PRESETS[family](ctx, this.master, ctx.currentTime + 0.02, mulberry32(seed));
    return PRESET_DUR[family];
  }

  /** The same preset, rendered offline and packed as a 16-bit PCM WAV. */
  async renderWav(family: SfxFamily, seed: number): Promise<Blob> {
    const dur = PRESET_DUR[family] + 0.25;
    const sr = 44100;
    const OfflineCtx: typeof OfflineAudioContext =
      window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    const ctx = new OfflineCtx(2, Math.ceil(sr * dur), sr);
    const dest = ctx.createGain();
    dest.gain.value = this.muted ? 0 : Math.max(0.2, this.volume); // keep the file audible at low preview volume
    dest.connect(ctx.destination);
    PRESETS[family](ctx, dest, 0.02, mulberry32(seed));
    const buffer = await ctx.startRendering();
    return encodeWav(buffer);
  }
}

/** AudioBuffer -> 16-bit PCM WAV blob. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const chans = buffer.numberOfChannels;
  const len = buffer.length;
  const bytes = 44 + len * chans * 2;
  const out = new DataView(new ArrayBuffer(bytes));
  const str = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out.setUint8(at + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  out.setUint32(4, bytes - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, chans, true);
  out.setUint32(24, buffer.sampleRate, true);
  out.setUint32(28, buffer.sampleRate * chans * 2, true);
  out.setUint16(32, chans * 2, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, bytes - 44, true);
  const data: Float32Array[] = [];
  for (let c = 0; c < chans; c++) data.push(buffer.getChannelData(c));
  let at = 44;
  for (let i = 0; i < len; i++)
    for (let c = 0; c < chans; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      at += 2;
    }
  return new Blob([out.buffer], { type: "audio/wav" });
}

export const sfx = new SfxEngine();
