import { STEP } from "./jump";

export const MOVE_DEFAULTS = Object.freeze({
  acceleration: 720,
  maxSpeed: 240,
  brake: 900,
  airControl: 35,
});

export type MoveParams = { -readonly [K in keyof typeof MOVE_DEFAULTS]: number };
export type MoveMode = "mine" | "default";

export const MOVE_LIMITS = {
  acceleration: [0, 2400, 20],
  maxSpeed: [60, 480, 10],
  brake: [0, 2800, 20],
  airControl: [0, 100, 5],
} as const;

export const TRACK = { width: 480, height: 192, floor: 150, left: 12, right: 468 };
export const HOP_SPEED = 260;
export const GRAVITY = 1000;

type ReleaseTrace = {
  start: number;
  end: number;
  status: "rolling" | "stopped" | "wall";
};

function approach(value: number, target: number, amount: number): number {
  return value + Math.max(-amount, Math.min(amount, target - value));
}

export class MoveRoom {
  x = 105;
  y = TRACK.floor;
  vx = 0;
  vy = 0;
  grounded = true;
  trace: ReleaseTrace | null = null;
  private driving = false;

  reset(): void {
    Object.assign(this, new MoveRoom());
  }

  step(params: Readonly<MoveParams>, direction: number, hop: boolean): void {
    if (direction === 0 && this.driving) {
      this.trace = this.vx === 0 ? null : { start: this.x, end: this.x, status: "rolling" };
    }
    this.driving = direction !== 0;
    if (this.driving && this.trace?.status === "rolling") this.trace = null;

    if (hop && this.grounded) {
      this.grounded = false;
      this.vy = -HOP_SPEED;
    }
    const airScale = params.airControl / 100;
    if (this.driving) {
      const acceleration = params.acceleration * (this.grounded ? 1 : airScale);
      this.vx = approach(this.vx, direction * params.maxSpeed, acceleration * STEP);
    } else if (this.grounded) {
      this.vx = approach(this.vx, 0, params.brake * STEP);
    }
    this.vx = Math.max(-params.maxSpeed, Math.min(params.maxSpeed, this.vx));

    const nextX = this.x + this.vx * STEP;
    this.x = Math.max(TRACK.left, Math.min(TRACK.right, nextX));
    const hitWall = nextX !== this.x;
    if (hitWall) this.vx = 0;

    if (!this.grounded) {
      this.vy += GRAVITY * STEP;
      this.y += this.vy * STEP;
      if (this.y >= TRACK.floor) {
        this.y = TRACK.floor;
        this.vy = 0;
        this.grounded = true;
      }
    }
    if (this.trace?.status === "rolling") {
      this.trace.end = this.x;
      if (this.vx === 0) this.trace.status = hitWall ? "wall" : "stopped";
    }
  }

  get stopDistance(): number {
    return this.trace ? Math.abs(this.trace.end - this.trace.start) : 0;
  }
}

export function moveParamsForMode(tune: MoveParams, mode: MoveMode): Readonly<MoveParams> {
  return mode === "default" ? MOVE_DEFAULTS : tune;
}

export function serializeMoveTune(tune: MoveParams): string {
  return `move1:${JSON.stringify(tune)}`;
}

/** This page's JSON token bypasses the compact Hit/Boss token reader. */
export function readMoveTune(search: string): MoveParams {
  const defaults = { ...MOVE_DEFAULTS };
  const token = new URLSearchParams(search).get("tune");
  if (!token?.startsWith("move1:") || token.length > 512) return defaults;
  try {
    const values = JSON.parse(token.slice(6)) as Record<string, unknown> | null;
    if (!values || typeof values !== "object") return defaults;
    const tune: MoveParams = { ...defaults };
    for (const key of Object.keys(MOVE_LIMITS) as (keyof MoveParams)[]) {
      const value = values[key];
      const [min, max, step] = MOVE_LIMITS[key];
      if (typeof value !== "number" || value < min || value > max || (value - min) % step !== 0) return defaults;
      tune[key] = value;
    }
    return tune;
  } catch {
    return defaults;
  }
}

export function moveJson(params: Readonly<MoveParams>): string {
  return JSON.stringify({
    version: 1,
    units: "pixels and seconds (airControl is a percentage)",
    ...params,
    hopSpeed: HOP_SPEED,
    gravity: GRAVITY,
    tickHz: 1 / STEP,
  }, null, 2);
}
