// Staging for the /feel/hit/ duel, shared by the live demo (demo.ts) and the
// headless regression (tests/feel-facing.test.mjs): where the knights stand,
// which way they face, and where the default camera sits.
//
// Measured on the rigged knight (Node + GLTFLoader, skeleton only): the
// character looks down its local +Z — (Head − Hips) × (RightShoulder −
// LeftShoulder) ≈ (0, 0, 1) at the rest/idle pose, and the slash clip strikes
// along that +Z. Head − Hips is UP, not facing, and Mixamo hip/chest local Z is
// not forward either (at identity it points along −X), so yaws must come from
// this measurement, not from eyeballing the bones.

import * as THREE from "three";

/** Home spots: the duel runs along the X axis, contact centered at x = 0. */
export const ATTACKER_HOME = new THREE.Vector3(-0.82, 0, 0);
export const VICTIM_HOME = new THREE.Vector3(0.82, 0, 0);

// Default camera: a flank 3/4 of the clash — both profiles readable, contact in
// the middle of the frame, biased slightly toward the victim so the hit
// reaction faces the lens. demo.ts saves this (controls.saveState()) so the
// page's Reset view control returns here; a reload boots on it unchanged.
export const DEFAULT_CAMERA = {
  position: new THREE.Vector3(0.5, 1.35, 5.05),
  target: new THREE.Vector3(0, 1.02, 0),
};

// per-function scratch vectors: measuredForward's temps must never alias the
// direction a caller passes into faceAlong (that bug silently staged the duel
// back-to-back — see tests/feel-facing.test.mjs)
const measureTmp = {
  up: new THREE.Vector3(),
  right: new THREE.Vector3(),
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
};
const yawTmp = {
  fwd: new THREE.Vector3(),
  dir: new THREE.Vector3(),
};

function findBone(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  const sanitized = THREE.PropertyBinding.sanitizeNodeName(name);
  root.traverse((o) => {
    if (found || !(o as THREE.Bone).isBone) return;
    if (o.name === name || o.name === sanitized) found = o;
  });
  return found;
}

/**
 * The rig's facing, measured from the posed skeleton: the horizontal part of
 * up × right (head − hips × right shoulder − left shoulder), normalized. At the
 * rest/idle pose this is the model's local +Z.
 */
export function measuredForward(model: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  const hips = findBone(model, "mixamorig:Hips");
  const head = findBone(model, "mixamorig:Head");
  const left = findBone(model, "mixamorig:LeftShoulder");
  const right = findBone(model, "mixamorig:RightShoulder");
  if (!hips || !head || !left || !right) return out.set(0, 0, 1); // identity forward
  measureTmp.up.subVectors(head.getWorldPosition(measureTmp.a), hips.getWorldPosition(measureTmp.b));
  measureTmp.right.subVectors(right.getWorldPosition(measureTmp.a), left.getWorldPosition(measureTmp.b));
  return out.crossVectors(measureTmp.up, measureTmp.right).setY(0).normalize();
}

/**
 * Rotate `root` around Y until the rig's measured forward points along `dir`
 * (e.g. attacker→victim). Recomputed from the current world forward, so it is
 * safe to call again after either side moves or turns.
 */
export function faceAlong(root: THREE.Group, model: THREE.Object3D, dir: THREE.Vector3): void {
  yawTmp.dir.copy(dir); // measuredForward must not be able to clobber the target
  const fwd = measuredForward(model, yawTmp.fwd);
  root.rotation.y += Math.atan2(yawTmp.dir.x, yawTmp.dir.z) - Math.atan2(fwd.x, fwd.z);
  root.updateMatrixWorld(true);
}

/**
 * Stage the duel: home spots on the X axis, then yaws from the measured
 * forward so each knight faces the other (the slash strikes along that forward,
 * so the swing actually crosses the gap between them).
 */
export function placeDuelists(attackerRoot: THREE.Group, victimRoot: THREE.Group, attacker: THREE.Object3D, victim: THREE.Object3D): void {
  attackerRoot.position.copy(ATTACKER_HOME);
  victimRoot.position.copy(VICTIM_HOME);
  attackerRoot.rotation.set(0, 0, 0);
  victimRoot.rotation.set(0, 0, 0);
  attackerRoot.updateMatrixWorld(true);
  victimRoot.updateMatrixWorld(true);
  yawTmp.dir.subVectors(VICTIM_HOME, ATTACKER_HOME).setY(0).normalize();
  faceAlong(attackerRoot, attacker, yawTmp.dir);
  faceAlong(victimRoot, victim, yawTmp.dir.clone().negate());
}
