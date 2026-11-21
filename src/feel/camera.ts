import { STEP } from "./jump";

export const CAMERA_DEFAULTS = Object.freeze({ smoothingMs: 0, deadzonePx: 0 });
export const CAMERA_STARTER = Object.freeze({ smoothingMs: 250, deadzonePx: 56 });
export const CAMERA_LIMITS = { smoothingMs: [0, 800, 10], deadzonePx: [0, 180, 2] } as const;
export type CameraParams = { -readonly [K in keyof typeof CAMERA_DEFAULTS]: number };
export const CAMERA_WORLD = { width: 1120, view: 480, height: 224, targetSpeed: 225 };

const half = CAMERA_WORLD.view / 2;
const maxCenter = CAMERA_WORLD.width - half;

export class CameraRoom {
  target = CAMERA_WORLD.width / 2;
  center = this.target;

  reset(): void {
    this.target = CAMERA_WORLD.width / 2;
    this.center = this.target;
  }

  get left(): number { return this.center - half; }
  get atBound(): boolean { return this.center === half || this.center === maxCenter; }

  step(params: Readonly<CameraParams>, direction: number): void {
    this.target = Math.max(12, Math.min(CAMERA_WORLD.width - 12, this.target + direction * CAMERA_WORLD.targetSpeed * STEP));
    const offset = this.target - this.center;
    const outside = Math.abs(offset) - params.deadzonePx;
    if (outside <= 0) return;
    const goal = Math.max(half, Math.min(maxCenter, this.center + Math.sign(offset) * outside));
    const response = params.smoothingMs === 0 ? 1 : -Math.expm1(-STEP * 1000 / params.smoothingMs);
    const next = this.center + (goal - this.center) * response;
    this.center = Math.abs(goal - next) < 0.01 ? goal : next;
  }
}
