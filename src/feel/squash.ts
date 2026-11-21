// Standalone reference for scaling a struck character's visual pivot.
// Applied to a visual pivot parented under the victim's logical root, around
// the feet, so knockback / collision / the source GLB stay untouched.
// This is not IK, not a ragdoll, not local muscle, and not a soft-body solve.

import * as THREE from "three";

/** Sim-time length of the recover, after a peak that holds while dt is 0 (hit stop). Tunable default. */
export const SQUASH_DURATION = 0.36;

/** Strong enough on a whole-figure scale that on/off is obvious next to the hit clip. */
export function squashFactors(amount: number): { along: number; across: number } {
  const a = Math.min(1, Math.max(0, amount));
  return { along: 1 - 0.5 * a, across: 1 + 0.32 * a };
}

/** 1 at impact (and for the whole freeze, if t does not advance), 0 when finished. */
export function squashEnvelope(t: number, duration = SQUASH_DURATION): number {
  if (t < 0 || duration <= 0) return 0;
  if (t >= duration) return 0;
  const u = t / duration;
  const hold = 0.2;
  if (u <= hold) return 1;
  const v = (u - hold) / (1 - hold);
  return 1 - v * v * (3 - 2 * v);
}

/** Scale each local axis: compress along the impact direction, stretch the rest. Always from rest, never from the previous frame. */
export function visualScaleFromRest(
  rest: THREE.Vector3,
  worldDir: THREE.Vector3,
  boneWorldQuat: THREE.Quaternion,
  amount: number,
  envelope: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  if (amount <= 0 || envelope <= 0) return out.copy(rest);
  const f = squashFactors(amount);
  const along = 1 + (f.along - 1) * envelope;
  const across = 1 + (f.across - 1) * envelope;
  const local = worldDir.clone().normalize().applyQuaternion(boneWorldQuat.clone().invert());
  const lx = local.x * local.x;
  const ly = local.y * local.y;
  const lz = local.z * local.z;
  out.set(rest.x * (across + (along - across) * lx), rest.y * (across + (along - across) * ly), rest.z * (across + (along - across) * lz));
  return out;
}

/**
 * Squash the victim's visual pivot. Call `update` after the animation mixer
 * so the clip can play independently of this scale; a second hit replaces the
 * first instead of stacking scale. Never writes the logical / knockback root.
 */
export class VictimSquash {
  private readonly visual: THREE.Object3D;
  private readonly rest = new THREE.Vector3(1, 1, 1);
  private readonly out = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private dir = new THREE.Vector3(0, 0, 1);
  private t = Infinity;
  private active = false;

  constructor(visual: THREE.Object3D) {
    this.visual = visual;
    this.rest.copy(visual.scale);
  }

  trigger(worldDir: THREE.Vector3, enabled: boolean): void {
    this.restore();
    if (!enabled) {
      this.active = false;
      this.t = Infinity;
      return;
    }
    this.dir.copy(worldDir);
    if (this.dir.lengthSq() < 1e-8) this.dir.set(0, 0, 1);
    else this.dir.normalize();
    this.active = true;
    this.t = 0;
  }

  /** `amount` is read live so a 0 slider or an off switch is honest in the same frame. */
  update(dt: number, enabled: boolean, amount: number): void {
    if (!enabled || amount <= 0 || !this.active) {
      this.restore();
      this.active = false;
      this.t = Infinity;
      return;
    }
    this.t += dt;
    const env = squashEnvelope(this.t);
    this.restore();
    if (env <= 0) {
      this.active = false;
      this.t = Infinity;
      return;
    }
    this.visual.getWorldQuaternion(this.quat);
    visualScaleFromRest(this.rest, this.dir, this.quat, amount, env, this.out);
    this.visual.scale.copy(this.out);
  }

  restore(): void {
    this.visual.scale.copy(this.rest);
  }

  get time(): number {
    return this.t;
  }

  get isActive(): boolean {
    return this.active;
  }
}
