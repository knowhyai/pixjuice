export type DamageGrade = "normal" | "heavy";

export const MERGE_WINDOW = 0.76;
export const NUMBER_LIFE = 1.65;

export function numberAppearance(value: number, grade: DamageGrade, numberScale: number) {
  const size = Math.min(36, 12 + Math.sqrt(value) * 1.5 + (grade === "heavy" ? 5 : 0));
  return { size: size * numberScale, color: grade === "heavy" ? "#ffcd63" : "#fff" };
}

export interface DamageStack {
  value: number;
  grade: DamageGrade;
  sinceHit: number;
}

export function mergeDamage(
  stack: DamageStack, value: number, grade: DamageGrade, chaotic: boolean,
): DamageStack | undefined {
  if (chaotic || grade !== stack.grade || stack.sinceHit > MERGE_WINDOW) return;
  return { value: stack.value + value, grade, sinceHit: 0 };
}

interface Direction { x: number; z: number }

export function numberMotion(age: number, sinceHit: number, dir: Direction, reduced: boolean) {
  if (reduced) return { x: 0, y: 0, z: 0, scale: 1 };

  const t = Math.min(age / 0.5, 1);
  const u = t - 1;
  const travel = 1 + u * u * (2.8 * u + 1.8);
  const punch = Math.min(sinceHit / 0.28, 1);
  const scale = 1 + 0.34 * Math.sin(Math.PI * punch) * (1 - punch);
  return { x: dir.x * 0.72 * travel, y: 0.48 * travel, z: dir.z * 0.72 * travel, scale };
}

interface Anchor { x: number; y: number; halfWidth: number; halfHeight: number }

// Place older numbers first and prefer a sideways shift for newer ones.
export function spreadAnchor(anchor: Anchor, placed: Anchor[], width: number, height: number): Anchor {
  const gap = 6;
  const clamp = (n: number, half: number, length: number) =>
    half * 2 >= length ? length / 2 : Math.max(half, Math.min(length - half, n));
  const x = clamp(anchor.x, anchor.halfWidth, width);
  const y = clamp(anchor.y, anchor.halfHeight, height);
  const xs = [x];
  const ys = [y];
  for (const other of placed) {
    const dx = anchor.halfWidth + other.halfWidth + gap;
    const dy = anchor.halfHeight + other.halfHeight + gap;
    xs.push(other.x - dx, other.x + dx);
    ys.push(other.y - dy, other.y + dy);
  }

  let best = { ...anchor, x, y };
  let distance = Infinity;
  for (const nextX of xs) {
    if (nextX !== clamp(nextX, anchor.halfWidth, width)) continue;
    for (const nextY of ys) {
      if (nextY !== clamp(nextY, anchor.halfHeight, height)) continue;
      const score = Math.abs(nextX - x) + 3 * Math.abs(nextY - y);
      if (score >= distance) continue;
      const overlaps = placed.some(other =>
        Math.abs(nextX - other.x) < anchor.halfWidth + other.halfWidth + gap - 0.001 &&
        Math.abs(nextY - other.y) < anchor.halfHeight + other.halfHeight + gap - 0.001);
      if (overlaps) continue;
      best = { ...anchor, x: nextX, y: nextY };
      distance = score;
    }
  }
  return best;
}
