// PixJuice SFX: 8-bit sounds generated per effect family with jsfxr
// (https://github.com/chr15m/jsfxr — a JavaScript port of sfxr by DrPetter, by
// Eric Fredricksen, maintained by Chris McCormick — The Unlicense).
// Every family maps to a hand-tuned sfxr preset; a seeded roll keeps each effect
// sounding like itself, and the same parameters render offline into a WAV.

import { sfxr } from "jsfxr";

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
  | "status"
  | "fallback";

/** Category id (from pixelfx) -> sound family. Every real category is listed; unknown ones get the fallback. */
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

/** Used for categories that aren't in the map above (a future pixelfx category, say). */
export const FALLBACK_FAMILY: SfxFamily = "fallback";

export function familyForCategory(cat: string): SfxFamily {
  return FAMILY_BY_CATEGORY[cat] ?? FALLBACK_FAMILY;
}

/** The explicit category -> family map (exposed for the preset coverage check). */
export const CATEGORY_FAMILIES: Record<string, SfxFamily> = FAMILY_BY_CATEGORY;

// ---- seeded RNG so a given effect + seed always rolls the same sound

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

// ---- jsfxr parameter presets, one per family

export interface SfxrParams {
  wave_type: number;
  p_env_attack: number;
  p_env_sustain: number;
  p_env_punch: number;
  p_env_decay: number;
  p_base_freq: number;
  p_freq_limit: number;
  p_freq_ramp: number;
  p_freq_dramp: number;
  p_vib_strength: number;
  p_vib_speed: number;
  p_arp_mod: number;
  p_arp_speed: number;
  p_duty: number;
  p_duty_ramp: number;
  p_repeat_speed: number;
  p_pha_offset: number;
  p_pha_ramp: number;
  p_lpf_freq: number;
  p_lpf_ramp: number;
  p_lpf_resonance: number;
  p_hpf_freq: number;
  p_hpf_ramp: number;
  sound_vol: number;
  sample_rate: number;
  sample_size: number;
}

// jsfxr wave types (sfxr.js: SQUARE=0, SAWTOOTH=1, SINE=2, NOISE=3)
const SQUARE = 0;
const SAWTOOTH = 1;
const SINE = 2;
const NOISE = 3;

type Rng = () => number;

const BASE: SfxrParams = {
  wave_type: SQUARE,
  p_env_attack: 0,
  p_env_sustain: 0.2,
  p_env_punch: 0.2,
  p_env_decay: 0.3,
  p_base_freq: 0.5,
  p_freq_limit: 0,
  p_freq_ramp: 0,
  p_freq_dramp: 0,
  p_vib_strength: 0,
  p_vib_speed: 0,
  p_arp_mod: 0,
  p_arp_speed: 0,
  p_duty: 0,
  p_duty_ramp: 0,
  p_repeat_speed: 0,
  p_pha_offset: 0,
  p_pha_ramp: 0,
  p_lpf_freq: 1,
  p_lpf_ramp: 0,
  p_lpf_resonance: 0,
  p_hpf_freq: 0,
  p_hpf_ramp: 0,
  sound_vol: 0.5,
  sample_rate: 44100,
  sample_size: 8,
};

function roll(base: SfxrParams, over: Partial<SfxrParams>): SfxrParams {
  return { ...base, ...over };
}

type Preset = (r: Rng) => SfxrParams;

