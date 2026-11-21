import { STEP } from "./jump";

export const SPRING_DEFAULTS = Object.freeze({ stiffness: 180, damping: 20, mass: 2 });
export const SPRING_LIMITS = { stiffness: [40, 1200, 10], damping: [2, 100, 1], mass: [1, 8, 1] } as const;
export type SpringParams = { -readonly [K in keyof typeof SPRING_DEFAULTS]: number };

type Point = { time: number; position: number };

export class SpringRoom {
  position = 0;
  velocity = 0;
  target = 0;
  peak = 0;
  time = 0;
  trace: Point[] = [];
  private sampleTick = 0;

  reset(): void {
    Object.assign(this, new SpringRoom());
  }

  toggle(): void {
    this.target = this.target === 0 ? 1 : 0;
    this.peak = 0;
    this.time = 0;
    this.sampleTick = 0;
    this.trace = [{ time: 0, position: this.position }];
  }

  get settled(): boolean { return this.position === this.target && this.velocity === 0; }

  step(params: Readonly<SpringParams>): void {
    if (this.settled) return;
    // Exact step of m*x'' + c*x' + k*(x-target)=0 for a constant target.
    // The three branches keep under-, critically and over-damped tunes finite.
    const alpha = params.damping / (2 * params.mass);
    const freq2 = params.stiffness / params.mass;
    const discriminant = alpha * alpha - freq2;
    const displacement = this.position - this.target;
    const v0 = this.velocity;
    let next: number;
    let velocity: number;

    if (Math.abs(discriminant) < 1e-8) {
      const a = v0 + alpha * displacement;
      const decay = Math.exp(-alpha * STEP);
      next = decay * (displacement + a * STEP);
      velocity = decay * (a - alpha * (displacement + a * STEP));
    } else if (discriminant < 0) {
      const w = Math.sqrt(-discriminant);
      const cosine = Math.cos(w * STEP);
      const sine = Math.sin(w * STEP);
      const decay = Math.exp(-alpha * STEP);
      next = decay * (displacement * cosine + (v0 + alpha * displacement) * sine / w);
      velocity = decay * (v0 * cosine - (alpha * v0 + freq2 * displacement) * sine / w);
    } else {
      const root = Math.sqrt(discriminant);
      const fast = -alpha - root;
      const slow = freq2 / fast;
      const a = (v0 - fast * displacement) / (slow - fast);
      const b = displacement - a;
      const slowPart = a * Math.exp(slow * STEP);
      const fastPart = b * Math.exp(fast * STEP);
      next = slowPart + fastPart;
      velocity = slow * slowPart + fast * fastPart;
    }
    this.position = this.target + next;
    this.velocity = velocity;
    this.peak = Math.max(this.peak, this.target === 1 ? this.position - 1 : -this.position);
    this.time += STEP;
    if (Math.abs(next) < 0.001 && Math.abs(velocity) < 0.002) {
      this.position = this.target;
      this.velocity = 0;
    }
    if (++this.sampleTick % 3 === 0 || this.settled) {
      this.trace.push({ time: this.time, position: this.position });
      // A bounded, four-second rolling window at 40 samples per second.
      if (this.trace.length > 161) this.trace.shift();
    }
  }
}
