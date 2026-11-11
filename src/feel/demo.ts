// The /feel/hit/ arena: two rigged knights driven by their Mixamo clips —
// the striker loops idle and plays the slash on attack, the victim loops idle
// and plays the body-hit clip on contact. The six juice layers stack on top
// of the clips: hit stop freezes the simulation clock (mixers included),
// screen shake rides the unscaled clock, flash/knockback/sparks/numbers/audio
// fire from the impact moment. No capsules; visible motion comes from the clips.

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

const scratch = {
  v0: new THREE.Vector3(),
  v1: new THREE.Vector3(),
  v2: new THREE.Vector3(),
};

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

  // --- knights + clips -------------------------------------------------------------
  const gltf = await new GLTFLoader().loadAsync("/feel/knight.glb");
  const clipOf = (names: string[]): THREE.AnimationClip =>
    names.map((n) => THREE.AnimationClip.findByName(gltf.animations, n)).find((c): c is THREE.AnimationClip => !!c) ?? gltf.animations[0];
  const idle = clipOf(["idle"]);
  const slash = clipOf(["slash", "attack"]);
  const hit = clipOf(["hit_to_body_01", "hit"]);

  const attackerRoot = new THREE.Group();
  const victimRoot = new THREE.Group();
  const attacker = SkeletonUtils.clone(gltf.scene);
  const victim = SkeletonUtils.clone(gltf.scene);
  attackerRoot.add(attacker);
  victimRoot.add(victim);
  attackerRoot.position.set(-0.82, 0, 0.14);
  victimRoot.position.set(0.82, 0, -0.14);
  // orientation measured from the posed skeleton's facing (head − hips)
  attackerRoot.rotation.y = -Math.PI / 2 + 0.06;
  victimRoot.rotation.y = Math.PI / 2 - 0.3;
  scene.add(attackerRoot, victimRoot);
  const victimHome = victimRoot.position.clone();

  // the victim fights bare-handed; sword and shield stay on the striker
  victim.traverse((o) => {
    if (/sword|shield/i.test(o.name)) o.visible = false;
  });

  const mixerA = new THREE.AnimationMixer(attacker);
  const mixerV = new THREE.AnimationMixer(victim);
  const idleA = mixerA.clipAction(idle);
  const idleV = mixerV.clipAction(idle);
  idleA.play();
  idleV.play();
  const slashA = mixerA.clipAction(slash);
  slashA.setLoop(THREE.LoopOnce, 1);
  slashA.clampWhenFinished = true;
  const hitV = mixerV.clipAction(hit);
  hitV.setLoop(THREE.LoopOnce, 1);
  hitV.clampWhenFinished = true;

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

  /**
   * Contact timing, measured from the clip itself: step through the slash and
   * find when the sword hand passes closest to the victim's chest. The impact
   * therefore tracks the animation, not a hardcoded phase fraction.
   */
  const hand = bone(attacker, "mixamorig:RightHand");
  const contactDelay = measureContact();
  function measureContact(): number {
    if (!hand) return slash.duration * 0.4;
    const target = zoneBone("chest").getWorldPosition(new THREE.Vector3());
    let bestT = slash.duration * 0.4;
    let bestD = Infinity;
    slashA.reset();
    slashA.play();
    slashA.setEffectiveWeight(1);
    for (let t = 0; t <= slash.duration; t += 1 / 30) {
      slashA.time = t;
      mixerA.update(0);
      const d = hand.getWorldPosition(scratch.v0).distanceTo(target);
      if (d < bestD) {
        bestD = d;
        bestT = t;
      }
    }
    // back to the idle loop, as if nothing was sampled
    slashA.stop();
    slashA.reset();
    idleA.reset().play();
    mixerA.update(0);
    return bestT;
  }

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
    size: 0.05,
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

  // --- attack state ----------------------------------------------------------------
  let attacking = false;
  let attackT = 0;
  let contactFired = false;
  let victimRecover = -1; // sim time when the victim blends back to idle

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
    slashA.reset();
    slashA.crossFadeFrom(idleA, 0.1, false);
    slashA.play();
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
    // 3 — flash / victim hit clip / numbers
    if (params.feedback.on && params.feedback.flash) {
      flashLevel = params.feedback.flashIntensity;
      if (params.overdoneExtras) flashStrobe = 3;
    }
    hitV.reset();
    hitV.crossFadeFrom(idleV, 0.06, false);
    hitV.play();
    victimRecover = hit.duration + 0.1;
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
    // heavy finisher — inverted flash + slow motion
    if (params.heavyFinisher) {
      slowLeft = 0.26;
      invert.animate([{ opacity: 0 }, { opacity: 0.85 }, { opacity: 0 }], { duration: 150, easing: "ease-out" });
    }
    impactHooks.forEach((f) => f());
  }

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

    // attack timeline: the slash clip carries the swing; the impact fires at
    // the measured contact moment, then the striker blends back to idle
    if (attacking) {
      attackT += dt;
      if (!contactFired && attackT >= contactDelay) {
        contactFired = true;
        fireImpact();
      }
      if (attackT >= Math.min(slash.duration, contactDelay + 0.85)) {
        attacking = false;
        idleA.reset().fadeIn(0.18).play();
        slashA.fadeOut(0.25);
      }
    }
    if (victimRecover > 0) {
      victimRecover -= dt;
      if (victimRecover <= 0) {
        victimRecover = -1;
        idleV.reset().fadeIn(0.2).play();
        hitV.fadeOut(0.25);
      }
    }

    mixerA.update(dt);
    mixerV.update(dt);

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