/** jsfxr presets, tuned per PixJuice family. Ranges follow the upstream sfxr generators. */
const PRESETS: Record<SfxFamily, Preset> = {
  // explosions: noise blast, pitch tumbling down, long boom, optional flanger (sfxr "explosion")
  boom(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: NOISE,
      p_base_freq: Math.pow(0.1 + f(0.4), 2),
      p_freq_ramp: -0.2 - f(0.3),
      p_env_sustain: 0.1 + f(0.3),
      p_env_decay: 0.3 + f(0.5),
      p_env_punch: 0.3 + f(0.5),
      p_repeat_speed: r() < 0.5 ? 0.3 + f(0.4) : 0,
      p_pha_offset: r() < 0.5 ? -0.3 + f(0.9) : 0,
      p_pha_ramp: r() < 0.5 ? -f(0.3) : 0,
    });
  },
  // fire: low muffled noise bed + fast crackle retriggers
  fire(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: NOISE,
      p_base_freq: Math.pow(0.1 + f(0.3), 2),
      p_env_attack: 0.04 + f(0.08),
      p_env_sustain: 0.2 + f(0.2),
      p_env_decay: 0.5 + f(0.4),
      p_env_punch: 0.2 + f(0.3),
      p_repeat_speed: 0.5 + f(0.25),
      p_lpf_freq: 0.1 + f(0.25),
      p_lpf_ramp: -f(0.2),
      p_hpf_freq: f(0.1),
    });
  },
  // water: splash — noise sweeping up, closing low-pass
  water(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: NOISE,
      p_base_freq: 0.35 + f(0.3),
      p_freq_ramp: 0.4 + f(0.4),
      p_env_attack: 0.01 + f(0.03),
      p_env_sustain: 0.1 + f(0.15),
      p_env_decay: 0.3 + f(0.3),
      p_env_punch: 0.3 + f(0.4),
      p_lpf_freq: 0.4 + f(0.4),
      p_lpf_ramp: -0.2 - f(0.3),
      p_hpf_freq: f(0.15),
    });
  },
  // ice: crystalline hit — high narrow square, arpeggio tumbling down
  ice(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: r() < 0.5 ? SQUARE : SINE,
      p_base_freq: 0.7 + f(0.25),
      p_freq_ramp: -0.1 - f(0.2),
      p_env_sustain: f(0.06),
      p_env_decay: 0.15 + f(0.25),
      p_env_punch: 0.4 + f(0.4),
      p_duty: 0.2 + f(0.3),
      p_arp_mod: -(0.3 + f(0.4)),
      p_arp_speed: 0.25 + f(0.25),
      p_vib_strength: f(0.1),
      p_vib_speed: f(0.3),
      p_hpf_freq: f(0.1),
    });
  },
  // lightning: hard crack — harsh square dropping fast, or bright noise snap
  zap(r) {
    const f = (n: number) => r() * n;
    return r() < 0.5
      ? roll(BASE, {
          wave_type: SQUARE,
          p_base_freq: 0.55 + f(0.3),
          p_freq_ramp: -0.5 - f(0.3),
          p_env_sustain: f(0.08),
          p_env_decay: 0.15 + f(0.25),
          p_env_punch: 0.5 + f(0.4),
          p_duty: 0.3 + f(0.3),
          p_pha_offset: -0.2 + f(0.7),
          p_pha_ramp: -f(0.3),
        })
      : roll(BASE, {
          wave_type: NOISE,
          p_base_freq: 0.7 + f(0.3),
          p_freq_ramp: -0.4 - f(0.3),
          p_env_sustain: f(0.08),
          p_env_decay: 0.15 + f(0.2),
          p_env_punch: 0.6 + f(0.4),
          p_hpf_freq: 0.2 + f(0.2),
        });
  },
  // laser: the classic sfxr zap — square falling in pitch, swept duty
  laser(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: SQUARE,
      p_base_freq: 0.55 + f(0.35),
      p_freq_limit: 0.2,
      p_freq_ramp: -0.3 - f(0.35),
      p_env_sustain: 0.1 + f(0.2),
      p_env_decay: 0.1 + f(0.25),
      p_env_punch: f(0.3),
      p_duty: 0.3 + f(0.4),
      p_duty_ramp: -f(0.5),
      p_hpf_freq: f(0.2),
    });
  },
  // melee: a swing then a thud — filtered noise whoosh into a punchy body
  melee(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: NOISE,
      p_base_freq: 0.2 + f(0.2),
      p_freq_ramp: 0.5 + f(0.4),
      p_env_attack: 0.02 + f(0.04),
      p_env_sustain: 0.08 + f(0.1),
      p_env_decay: 0.3 + f(0.3),
      p_env_punch: 0.4 + f(0.4),
      p_lpf_freq: 0.5 + f(0.3),
      p_lpf_ramp: -0.3 - f(0.3),
      p_lpf_resonance: f(0.3),
    });
  },
  // impact: meaty thud — low square plunging, short and heavy (sfxr "hitHurt")
  impact(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: SQUARE,
      p_base_freq: 0.2 + f(0.3),
      p_freq_ramp: -0.3 - f(0.3),
      p_env_sustain: f(0.08),
      p_env_decay: 0.15 + f(0.25),
      p_env_punch: 0.4 + f(0.4),
      p_duty: 0.15 + f(0.35),
      p_hpf_freq: f(0.2),
    });
  },
  // projectiles: rising saw zip
  zip(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: SAWTOOTH,
      p_base_freq: 0.35 + f(0.25),
      p_freq_ramp: 0.4 + f(0.4),
      p_env_sustain: 0.05 + f(0.1),
      p_env_decay: 0.15 + f(0.2),
      p_env_punch: 0.2 + f(0.3),
      p_duty: 1,
      p_hpf_freq: f(0.15),
    });
  },
  // spawn: portal/power-up — stair-stepped pitch climb (sfxr "powerUp")
  portal(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: r() < 0.5 ? SAWTOOTH : SQUARE,
      p_base_freq: 0.2 + f(0.2),
      p_freq_ramp: 0.15 + f(0.35),
      p_repeat_speed: 0.35 + f(0.35),
      p_env_attack: f(0.05),
      p_env_sustain: 0.2 + f(0.25),
      p_env_decay: 0.25 + f(0.3),
      p_duty: f(0.6),
      p_vib_strength: r() < 0.5 ? f(0.5) : 0,
      p_vib_speed: r() < 0.5 ? f(0.5) : 0,
    });
  },
  // arcane: magic sparkle — bright square arpeggiating upward
  sparkle(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: SQUARE,
      p_base_freq: 0.7 + f(0.25),
      p_freq_ramp: f(0.2),
      p_env_sustain: f(0.08),
      p_env_decay: 0.25 + f(0.3),
      p_env_punch: 0.3 + f(0.3),
      p_duty: 0.3 + f(0.3),
      p_arp_mod: 0.2 + f(0.4),
      p_arp_speed: 0.25 + f(0.3),
      p_vib_strength: f(0.1),
      p_vib_speed: f(0.4),
    });
  },
  // holy: bell-like chime — clean sine with a long ring
  chime(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: SINE,
      p_base_freq: 0.8 + f(0.15),
      p_env_attack: 0.01 + f(0.02),
      p_env_sustain: 0.08 + f(0.12),
      p_env_decay: 0.6 + f(0.3),
      p_vib_strength: f(0.1),
      p_vib_speed: 0.2 + f(0.3),
    });
  },
  // shadow: dark drone — low saw through a heavy low-pass
  drone(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: SAWTOOTH,
      p_base_freq: 0.12 + f(0.12),
      p_freq_ramp: -0.05 - f(0.1),
      p_env_attack: 0.15 + f(0.25),
      p_env_sustain: 0.15 + f(0.2),
      p_env_decay: 0.6 + f(0.3),
      p_lpf_freq: 0.08 + f(0.14),
      p_lpf_ramp: f(0.15),
      p_lpf_resonance: 0.2 + f(0.3),
      p_vib_strength: f(0.2),
      p_vib_speed: 0.2 + f(0.3),
    });
  },
  // nature: earthy rumble — deep filtered noise
  nature(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: NOISE,
      p_base_freq: Math.pow(0.05 + f(0.12), 2),
      p_freq_ramp: -0.05 - f(0.15),
      p_env_attack: 0.03 + f(0.06),
      p_env_sustain: 0.2 + f(0.2),
      p_env_decay: 0.5 + f(0.4),
      p_env_punch: 0.2 + f(0.3),
      p_lpf_freq: 0.06 + f(0.12),
      p_lpf_resonance: f(0.3),
    });
  },
  // weather: rain — soft high noise with fast patter retriggers
  rain(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: NOISE,
      p_base_freq: 0.5 + f(0.3),
      p_env_attack: 0.1 + f(0.2),
      p_env_sustain: 0.3 + f(0.2),
      p_env_decay: 0.7 + f(0.3),
      p_repeat_speed: 0.7 + f(0.2),
      p_lpf_freq: 0.5 + f(0.4),
      p_hpf_freq: 0.1 + f(0.2),
    });
  },
  // ui: menu blip — tiny square tick (sfxr "blipSelect")
  blip(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: SQUARE,
      p_base_freq: 0.5 + f(0.25),
      p_env_sustain: 0.08 + f(0.08),
      p_env_decay: 0.12 + f(0.12),
      p_env_punch: 0.1 + f(0.2),
      p_duty: 0.25 + f(0.35),
      p_hpf_freq: 0.1,
    });
  },
  // pickups: coin — two-tone up-jump (sfxr "pickupCoin")
  coin(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: SAWTOOTH,
      p_base_freq: 0.5 + f(0.3),
      p_env_sustain: f(0.1),
      p_env_decay: 0.2 + f(0.3),
      p_env_punch: 0.3 + f(0.3),
      p_arp_mod: 0.2 + f(0.3),
      p_arp_speed: 0.5 + f(0.2),
    });
  },
  // transitions: level wipe — a saw sweep up (or down) with a trailing filter
  sweep(r) {
    const f = (n: number) => r() * n;
    const up = r() < 0.5;
    return roll(BASE, {
      wave_type: SAWTOOTH,
      p_base_freq: 0.3 + f(0.25),
      p_freq_ramp: up ? 0.4 + f(0.4) : -0.4 - f(0.4),
      p_env_attack: f(0.05),
      p_env_sustain: 0.15 + f(0.2),
      p_env_decay: 0.35 + f(0.3),
      p_lpf_freq: 0.6 + f(0.3),
      p_lpf_ramp: -0.2 - f(0.3),
      p_pha_offset: f(0.2),
      p_pha_ramp: -f(0.2),
    });
  },
  // critters: friendly chirp — sine retriggered into chip-chip-chip
  chirp(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: SINE,
      p_base_freq: 0.55 + f(0.25),
      p_freq_ramp: 0.1 + f(0.2),
      p_env_sustain: 0.03 + f(0.05),
      p_env_decay: 0.2 + f(0.15),
      p_repeat_speed: 0.75 + f(0.15),
      p_vib_strength: f(0.1),
      p_vib_speed: f(0.3),
    });
  },
  // status: aura loop — soft detuned sines with a slow shimmer
  status(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: SINE,
      p_base_freq: 0.4 + f(0.2),
      p_env_attack: 0.15 + f(0.2),
      p_env_sustain: 0.2 + f(0.2),
      p_env_decay: 0.5 + f(0.3),
      p_vib_strength: 0.1 + f(0.2),
      p_vib_speed: 0.2 + f(0.3),
    });
  },
  // fallback: neutral blip for categories without a preset of their own
  fallback(r) {
    const f = (n: number) => r() * n;
    return roll(BASE, {
      wave_type: SQUARE,
      p_base_freq: 0.4 + f(0.3),
      p_env_sustain: 0.05 + f(0.08),
      p_env_decay: 0.15 + f(0.2),
      p_env_punch: 0.2 + f(0.2),
      p_duty: 0.4 + f(0.2),
    });
  },
};

