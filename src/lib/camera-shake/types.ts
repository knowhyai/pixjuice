export interface ShakeParams {
  positionAmplitude: number;
  rotationAmplitude: number;
  frequency: number;
  decay: number;
  duration: number;
}

export type ShakeMode = "default" | "mine";
export type MotionPreference = "auto" | "reduce" | "allow";

export interface ShakePose {
  x: number;
  y: number;
  rotation: number; // Radians
  envelope: number;
  active: boolean;
}
