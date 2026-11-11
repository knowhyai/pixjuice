// The /feel/hit/ arena: two rigged knights, IK-driven strikes on the attacker,
// local physical-feeling reactions on the victim, and the six juice layers
// wired to the live parameter object.
//
// The source rig ships reference-pose animation clips, so the demo is fully
// procedural on top of the skinned skeletons: a combat stance and breathing
// sway are layered over the animated pose, the attacker's arm is solved with
// a two-bone IK toward the selected hit zone, and the victim reacts through
// per-bone spring impulses — no capsules, no block people.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import type { FeelParams, HitZone } from "./params";

export interface FeelDemo {
  setParams(p: FeelParams): void;
  setZone(z: HitZone): void;
  attack(): void;
  onZonePick(cb: (z: HitZone) => void): void;
  onImpact(cb: () => void): void;
  dispose(): void;
}

const ZONE_BONES: Record<HitZone, string> = {
  head: "mixamorig:Head",
  chest: "mixamorig:Spine2",
  belly: "mixamorig:Spine",
};

/** Seconds from attack start to contact (the strike phase is built around it). */
const CONTACT_AT = 0.34;

/** Per-frame world-space reaction spring for one bone. */
interface SpringBone {
  bone: THREE.Bone;
  basePos: THREE.Vector3; // animated (+ stance) local transform, captured per frame
  baseQuat: THREE.Quaternion;
  pos: THREE.Vector3; // current world-space offset
  posVel: THREE.Vector3;
  axis: THREE.Vector3; // world rotation axis
  rot: number;
  rotVel: number;
}

const scratch = {
  q0: new THREE.Quaternion(),
  q1: new THREE.Quaternion(),
  q2: new THREE.Quaternion(),
  v0: new THREE.Vector3(),
  v1: new THREE.Vector3(),
  v2: new THREE.Vector3(),
};

/**
 * Stance offsets that survive as rotations: only the torso lean. The arms are
 * handled by IK (they hang in guard positions) because the rig's per-bone
 * local axes make axis-guess rotations unpredictable.
 */
const STANCE: { bone: string; axis: "x" | "z"; angle: number }[] = [
  { bone: "mixamorig:Spine1", axis: "x", angle: 0.06 },
];