/** Every family must have a preset — checked by scripts/check-sfx-presets.mjs. */
export const SFX_FAMILIES: SfxFamily[] = Object.keys(PRESETS) as SfxFamily[];

/** Roll a family's preset with a seed: same family + seed -> same sound parameters. */
export function rollParams(family: SfxFamily, seed: number): SfxrParams {
  const preset = PRESETS[family] ?? PRESETS[FALLBACK_FAMILY];
  return preset(mulberry32(seed));
}

// ---- the user-facing dials (pitch / length / punch), applied on top of any rolled preset

export interface SfxDials {
  /** Frequency multiplier; 1 = as rolled. */
  pitch: number;
  /** Duration multiplier; 1 = as rolled. */
  length: number;
  /** Extra attack snap + sustain punch; 0 = as rolled. */
  punch: number;
}

const NEUTRAL_DIALS: SfxDials = { pitch: 1, length: 1, punch: 0 };

function applyDials(p: SfxrParams, d: SfxDials): SfxrParams {
  const cl = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const tScale = Math.sqrt(Math.max(0, d.length)); // envelope lengths grow with the square of these params
  const fScale = Math.sqrt(Math.max(0, d.pitch)); // frequency grows with the square of p_base_freq
  const punch = cl(d.punch, 0, 1);
  return {
    ...p,
    p_base_freq: cl(p.p_base_freq * fScale, 0.02, 1),
    p_freq_limit: cl(p.p_freq_limit * fScale, 0, 1),
    p_env_attack: cl(p.p_env_attack * tScale * (1 - 0.7 * punch), 0, 1),
    p_env_sustain: cl(p.p_env_sustain * tScale, 0, 1),
    p_env_decay: cl(p.p_env_decay * tScale, 0, 1),
    p_env_punch: cl(p.p_env_punch + punch * 0.5, 0, 1),
  };
}

