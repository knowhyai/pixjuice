// Three-band impact synthesis for the hit-feel demo, pure WebAudio — no audio
// files, nothing copyrighted. The same philosophy as the layered-sound layer:
//   low  → weight   (a kick-style pitch drop)
//   mid  → texture  (a band-limited noise "body")
//   high → crisp    (metallic transient pings)
// The overdone preset additionally stacks an echo tail, because the point of
// that preset is to demonstrate too much.

import type { FeelParams } from "./params";

export class ImpactAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private echo: DelayNode | null = null;
  private echoGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Must be called from a user gesture (click/keydown) the first time. */
  resume(): void {
    if (!this.ctx) {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
      // Echo path, muted unless the overdone preset turns it up.
      this.echo = this.ctx.createDelay(0.5);
      this.echo.delayTime.value = 0.09;
      this.echoGain = this.ctx.createGain();
      this.echoGain.gain.value = 0;
      this.echo.connect(this.echoGain);
      this.echoGain.connect(this.echo);
      this.echoGain.connect(this.master);
      const len = Math.floor(this.ctx.sampleRate * 0.4);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** Fire the enabled bands for one impact. */
  play(p: FeelParams): void {
    const ctx = this.ctx;
    if (!ctx || !p.sfx.on) return;
    const t = ctx.currentTime;
    const out = this.master!;
    const vol = Math.max(0.0001, p.sfx.volume);
    if (p.sfx.low) this.lowBand(t, vol, out);
    if (p.sfx.mid) this.midBand(t, vol, out);
    if (p.sfx.high) this.highBand(t, vol, out);
    if (p.overdoneExtras && this.echoGain) {
      // Turn the echo tail up for this hit only, then let it fade.
      this.echoGain.gain.cancelScheduledValues(t);
      this.echoGain.gain.setValueAtTime(0.45 * vol, t);
      this.echoGain.gain.linearRampToValueAtTime(0, t + 1.2);
    }
  }

  /** Weight: sine with a fast pitch drop, like a kick drum shell. */
  private lowBand(t: number, vol: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(36, t + 0.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  /** Texture: band-passed noise burst with a closing filter — the "meat". */
  private midBand(t: number, vol: number, out: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(1400, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(bp);
    bp.connect(g);
    g.connect(out);
    if (this.echo) g.connect(this.echo);
    src.start(t);
    src.stop(t + 0.2);
  }

  /** Crispness: two detuned metallic pings plus a tick of high noise. */
  private highBand(t: number, vol: number, out: AudioNode): void {
    const ctx = this.ctx!;
    for (const [freq, level] of [
      [3100, 0.16],
      [4650, 0.1],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq * (0.98 + Math.random() * 0.04);
      const g = ctx.createGain();
      g.gain.setValueAtTime(level * vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(g);
      g.connect(out);
      if (this.echo) g.connect(this.echo);
      osc.start(t);
      osc.stop(t + 0.1);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise!;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(hp);
    hp.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + 0.05);
  }
}
