// Ambient types for the `jsfxr` npm package (github.com/chr15m/jsfxr, The Unlicense),
// which ships no TypeScript definitions. Only the pieces PixJuice uses are declared.

declare module "jsfxr" {
  /** The full sfxr parameter set, as produced by the sfxr.me "serialize" button. */
  export interface SfxrParams {
    wave_type: number; // 0 = square, 1 = sawtooth, 2 = sine, 3 = noise
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

  export const sfxr: {
    /** Render the parameter set into a (disconnected, not-started) buffer source. */
    toWebAudio(synthdef: SfxrParams, ctx: BaseAudioContext): AudioBufferSourceNode | undefined;
    /** Render the parameter set into raw (quantized) sample bytes. */
    toBuffer(synthdef: SfxrParams): number[];
  };
}