/** How long a rendered sound lasts, in seconds (envelope total; repeats don't extend it). */
export function sfxDuration(p: SfxrParams): number {
  const sq = (v: number) => v * v;
  return (sq(p.p_env_attack) + sq(p.p_env_sustain) + sq(p.p_env_decay)) * 100000 / p.sample_rate;
}

// ---- the engine

export class SfxEngine {
  #ctx: AudioContext | null = null;
  #master: GainNode | null = null;
  volume = 0.5;
  muted = false;
  dials: SfxDials = { ...NEUTRAL_DIALS };
  /** When set (by "mutate"), overrides the effect seed so the variant sticks until reloaded. */
  variantSeed: number | null = null;

  /** Lazily create/resume the context; must be called from a user gesture at least once. */
  ensure(): AudioContext | null {
    if (typeof AudioContext === "undefined") return null;
    if (!this.#ctx) {
      this.#ctx = new AudioContext();
      this.#master = this.#ctx.createGain();
      this.#master.gain.value = this.muted ? 0 : this.volume;
      this.#master.connect(this.#ctx.destination);
    }
    if (this.#ctx.state === "suspended") void this.#ctx.resume();
    return this.#ctx;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.#master) this.#master.gain.value = this.muted ? 0 : v;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.#master) this.#master.gain.value = m ? 0 : this.volume;
  }

  setDial(k: keyof SfxDials, v: number) {
    this.dials[k] = v;
  }

  setVariantSeed(seed: number | null) {
    this.variantSeed = seed;
  }

  private def(family: SfxFamily, seed: number): SfxrParams {
    return applyDials(rollParams(family, this.variantSeed ?? seed), this.dials);
  }

  /** Fire a family preset now. Returns its duration in seconds, or 0 if audio is unavailable. */
  play(family: SfxFamily, seed: number): number {
    const ctx = this.#ctx;
    if (!ctx || !this.#master || this.muted) return 0;
    const p = this.def(family, seed);
    const src = sfxr.toWebAudio(p, ctx);
    if (!src) return 0;
    src.connect(this.#master);
    src.start();
    return sfxDuration(p);
  }

  /** The same preset (same seed + dials), rendered offline and packed as a 16-bit PCM WAV. */
  async renderWav(family: SfxFamily, seed: number): Promise<Blob> {
    const p = this.def(family, seed);
    const sr = p.sample_rate;
    const dur = sfxDuration(p) + 0.2;
    const OfflineCtx: typeof OfflineAudioContext =
      window.OfflineAudioContext ??
      (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    const ctx = new OfflineCtx(1, Math.ceil(sr * dur), sr);
    const src = sfxr.toWebAudio(p, ctx);
    if (src) {
      src.connect(ctx.destination);
      src.start();
    }
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