export async function createFeelDemo(host: HTMLElement, initialParams: FeelParams): Promise<FeelDemo> {
  let params = initialParams;
  let zone: HitZone = "chest";
  const zonePickers: ((z: HitZone) => void)[] = [];
  const impactHooks: (() => void)[] = [];

  // --- host layout: canvas + DOM overlay (damage numbers, inverted flash) ----
  const hostWrap = document.createElement("div");
  hostWrap.className = "feel-host-wrap";
  const canvas = document.createElement("canvas");
  canvas.className = "feel-canvas";
  canvas.setAttribute("aria-label", "hit feel arena");
  const overlay = document.createElement("div");
  overlay.className = "feel-overlay";
  const invert = document.createElement("div");
  invert.className = "feel-invert";
  const numberLayer = document.createElement("div");
  numberLayer.className = "feel-numbers";
  overlay.append(invert, numberLayer);
  hostWrap.append(canvas, overlay);
  host.append(hostWrap);

  // --- renderer / scene -------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1.6, 0.05, 60);
  camera.position.set(0.35, 1.8, 5.5);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.95, 0);
  controls.enableDamping = true;
  controls.minDistance = 2.2;
  controls.maxDistance = 9;
  controls.maxPolarAngle = Math.PI * 0.55;

  // a small environment map so the metal armor has something to reflect —
  // without it, PBR metal reads nearly black away from the key light
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xe9f1ff, 0x55483a, 3.0));
  const key = new THREE.DirectionalLight(0xffe7bc, 3.0);
  key.position.set(4, 7, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb7ff, 1.3);
  rim.position.set(-5, 3, -4);
  scene.add(rim);
  // camera-side fill so the far duelist never reads as a silhouette
  const fill = new THREE.DirectionalLight(0xbfd2ff, 1.1);
  fill.position.set(0.4, 3, 7);
  scene.add(fill);

  // --- arena (theme-aware) ------------------------------------------------------
  const themeColors = {
    bg: new THREE.Color(),
    ground: new THREE.Color(),
    line: new THREE.Color(),
    sparkA: new THREE.Color(),
    sparkB: new THREE.Color(),
  };
  const groundMat = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(3.4, 48), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const ringMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45 });
  for (const r of [1.15, 2.3, 3.3]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 72; i++)
      pts.push(new THREE.Vector3(Math.cos((i / 72) * Math.PI * 2) * r, 0.003, Math.sin((i / 72) * Math.PI * 2) * r));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
  }
  scene.fog = new THREE.Fog(0x000000, 7.5, 15);

  function applyTheme(): void {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    themeColors.bg.set(v("--bg", "#0b0a10"));
    themeColors.ground.set(v("--panel", "#171522"));
    themeColors.line.set(v("--line", "#2b2740"));
    themeColors.sparkA.set(v("--acc", "#ff4d6d"));
    themeColors.sparkB.set(v("--acc2", "#4cd7ff"));
    scene.background = themeColors.bg;
    (scene.fog as THREE.Fog).color.copy(themeColors.bg);
    groundMat.color.copy(themeColors.ground);
    ringMat.color.copy(themeColors.line);
  }
  applyTheme();
  const themeObserver = new MutationObserver(applyTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // --- knights --------------------------------------------------------------------
  const gltf = await new GLTFLoader().loadAsync("/feel/knight.glb");
  const clips = gltf.animations;
  const idle = THREE.AnimationClip.findByName(clips, "idle") ?? clips[0];

  const attackerRoot = new THREE.Group();
  const victimRoot = new THREE.Group();
  const attacker = SkeletonUtils.clone(gltf.scene);
  const victim = SkeletonUtils.clone(gltf.scene);
  attackerRoot.add(attacker);
  victimRoot.add(victim);
  attackerRoot.position.set(-0.82, 0, 0.14);
  victimRoot.position.set(0.82, 0, -0.14);
  // orientation measured from the posed skeleton's facing (head − hips):
  // the reference pose itself turns the character, so the roots are set to
  // make each knight look at the other
  attackerRoot.rotation.y = -Math.PI / 2 + 0.06;
  victimRoot.rotation.y = Math.PI / 2 - 0.3;
  scene.add(attackerRoot, victimRoot);
  const attackerHome = attackerRoot.position.clone();
  const victimHome = victimRoot.position.clone();

  // the victim fights bare-handed; sword and shield stay on the striker
  victim.traverse((o) => {
    if (/sword|shield/i.test(o.name)) o.visible = false;
  });

  const mixerA = new THREE.AnimationMixer(attacker);
  const mixerV = new THREE.AnimationMixer(victim);
  mixerA.clipAction(idle).play();
  mixerV.clipAction(idle).play();

  const boneMap = new Map<THREE.Object3D, Map<string, THREE.Bone>>();
  function bone(root: THREE.Object3D, name: string): THREE.Bone | undefined {
    let map = boneMap.get(root);
    if (!map) {
      map = new Map();
      root.traverse((o) => {
        if (o instanceof THREE.Bone) {
          map!.set(o.name, o);
          map!.set(THREE.PropertyBinding.sanitizeNodeName(o.name), o);
        }
      });
      boneMap.set(root, map);
    }
    // GLTFLoader sanitizes node names ("mixamorig:Hips" → "mixamorigHips"),
    // so accept both the raw and the sanitized spelling.
    return map.get(name) ?? map.get(THREE.PropertyBinding.sanitizeNodeName(name));
  }
  const zoneBone = (z: HitZone): THREE.Bone => bone(victim, ZONE_BONES[z]) ?? (bone(victim, "mixamorig:Hips") as THREE.Bone);

  // victim materials for the flash layer
  const victimMats: THREE.MeshStandardMaterial[] = [];
  victim.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const std = m as THREE.MeshStandardMaterial;
        if (std.isMeshStandardMaterial && !victimMats.includes(std)) victimMats.push(std);
      }
    }
  });

  // --- stance + breathing sway (applied after the mixer, before the springs) ----
  // Per-bone local axes are arbitrary in this rig, so stance offsets are
  // expressed in the HIPS frame — the character's own posed frame — and
  // conjugated through each bone's parent into bone space.
  const axisVecs = { x: new THREE.Vector3(1, 0, 0), z: new THREE.Vector3(0, 0, 1) };
  const hipsFrameQ = new THREE.Quaternion();
  function applyStance(root: THREE.Object3D, isVictim: boolean, t: number, ikFade: number): void {
    const hips = bone(root, "mixamorig:Hips");
    if (!hips) return;
    hips.getWorldQuaternion(hipsFrameQ);
    for (const s of STANCE) {
      const b = bone(root, s.bone);
      if (!b) continue;
      let angle = s.angle;
      if (s.bone === "mixamorig:Spine1") angle += 0.02 * Math.sin(t * 1.7 + (isVictim ? 2.1 : 0));
      void ikFade;
      const parent = b.parent as THREE.Object3D;
      parent.getWorldQuaternion(scratch.q1);
      // character-frame axis → world, then conjugate through the parent
      scratch.v1.copy(axisVecs[s.axis]).applyQuaternion(hipsFrameQ);
      scratch.q2.setFromAxisAngle(scratch.v1, angle);
      scratch.q0.copy(scratch.q1).invert().multiply(scratch.q2).multiply(scratch.q1);
      b.quaternion.premultiply(scratch.q0);
    }
  }

  // --- victim local reactions: springs on the torso/neck/head chain ------------
  const springs: SpringBone[] = [];
  const addSpring = (name: string): SpringBone | null => {
    const b = bone(victim, name);
    if (!b) return null;
    const s: SpringBone = {
      bone: b,
      basePos: b.position.clone(),
      baseQuat: b.quaternion.clone(),
      pos: new THREE.Vector3(),
      posVel: new THREE.Vector3(),
      axis: new THREE.Vector3(1, 0, 0),
      rot: 0,
      rotVel: 0,
    };
    springs.push(s); // hierarchy order: hips → spine → spine1 → spine2 → neck → head
    return s;
  };
  const S = {
    hips: addSpring("mixamorig:Hips"),
    spine: addSpring("mixamorig:Spine"),
    spine1: addSpring("mixamorig:Spine1"),
    spine2: addSpring("mixamorig:Spine2"),
    neck: addSpring("mixamorig:Neck"),
    head: addSpring("mixamorig:Head"),
  };

  /**
   * Per-zone reaction, as impulses on the springs. Belly: the torso caves in
   * and the head tips toward the strike. Chest: the ribcage rocks back and the
   * chin lifts. Head: whiplash down the neck. The squash sub-toggle scales the
   * exaggeration; a base reaction always plays so the hit always lands.
   */
  function impulseZone(z: HitZone, dir: THREE.Vector3): void {
    const k = params.feedback.on && params.feedback.squash ? 0.5 + params.feedback.squashAmount : 0.5;
    const across = scratch.v0.crossVectors(scratch.v1.set(0, 1, 0), dir).normalize().clone();
    const kick = (s: SpringBone | null, meters: number, deg: number) => {
      if (!s) return;
      s.posVel.addScaledVector(dir, meters * 30);
      s.axis.copy(across);
      s.rotVel += (deg * Math.PI) / 180 * 16;
    };
    if (z === "belly") {
      kick(S.spine, 0.1 * k, 15 * k); // belly caves in, torso folds over it
      kick(S.spine1, 0.05 * k, 9 * k);
      kick(S.head, -0.045 * k, -13 * k); // head tips forward into the strike
    } else if (z === "chest") {
      kick(S.spine2, 0.09 * k, -16 * k); // ribcage rocks back
      kick(S.spine1, 0.05 * k, -9 * k);
      kick(S.head, 0.03 * k, 11 * k); // chin lifts
    } else {
      kick(S.head, 0.12 * k, 21 * k); // whiplash
      kick(S.neck, 0.045 * k, 9 * k);
      kick(S.spine2, 0.03 * k, 5 * k);
    }
  }

  // --- knockback: fast out, constant deceleration, hard stop ------------------
  const kbVel = new THREE.Vector3();
  let kbDecel = 0;
  let kbPhase: "idle" | "fly" | "hold" | "return" = "idle";
  let kbTimer = 0;

  // --- directional VFX ------------------------------------------------------------
  const MAX_SPARKS = 220;
  const sparkPos = new Float32Array(MAX_SPARKS * 3);
  const sparkBase = new Float32Array(MAX_SPARKS * 3); // per-particle base color
  const sparkCol = new Float32Array(MAX_SPARKS * 3);
  const sparkVel = new Float32Array(MAX_SPARKS * 3);
  const sparkLife = new Float32Array(MAX_SPARKS);
  for (let i = 0; i < MAX_SPARKS; i++) sparkPos[i * 3 + 1] = -10;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
  const sparkMat = new THREE.PointsMaterial({
    size: 0.045,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);

  const shockMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shock = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 48), shockMat);
  shock.visible = false;
  scene.add(shock);
  let shockAge = 1;

  function spawnSparks(point: THREE.Vector3, dir: THREE.Vector3, count: number): void {
    let spawned = 0;
    for (let i = 0; i < MAX_SPARKS && spawned < count; i++) {
      if (sparkLife[i] > 0) continue;
      spawned++;
      const speed = 2.2 + Math.random() * 3.4;
      const spread = 0.55; // cone around the force direction, not a sphere
      scratch.v0
        .copy(dir)
        .add(scratch.v1.set((Math.random() * 2 - 1) * spread, (Math.random() * 2 - 1) * spread + 0.22, (Math.random() * 2 - 1) * spread))
        .normalize()
        .multiplyScalar(speed);
      sparkPos.set([point.x, point.y, point.z], i * 3);
      sparkVel.set([scratch.v0.x, scratch.v0.y, scratch.v0.z], i * 3);
      sparkLife[i] = 0.22 + Math.random() * 0.32;
      const c = Math.random() < 0.62 ? themeColors.sparkA : themeColors.sparkB;
      sparkBase.set([c.r, c.g, c.b], i * 3);
    }
  }

  // --- damage numbers (DOM layer, projected each frame) -------------------------
  interface DmgNum {
    el: HTMLDivElement;
    anchor: THREE.Vector3;
    age: number;
    life: number;
  }
  const dmgNums: DmgNum[] = [];
  const dmgValue = () => (params.overdoneExtras ? 999 : params.heavyFinisher ? 46 : 18);
  function spawnNumber(point: THREE.Vector3, big: boolean, text?: string): void {
    if (!(params.feedback.on && params.feedback.numbers)) return;
    const el = document.createElement("div");
    el.className = "feel-dmg" + (big ? " feel-dmg-big" : "");
    el.textContent = text ?? String(dmgValue());
    el.style.fontSize = `${(big ? 21 : 13) * params.feedback.numberScale}px`;
    numberLayer.append(el);
    dmgNums.push({
      el,
      anchor: point
        .clone()
        .add(scratch.v0.set((Math.random() - 0.5) * 0.55, 0.3 + Math.random() * 0.35, (Math.random() - 0.5) * 0.3)),
      age: 0,
      life: big ? 1.1 : 0.85,
    });
  }

  // --- arm IK: both knights, both arms -----------------------------------------
  // The rig's reference pose holds the arms out along the character's forward
  // axis, and its per-bone local axes are arbitrary — so instead of guessing
  // rotation axes, every arm is SOLVED toward a world-space target: guard
  // positions at rest, the choreographed strike path for the swinging arm.
  const ARMS: Record<"attR" | "attL" | "vicR" | "vicL", { upper?: THREE.Bone; fore?: THREE.Bone; hand?: THREE.Bone; side: number }> = {
    attR: { upper: bone(attacker, "mixamorig:RightArm"), fore: bone(attacker, "mixamorig:RightForeArm"), hand: bone(attacker, "mixamorig:RightHand"), side: 1 },
    attL: { upper: bone(attacker, "mixamorig:LeftArm"), fore: bone(attacker, "mixamorig:LeftForeArm"), hand: bone(attacker, "mixamorig:LeftHand"), side: -1 },
    vicR: { upper: bone(victim, "mixamorig:RightArm"), fore: bone(victim, "mixamorig:RightForeArm"), hand: bone(victim, "mixamorig:RightHand"), side: 1 },
    vicL: { upper: bone(victim, "mixamorig:LeftArm"), fore: bone(victim, "mixamorig:LeftForeArm"), hand: bone(victim, "mixamorig:LeftHand"), side: -1 },
  };
  const ik = {
    upperPos: new THREE.Vector3(),
    forePos: new THREE.Vector3(),
    handPos: new THREE.Vector3(),
    elbow: new THREE.Vector3(),
    target: new THREE.Vector3(),
    dir: new THREE.Vector3(),
    pole: new THREE.Vector3(),
    rot: new THREE.Quaternion(),
    worldQ: new THREE.Quaternion(),
  };

  /**
   * Two-bone IK in world space for one arm chain, blended by weight: the
   * shoulder and forearm rotate toward the law-of-cosines solution, so the
   * base pose keeps its shape and only the reach is solved.
   */
  function solveArm(arm: { upper?: THREE.Bone; fore?: THREE.Bone; hand?: THREE.Bone }, target: THREE.Vector3, weight: number, poleBias: number): void {
    const { upper, fore, hand } = arm;
    if (!upper || !fore || !hand || weight < 0.002) return;
    upper.getWorldPosition(ik.upperPos);
    fore.getWorldPosition(ik.forePos);
    hand.getWorldPosition(ik.handPos);
    ik.dir.copy(target).sub(ik.upperPos);
    const dist = ik.dir.length();
    if (dist < 1e-4) return;
    ik.dir.normalize();
    ik.target.copy(ik.upperPos).addScaledVector(ik.dir, dist);

    const l1 = ik.upperPos.distanceTo(ik.forePos);
    const l2 = ik.forePos.distanceTo(ik.handPos);
    const reach = THREE.MathUtils.clamp(ik.upperPos.distanceTo(ik.target), Math.abs(l1 - l2) + 0.015, l1 + l2 - 0.015);
    // elbow hint: down and slightly behind the shoulder (poleBias nudges the
    // strike arm's elbow outward so the swing reads from the side)
    ik.pole.set(poleBias, -1, -0.15).sub(scratch.v0.copy(ik.dir).multiplyScalar(ik.pole.dot(ik.dir)));
    if (ik.pole.lengthSq() < 1e-6) ik.pole.set(0, -1, 0);
    ik.pole.normalize();
    const x = (l1 * l1 + reach * reach - l2 * l2) / (2 * reach);
    const h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
    ik.elbow.copy(ik.upperPos).addScaledVector(ik.dir, x).addScaledVector(ik.pole, h);

    // Aim each bone along its solved direction. The desired world orientation
    // is built from the bone's +Y convention and blended in local space —
    // from-to deltas go degenerate when the arm must reverse direction.
    aimBone(upper, scratch.v0.copy(ik.elbow).sub(ik.upperPos).normalize(), weight);
    aimBone(fore, scratch.v1.copy(ik.target).sub(ik.elbow).normalize(), weight);
  }

  const boneUp = new THREE.Vector3(0, 1, 0);
  function aimBone(b: THREE.Bone, dirWorld: THREE.Vector3, weight: number): void {
    if (dirWorld.lengthSq() < 1e-8) return;
    dirWorld.normalize();
    if (dirWorld.dot(boneUp) < -0.999) {
      // pointing straight down: pick any stable perpendicular to avoid the
      // degenerate from-to case
      dirWorld.x += 0.01;
      dirWorld.normalize();
    }
    const parent = b.parent as THREE.Object3D;
    parent.getWorldQuaternion(scratch.q1);
    scratch.q2.setFromUnitVectors(boneUp, dirWorld); // desired world orientation
    scratch.q0.copy(scratch.q1).invert().multiply(scratch.q2); // ...as local
    b.quaternion.slerp(scratch.q0, weight);
  }

  /** Resting hand position: beside the body, slightly toward the opponent. */
  function guardPosition(arm: { upper?: THREE.Bone; side: number }, self: THREE.Object3D, opponent: THREE.Object3D, out: THREE.Vector3): void {
    if (!arm.upper) return;
    arm.upper.getWorldPosition(out);
    const toward = scratch.v0.subVectors(opponent.position, self.position).setY(0).normalize();
    const lateral = scratch.v1.crossVectors(scratch.v2.set(0, 1, 0), toward).multiplyScalar(arm.side * 0.14);
    out.add(toward.multiplyScalar(0.1)).add(lateral);
    out.y -= 0.52; // hand hangs below the shoulder
  }

  // --- attack choreography ----------------------------------------------------------
  // Fully procedural swing: windup raises the arm through the IK target, the
  // strike sweeps it to the zone, the impact freezes/recoils, the recover eases
  // back to the stance.
  let attacking = false;
  let attackT = 0;
  let contactFired = false;
  let ikWeight = 0;
  let armRecoil = 0;
  const restHand = new THREE.Vector3();
  const windupPos = new THREE.Vector3();
  const strikeTarget = new THREE.Vector3();
  const guardA = new THREE.Vector3();
  const guardB = new THREE.Vector3();
  let haveRest = false;

  let timeScale = 1;
  let freezeLeft = 0; // real seconds of hit stop remaining
  let slowLeft = 0; // real seconds of heavy slow motion remaining
  let trauma = 0;
  let flashLevel = 0;
  let flashStrobe = 0;

  function attack(): void {
    if (attacking) return;
    attacking = true;
    attackT = 0;
    contactFired = false;
    armRecoil = 0;
    strikeTarget.set(0, 0, 0); // re-aim at the currently selected zone
  }

  function fireImpact(): void {
    const dir = scratch.v0.subVectors(victimRoot.position, attackerRoot.position).setY(0).normalize().clone();
    zoneBone(zone).getWorldPosition(scratch.v1);
    const impactPoint = scratch.v1.clone();

    // 1 — hit stop (heavy finisher chains slow motion after the freeze)
    if (params.hitStop.on && params.hitStop.frames > 0) {
      freezeLeft = params.hitStop.frames / 60;
      timeScale = 0;
    }
    // 2 — screen shake
    if (params.shake.on) trauma = Math.min(1, trauma + params.shake.trauma);
    // 3 — flash / local reaction / numbers
    if (params.feedback.on && params.feedback.flash) {
      flashLevel = params.feedback.flashIntensity;
      if (params.overdoneExtras) flashStrobe = 3;
    }
    impulseZone(zone, dir);
    spawnNumber(impactPoint, true);
    if (params.overdoneExtras) {
      const extras = ["+12.7", "CRIT!", "×3", "27.3", "MAX", "!!!"];
      extras.forEach((text, i) => setTimeout(() => spawnNumber(impactPoint, i % 2 === 0, text), 60 + i * 55));
    }
    // 4 — knockback: fast launch, constant deceleration, full stop
    if (params.knockback.on && params.knockback.distance > 0) {
      kbVel.copy(dir).setLength((2 * params.knockback.distance) / params.knockback.stopTime);
      kbDecel = kbVel.length() / params.knockback.stopTime;
      kbPhase = "fly";
    }
    // 5 — directional sparks and shockwave
    if (params.vfx.on) {
      spawnSparks(impactPoint, dir, params.vfx.sparks);
      if (params.vfx.shockwave) {
        shock.visible = true;
        shockAge = 0;
        shock.position.copy(impactPoint);
        shock.quaternion.setFromUnitVectors(scratch.v2.set(0, 0, 1), dir);
        shockMat.color.copy(themeColors.sparkB);
      }
    }
    // arm recoil: the strike meets mass and the arm gives a few centimetres
    armRecoil = 0.05 + params.feedback.squashAmount * 0.08;
    // heavy finisher — inverted flash + slow motion
    if (params.heavyFinisher) {
      slowLeft = 0.26;
      invert.animate([{ opacity: 0 }, { opacity: 0.85 }, { opacity: 0 }], { duration: 150, easing: "ease-out" });
    }
    impactHooks.forEach((f) => f());
  }

  /** Windup/strike/recover curve. Returns the IK weight for this frame. */
  function choreograph(dt: number): void {
    if (!attacking) {
      ikWeight += (0 - ikWeight) * Math.min(1, dt * 10);
      armRecoil = Math.max(0, armRecoil - dt * 0.5);
      return;
    }
    attackT += dt;
    if (!contactFired && attackT >= CONTACT_AT) {
      contactFired = true;
      fireImpact();
    }
    const t = attackT;
    if (t < 0.24) {
      // windup: raise the arm, weight climbs part-way
      const w = t / 0.24;
      ikWeight = 0.85 * easeOut(w);
    } else if (t < CONTACT_AT) {
      // strike: full commitment, fast sweep
      ikWeight = 1;
    } else if (t < CONTACT_AT + 0.4) {
      // hold through the freeze, then the recoil spring relaxes
      ikWeight = 1;
      armRecoil = Math.max(0, armRecoil - dt * 0.35);
    } else if (t < CONTACT_AT + 0.95) {
      // recover: hand the arm back to the stance
      const w = (t - CONTACT_AT - 0.4) / 0.55;
      ikWeight = 1 - easeInOut(w);
      armRecoil = Math.max(0, armRecoil - dt * 0.5);
    } else {
      attacking = false;
      ikWeight = 0;
      armRecoil = 0;
    }
    // a small lunge sells the commitment; it eases back during recovery
    const lungeDir = scratch.v0.subVectors(victimRoot.position, attackerHome).setY(0).normalize();
    const lunge =
      t < 0.24 ? 0.02 * easeOut(t / 0.24) - 0.05 * easeOut(t / 0.24) : t < CONTACT_AT ? 0.16 * easeIn((t - 0.24) / (CONTACT_AT - 0.24)) - 0.03 : t < CONTACT_AT + 0.4 ? 0.13 : Math.max(0, 0.13 - 0.13 * easeInOut((t - CONTACT_AT - 0.4) / 0.55));
    attackerRoot.position.copy(attackerHome).addScaledVector(lungeDir, lunge);
  }

  /** The IK target path: rest → raised windup → the struck zone. */
  function ikTarget(out: THREE.Vector3): void {
    zoneBone(zone).getWorldPosition(out);
    const towardAttacker = scratch.v1.subVectors(attackerRoot.position, victimRoot.position).setY(0).normalize();
    out.addScaledVector(towardAttacker, 0.17 + armRecoil); // just in front of the body
    if (!attacking || attackT >= CONTACT_AT) return; // on/after contact: aim at the zone
    if (!haveRest) {
      guardPosition(ARMS.attR, attackerRoot, victimRoot, restHand);
      haveRest = true;
    }
    const t = attackT;
    if (t < 0.24) {
      // windup position: high and behind, relative to the resting hand
      if (windupPos.lengthSq() === 0) {
        windupPos
          .copy(restHand)
          .add(new THREE.Vector3(0, 0.5, 0))
          .addScaledVector(towardAttaker0, -0.28);
      }
      const w = easeOut(t / 0.24);
      out.lerpVectors(restHand, windupPos, w);
    } else {
      const w = easeIn(Math.min(1, (t - 0.24) / (CONTACT_AT - 0.24)));
      if (strikeTarget.lengthSq() === 0) strikeTarget.copy(out);
      out.lerpVectors(windupPos.lengthSq() === 0 ? restHand : windupPos, strikeTarget, w);
    }
  }

  const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 2);
  const easeIn = (x: number) => Math.pow(Math.min(1, Math.max(0, x)), 2);
  const easeInOut = (x: number) => {
    const c = Math.min(1, Math.max(0, x));
    return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
  };
  /** attacker→victim horizontal direction, captured once for the windup path */
  const towardAttaker0 = new THREE.Vector3();

  // --- pointer: click = attack; clicking the victim picks the nearest zone ------
  let downAt = { x: 0, y: 0, t: 0 };
  const raycaster = new THREE.Raycaster();
  canvas.addEventListener("pointerdown", (e) => {
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener("pointerup", (e) => {
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    if (moved > 6 || performance.now() - downAt.t > 400) return; // that was a drag
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1),
      camera,
    );
    const hits = raycaster.intersectObject(victim, true);
    if (hits.length) {
      const p = hits[0].point;
      let best: HitZone = "chest";
      let bestD = Infinity;
      for (const z of ["head", "chest", "belly"] as HitZone[]) {
        zoneBone(z).getWorldPosition(scratch.v0);
        const d = scratch.v0.distanceToSquared(p);
        if (d < bestD) {
          bestD = d;
          best = z;
        }
      }
      zone = best;
      zonePickers.forEach((f) => f(best));
    }
    attack();
  });

  // --- resize -------------------------------------------------------------------------
  const resize = new ResizeObserver(() => {
    const w = Math.max(1, hostWrap.clientWidth);
    const h = Math.max(1, Math.round(w * 0.66));
    renderer.setSize(w, h, false);
    canvas.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
  resize.observe(hostWrap);

  // --- main loop ----------------------------------------------------------------------
  let lastReal = performance.now();
  let disposed = false;
  let simClock = 0;
  const camBase = new THREE.Vector3();

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const realDt = Math.min((now - lastReal) / 1000, 0.1);
    lastReal = now;

    // real-time bookkeeping: the freeze clock and shake decay must run on
    // unscaled time, or the hit stop would freeze the shake and itself
    if (freezeLeft > 0) {
      freezeLeft -= realDt;
      if (freezeLeft <= 0) {
        freezeLeft = 0;
        timeScale = slowLeft > 0 ? 0.3 : 1;
      }
    } else if (slowLeft > 0) {
      slowLeft -= realDt;
      if (slowLeft <= 0) {
        slowLeft = 0;
        timeScale = 1;
      }
    }
    const shakeDecay = params.shake.on ? params.shake.decay : 4;
    trauma = Math.max(0, trauma - shakeDecay * realDt * (0.3 + trauma));

    const dt = realDt * timeScale;
    simClock += dt;

    mixerA.update(dt);
    mixerV.update(dt);

    choreograph(dt);
    if (towardAttaker0.lengthSq() === 0)
      towardAttaker0.subVectors(victimRoot.position, attackerHome).setY(0).normalize();

    // stance + sway (after the mixer, before springs/IK so everything stacks)
    applyStance(attacker, false, simClock, ikWeight);
    applyStance(victim, true, simClock, 0);

    // arms: both knights rest in guard; the striker's right arm follows the
    // choreographed path, blended from its guard position
    guardPosition(ARMS.attR, attackerRoot, victimRoot, guardA);
    ikTarget(scratch.v2);
    guardA.lerp(scratch.v2, ikWeight);
    solveArm(ARMS.attR, guardA, 0.88 + 0.12 * ikWeight, 0.45);
    guardPosition(ARMS.attL, attackerRoot, victimRoot, guardB);
    solveArm(ARMS.attL, guardB, 0.85, -0.45);
    guardPosition(ARMS.vicR, victimRoot, attackerRoot, guardA);
    solveArm(ARMS.vicR, guardA, 0.85, 0.45);
    guardPosition(ARMS.vicL, victimRoot, attackerRoot, guardB);
    solveArm(ARMS.vicL, guardB, 0.85, -0.45);

    // springs: capture the posed transform, then write pose + world offsets
    for (const s of springs) {
      s.basePos.copy(s.bone.position);
      s.baseQuat.copy(s.bone.quaternion);

      const stiffness = 170;
      const damping = 13;
      s.posVel.addScaledVector(s.pos, -stiffness * dt).addScaledVector(s.posVel, -damping * dt);
      s.pos.addScaledVector(s.posVel, dt);
      s.rotVel += (-stiffness * s.rot - damping * s.rotVel) * dt;
      s.rot += s.rotVel * dt;

      const parent = s.bone.parent as THREE.Object3D;
      // Conjugate the world-axis rotation into bone space:
      // localNew = parentWorld⁻¹ · R · parentWorld · localAnimated
      parent.getWorldQuaternion(scratch.q1);
      scratch.q0.copy(scratch.q1).invert();
      scratch.q2.setFromAxisAngle(s.axis, s.rot);
      scratch.q2.premultiply(scratch.q0).multiply(scratch.q1);
      s.bone.quaternion.copy(s.baseQuat).premultiply(scratch.q2);
      // position offset: world delta expressed in the parent's frame
      scratch.v2.copy(s.pos).applyQuaternion(scratch.q0);
      s.bone.position.copy(s.basePos).add(scratch.v2);
    }

    // knockback profile: constant deceleration to a full stop, then walk back
    if (kbPhase === "fly") {
      const speed = kbVel.length();
      const drop = kbDecel * dt;
      if (speed <= drop + 0.02) {
        kbVel.set(0, 0, 0);
        kbPhase = "hold";
        kbTimer = 0.32;
      } else {
        kbVel.setLength(speed - drop);
        victimRoot.position.addScaledVector(kbVel, dt);
      }
    } else if (kbPhase === "hold") {
      kbTimer -= dt;
      if (kbTimer <= 0) kbPhase = "return";
    } else if (kbPhase === "return") {
      victimRoot.position.lerp(victimHome, Math.min(1, dt * 3.4));
      if (victimRoot.position.distanceToSquared(victimHome) < 1e-4) {
        victimRoot.position.copy(victimHome);
        kbPhase = "idle";
      }
    }

    // flash decay on sim time: the flash holds through the freeze on purpose
    if (flashLevel > 0 || flashStrobe > 0) {
      if (flashLevel > 0) {
        flashLevel = Math.max(0, flashLevel - dt * (params.overdoneExtras ? 5.5 : 3.2));
      } else if (flashStrobe > 0) {
        flashStrobe--;
        flashLevel = params.feedback.flashIntensity;
      }
      for (const m of victimMats) m.emissive.setScalar(flashLevel);
    } else if (victimMats.length && victimMats[0].emissive.r > 0.0001) {
      for (const m of victimMats) m.emissive.setScalar(0);
    }

    // sparks on sim time
    let liveSparks = false;
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (sparkLife[i] <= 0) continue;
      liveSparks = true;
      sparkLife[i] -= dt;
      const o = i * 3;
      sparkVel[o + 1] -= 6.5 * dt;
      sparkPos[o] += sparkVel[o] * dt;
      sparkPos[o + 1] += sparkVel[o + 1] * dt;
      sparkPos[o + 2] += sparkVel[o + 2] * dt;
      if (sparkPos[o + 1] < 0.012) {
        sparkPos[o + 1] = 0.012;
        sparkVel[o + 1] *= -0.35;
        sparkVel[o] *= 0.72;
        sparkVel[o + 2] *= 0.72;
      }
      const fade = sparkLife[i] <= 0 ? 0 : Math.min(1, sparkLife[i] * 3.2);
      sparkCol[o] = sparkBase[o] * fade;
      sparkCol[o + 1] = sparkBase[o + 1] * fade;
      sparkCol[o + 2] = sparkBase[o + 2] * fade;
      if (sparkLife[i] <= 0) sparkPos[o + 1] = -10;
    }
    if (liveSparks) {
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;
    }

    // shockwave ring, perpendicular to the force
    if (shock.visible) {
      shockAge += dt;
      const t = Math.min(1, shockAge / 0.22);
      shock.scale.setScalar(0.32 + t * 2.6);
      shockMat.opacity = (1 - t) * 0.85;
      if (t >= 1) shock.visible = false;
    }

    // damage numbers ride the sim clock (they freeze with the world)
    if (dmgNums.length) {
      const rect = canvas.getBoundingClientRect();
      for (let i = dmgNums.length - 1; i >= 0; i--) {
        const d = dmgNums[i];
        d.age += dt;
        d.anchor.y += dt * 0.5;
        scratch.v0.copy(d.anchor).project(camera);
        d.el.style.left = `${((scratch.v0.x + 1) / 2) * rect.width}px`;
        d.el.style.top = `${((1 - scratch.v0.y) / 2) * rect.height}px`;
        d.el.style.opacity = scratch.v0.z < 1 ? String(Math.max(0, 1 - d.age / d.life)) : "0";
        if (d.age >= d.life) {
          d.el.remove();
          dmgNums.splice(i, 1);
        }
      }
    }

    // camera: orbit first, then shake on top — trauma² amplitude, smooth
    // layered sines (never per-frame random), biased along the attack line
    controls.update();
    camBase.copy(camera.position);
    if (trauma > 0.001) {
      const s = trauma * trauma;
      const t = now / 1000;
      scratch.v0.subVectors(victimRoot.position, attackerRoot.position).setY(0).normalize();
      camera.position.addScaledVector(scratch.v0, -s * 0.2);
      camera.position.x += s * 0.085 * Math.sin(t * 39);
      camera.position.y += s * 0.065 * Math.cos(t * 47);
      camera.rotateZ(s * 0.03 * Math.sin(t * 31));
    }
    renderer.render(scene, camera);
    camera.position.copy(camBase);
  });

  hostWrap.dataset.ready = "1";

  return {
    setParams(p) {
      params = p;
    },
    setZone(z) {
      zone = z;
    },
    attack,
    onZonePick(cb) {
      zonePickers.push(cb);
    },
    onImpact(cb) {
      impactHooks.push(cb);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      resize.disconnect();
      themeObserver.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      for (const d of dmgNums) d.el.remove();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          geometries.add(mesh.geometry);
          for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
        }
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      sparkGeo.dispose();
      sparkMat.dispose();
      renderer.dispose();
      hostWrap.remove();
    },
  };
}
