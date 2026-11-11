// Engine code generators for the hit-feel page. Everything below is plain
// string building from the live FeelParams, so the exported snippets always
// match the sliders. Godot targets 4.x GDScript; Unity targets C# (Unity 6).
// Comments are written for this page — they are not copied from any notebook.

import type { FeelParams } from "./params";

const n = (v: number, digits = 2): string => {
  const s = v.toFixed(digits);
  return s.replace(/\.?0+$/, "") || "0";
};
const gdBool = (b: boolean) => (b ? "true" : "false");
const csBool = (b: boolean) => (b ? "true" : "false");

const hitStopSeconds = (p: FeelParams) => p.hitStop.frames / 60;

export function godotHitFeel(p: FeelParams): string {
  const stop = n(hitStopSeconds(p), 3);
  const shakeAmt = n(p.shake.trauma);
  const shakeDecay = n(p.shake.decay);
  const knock = n(p.knockback.distance);
  const stopT = n(p.knockback.stopTime);
  const bands = [
    p.sfx.low && "low",
    p.sfx.mid && "mid",
    p.sfx.high && "high",
  ].filter(Boolean) as string[];

  const hitStopBlock = p.hitStop.on
    ? `	# Layer 1 — hit stop. The freeze must ignore time scale, or the timer that
	# ends it would freeze too. Overlapping impacts: the first active restore
	# owns the recovery, later hits just extend the freeze.
	_freeze_for(${stop})`
    : `	# Layer 1 — hit stop is switched off in the current preset.`;

  const shakeBlock = p.shake.on
    ? `	# Layer 2 — screen shake. Trauma decays on the unscaled clock so the shake
	# keeps breathing while the world is frozen.
	_trauma = minf(_trauma + ${shakeAmt}, 1.0)`
    : `	# Layer 2 — screen shake is switched off in the current preset.`;

  const feedbackBlock = p.feedback.on
    ? `	# Layer 3 — flash, squash and one clean number. Separate flags, one layer.
	if flash_on:
		_flash_victim()
	if squash_on:
		_squash_bone(hit_bone, ${n(p.feedback.squashAmount)})
	if numbers_on:
		_spawn_number(hit_point, damage)`
    : `	# Layer 3 — hit feedback is switched off in the current preset.`;

  const knockBlock = p.knockback.on
    ? `	# Layer 4 — knockback: fast launch (${n((2 * p.knockback.distance) / p.knockback.stopTime)} m/s), constant
	# deceleration to a full stop in ${stopT} s. A uniform slide reads as weightless.
	_launch_decel = (2.0 * ${knock}) / ${stopT} / ${stopT}
	victim.velocity = direction * (_launch_decel * ${stopT})`
    : `	# Layer 4 — knockback is switched off in the current preset.`;

  const vfxBlock = p.vfx.on
    ? `	# Layer 5 — directional VFX. Sparks inherit the force direction; an
	# isotropic burst looks like confetti, not like an impact.
	sparks.direction = direction
	sparks.amount = ${p.vfx.sparks}
	sparks.restart()${p.vfx.shockwave ? "\n\t_shockwave(hit_point, direction)" : ""}`
    : `	# Layer 5 — directional VFX is switched off in the current preset.`;

  const sfxBlock = p.sfx.on
    ? `	# Layer 6 — three-band audio (${bands.length ? bands.join(" + ") : "no bands enabled"}). Low carries the
	# weight, mid the texture, high the crispness.
	for band in [${bands.map((b) => `"${b}"`).join(", ")}]:
		play_band(band, ${n(p.sfx.volume)})`
    : `	# Layer 6 — impact audio is switched off in the current preset.`;

  return `extends Node
# Hit-impact recipe — exported from the PixJuice Game Feel Lab.
# Six layers, each optional, all firing from one impact call.

@export var hit_stop_enabled := ${gdBool(p.hitStop.on)}
@export var hit_stop_seconds := ${stop}        # ${p.hitStop.frames} frames at 60 fps
@export var shake_enabled := ${gdBool(p.shake.on)}
@export var shake_amount := ${shakeAmt}              # trauma added per hit (use 0.2..0.3 for light hits)
@export var shake_decay := ${shakeDecay}               # trauma lost per second
@export var flash_on := ${gdBool(p.feedback.on && p.feedback.flash)}
@export var squash_on := ${gdBool(p.feedback.on && p.feedback.squash)}
@export var numbers_on := ${gdBool(p.feedback.on && p.feedback.numbers)}
@export var knockback_enabled := ${gdBool(p.knockback.on)}
@export var knockback_distance := ${knock}
@export var knockback_stop_time := ${stopT}
@export var sparks_on := ${gdBool(p.vfx.on)}
@export var shockwave_on := ${gdBool(p.vfx.on && p.vfx.shockwave)}
@export var audio_enabled := ${gdBool(p.sfx.on)}
@export var audio_band_low := ${gdBool(p.sfx.low)}
@export var audio_band_mid := ${gdBool(p.sfx.mid)}
@export var audio_band_high := ${gdBool(p.sfx.high)}

var _trauma := 0.0
var _launch_decel := 0.0
var _freeze_owner: SceneTreeTimer
@onready var victim: CharacterBody3D = %Victim
@onready var sparks: GPUParticles3D = %Sparks
@onready var camera: Camera3D = %Camera3D

func impact(direction: Vector3, hit_point: Vector3, damage: int, hit_bone: StringName) -> void:
${hitStopBlock}
${shakeBlock}
${feedbackBlock}
${knockBlock}
${vfxBlock}
${sfxBlock}

func _freeze_for(seconds: float) -> void:
	if not hit_stop_enabled or seconds <= 0.0:
		return
	Engine.time_scale = 0.0
	# create_timer(..., ignore_time_scale = true): the 4th argument keeps the
	# timer ticking while time_scale is 0, so the freeze always ends.
	_freeze_owner = get_tree().create_timer(seconds, true, false, true)
	_freeze_owner.timeout.connect(_restore_time)

func _restore_time() -> void:
	Engine.time_scale = 1.0
	_freeze_owner = null

func _process(_delta: float) -> void:
	# _delta is already scaled (0 during a freeze), so measure real time here —
	# otherwise the shake would lock up for the whole hit stop.
	var now := Time.get_ticks_msec()
	var unscaled := 0.0 if _last_ms == 0 else (now - _last_ms) / 1000.0
	_last_ms = now
	_trauma = maxf(_trauma - shake_decay * unscaled, 0.0)
	if _trauma > 0.0:
		var shake := _trauma * _trauma   # trauma squared: tiny hits stay tiny
		var t := now / 1000.0
		camera.h_offset = shake * 0.4 * sin(t * 37.0)
		camera.v_offset = shake * 0.4 * cos(t * 41.0)
		camera.rotation.z = shake * 0.03 * sin(t * 29.0)

var _last_ms := 0

func _physics_process(delta: float) -> void:
	# Brake the knockback at a constant rate until it stops dead — the hard
	# stop is where the mass reads.
	if _launch_decel > 0.0:
		victim.velocity = victim.velocity.move_toward(Vector3.ZERO, _launch_decel * delta)
		if victim.velocity.is_zero_approx():
			_launch_decel = 0.0

func play_band(band: String, volume: float) -> void:
	# The demo page synthesizes the three bands with WebAudio. In a project,
	# route one impact clip through low/mid/high filter buses and enable the
	# bands you actually mixed.
	match band:
		"low":
			%ImpactLow.volume_db = linear_to_db(volume)
			%ImpactLow.play()
		"mid":
			%ImpactMid.volume_db = linear_to_db(volume)
			%ImpactMid.play()
		"high":
			%ImpactHigh.volume_db = linear_to_db(volume)
			%ImpactHigh.play()
`;
}

export function godotArmIK(p: FeelParams): string {
  const recoil = n(0.06 + p.feedback.squashAmount * 0.08);
  return `extends Node3D
# Attacker arm IK with SkeletonIK3D — the arm reaches for the real target
# bone instead of playing a canned swing into empty air, and takes a small
# recoil push at the moment of contact.

@export var ik_weight := 1.0
@export var recoil_meters := ${recoil}   # how far the hand is pushed back on impact

@onready var skeleton: Skeleton3D = %AttackerSkeleton
@onready var hand_target: Node3D = %HandTarget

var _ik: SkeletonIK3D
var _recoil := 0.0

func _ready() -> void:
	_ik = SkeletonIK3D.new()
	skeleton.add_child(_ik)
	_ik.root_bone = &"mixamorig:RightArm"
	_ik.tip_bone = &"mixamorig:RightHand"
	_ik.target = hand_target.get_path()
	_ik.use_magnet = true
	_ik.magnet_position = skeleton.global_position + Vector3(0, 1, -1)
	_ik.interpolation = 0.0
	_ik.start()

func on_contact(direction: Vector3) -> void:
	# The impact feeds back into the arm: brief push along the attack direction,
	# then the spring recovers while the swing finishes.
	_recoil = ${recoil}
	hand_target.global_position -= direction * _recoil

func _process(delta: float) -> void:
	# Blend the IK in with the animation instead of replacing it: interpolation
	# is the mix knob, so the swing keeps its shape and only the reach is solved.
	_ik.interpolation = lerpf(_ik.interpolation, ik_weight, delta * 10.0)
`;
}

export function godotLocalBones(p: FeelParams): string {
  const impulse = n(2 + p.knockback.distance * 6);
  const recover = n(0.25 + p.knockback.stopTime);
  return `extends Node3D
# Local hit reaction with PhysicalBone3D — only the bones near the impact go
# physical for a moment; the rest of the body keeps animating. This is the
# "belly caves in, head tips forward" layer, not a full ragdoll.

@export var impulse_strength := ${impulse}
@export var recover_seconds := ${recover}

# Created with Skeleton3D > "Create Physical Skeleton" in the editor; keep them
# not simulated until an impact needs them.
@onready var spine_bone: PhysicalBone3D = %SpinePhysicalBone
@onready var head_bone: PhysicalBone3D = %HeadPhysicalBone

func on_impact(zone: StringName, direction: Vector3, hit_point: Vector3) -> void:
	var bone := spine_bone if zone == &"belly" else head_bone
	bone.simulated = true
	# Impulse applied at the hit point torques the bone, so the reaction
	# rotates around the impact instead of sliding the whole torso.
	bone.apply_impulse(direction * impulse_strength, hit_point - bone.global_position)
	# Real time again: the freeze must not postpone the recovery.
	get_tree().create_timer(recover_seconds, true, false, true).timeout.connect(
		func(): bone.simulated = false
	)
`;
}

export function unityHitFeel(p: FeelParams): string {
  const stop = n(hitStopSeconds(p), 3);
  const shakeAmt = n(p.shake.trauma);
  const shakeDecay = n(p.shake.decay);
  const knock = n(p.knockback.distance);
  const stopT = n(p.knockback.stopTime);
  const launch = n((2 * p.knockback.distance) / p.knockback.stopTime);
  const bands = [p.sfx.low && "low", p.sfx.mid && "mid", p.sfx.high && "high"].filter(Boolean) as string[];

  return `using System.Collections;
using UnityEngine;

// Hit-impact recipe — exported from the PixJuice Game Feel Lab.
// Six layers, each optional, all firing from one Impact() call.
public sealed class HitFeel : MonoBehaviour {
    [SerializeField] bool hitStopEnabled = ${csBool(p.hitStop.on)};
    [SerializeField] float hitStopSeconds = ${stop}f;   // ${p.hitStop.frames} frames at 60 fps
    [SerializeField] bool shakeEnabled = ${csBool(p.shake.on)};
    [SerializeField] float shakeAmount = ${shakeAmt}f;       // trauma added per hit
    [SerializeField] float shakeDecay = ${shakeDecay}f;          // trauma lost per second
    [SerializeField] bool flashOn = ${csBool(p.feedback.on && p.feedback.flash)};
    [SerializeField] bool squashOn = ${csBool(p.feedback.on && p.feedback.squash)};
    [SerializeField] bool numbersOn = ${csBool(p.feedback.on && p.feedback.numbers)};
    [SerializeField] bool knockbackEnabled = ${csBool(p.knockback.on)};
    [SerializeField] float knockbackDistance = ${knock}f;
    [SerializeField] float knockbackStopTime = ${stopT}f;
    [SerializeField] bool sparksOn = ${csBool(p.vfx.on)};
    [SerializeField] bool shockwaveOn = ${csBool(p.vfx.on && p.vfx.shockwave)};
    [SerializeField] bool audioEnabled = ${csBool(p.sfx.on)};
    [SerializeField] bool bandLow = ${csBool(p.sfx.low)};
    [SerializeField] bool bandMid = ${csBool(p.sfx.mid)};
    [SerializeField] bool bandHigh = ${csBool(p.sfx.high)};

    [SerializeField] Transform victim;
    [SerializeField] ParticleSystem sparks;
    [SerializeField] AudioSource impactLow, impactMid, impactHigh;
    // Same clip on three sources; AudioLowPassFilter / AudioHighPassFilter
    // components split it into bands. Enable the bands you actually mixed.

    float _trauma;
    Coroutine _freeze;

    public void Impact(Vector3 direction, Vector3 hitPoint, int damage) {
        ${p.hitStop.on ? `// Layer 1 — hit stop. WaitForSecondsRealtime ignores timeScale, so the
        // freeze can end itself. A second impact cancels the pending restore and
        // starts a fresh one — timeScale can never be left at 0.
        if (hitStopEnabled) Freeze(hitStopSeconds);` : `// Layer 1 — hit stop is switched off in the current preset.`}
        ${p.shake.on ? `if (shakeEnabled) _trauma = Mathf.Min(_trauma + shakeAmount, 1f);` : `// Layer 2 — screen shake is switched off in the current preset.`}
        ${p.feedback.on ? `// Layer 3 — flash, squash and one clean number, as three sub-flags.
        if (flashOn) FlashVictim();
        if (squashOn) SquashBone(hitPoint);
        if (numbersOn) SpawnNumber(hitPoint, damage);` : `// Layer 3 — hit feedback is switched off in the current preset.`}
        ${p.knockback.on ? `// Layer 4 — fast launch, constant deceleration, full stop at the marked
        // time. A uniform slide reads as weightless.
        if (knockbackEnabled) Launch(victim, direction, ${launch}f, ${stopT}f);` : `// Layer 4 — knockback is switched off in the current preset.`}
        ${p.vfx.on ? `// Layer 5 — sparks inherit the force direction; isotropic bursts read as
        // confetti, not impact.
        if (sparksOn) {
            var shape = sparks.shape;
            shape.rotation = Quaternion.LookRotation(direction).eulerAngles;
            sparks.Play();
        }${p.vfx.shockwave ? "\n        if (shockwaveOn) Shockwave(hitPoint, direction);" : ""}` : `// Layer 5 — directional VFX is switched off in the current preset.`}
        ${p.sfx.on ? `// Layer 6 — three-band audio (${bands.length ? bands.join(" + ") : "no bands enabled"}).
        if (audioEnabled) {
            if (bandLow) impactLow.Play();
            if (bandMid) impactMid.Play();
            if (bandHigh) impactHigh.Play();
        }` : `// Layer 6 — impact audio is switched off in the current preset.`}
    }

    void Freeze(float seconds) {
        if (_freeze != null) StopCoroutine(_freeze); // the new restore takes over
        _freeze = StartCoroutine(FreezeRoutine(seconds));
    }

    IEnumerator FreezeRoutine(float seconds) {
        Time.timeScale = 0f;
        yield return new WaitForSecondsRealtime(seconds); // unaffected by the freeze
        Time.timeScale = 1f;
        _freeze = null;
    }

    void Update() {
        // Unscaled delta: the shake keeps fading while the world is frozen,
        // otherwise every hit stop would freeze the camera too.
        float dt = Time.unscaledDeltaTime;
        _trauma = Mathf.Max(_trauma - shakeDecay * dt, 0f);
        if (_trauma > 0f) {
            float shake = _trauma * _trauma; // trauma squared: small hits stay small
            float t = Time.unscaledTime;
            transform.localPosition = new Vector3(
                shake * 0.15f * Mathf.Sin(t * 37f),
                shake * 0.15f * Mathf.Cos(t * 41f), 0f);
            transform.localRotation = Quaternion.Euler(0, 0, shake * 3f * Mathf.Sin(t * 29f));
        }
    }

    void Launch(Transform target, Vector3 direction, float speed, float stopTime) {
        var body = target.GetComponent<Rigidbody>();
        if (body == null) return;
        body.linearVelocity = direction * speed; // Unity 6+: use .velocity on older versions
        StartCoroutine(Brake(body, direction, speed, stopTime));
    }

    IEnumerator Brake(Rigidbody body, Vector3 direction, float speed, float stopTime) {
        float decel = speed / stopTime;
        while (body != null && body.linearVelocity.sqrMagnitude > 0.01f) {
            // Physics still ticks during hit stop; gate it on real time if that matters.
            Vector3 v = body.linearVelocity - direction * (decel * Time.fixedDeltaTime);
            body.linearVelocity = Vector3.Dot(v, direction) < 0f ? Vector3.zero : v;
            yield return new WaitForFixedUpdate();
        }
    }
}
`;
}

export function unityArmIK(p: FeelParams): string {
  const recoil = n(0.06 + p.feedback.squashAmount * 0.08);
  return `using UnityEngine;

// Attacker arm IK — a dependency-free two-bone solve for shoulder→elbow→hand.
// The arm tracks the real target point and takes a small recoil push at
// contact, so a hit feels like it met something. Unity's Animation Rigging
// package (TwoBoneIKConstraint) does the same job if you prefer components.
public static class TwoBoneIK {
    public static void Solve(Transform upper, Transform fore, Transform hand,
                             Transform target, Vector3 pole, float weight, float recoil) {
        Vector3 a = upper.position;
        Vector3 toTarget = target.position - a - target.forward * recoil;
        float l1 = Vector3.Distance(a, fore.position);
        float l2 = Vector3.Distance(fore.position, hand.position);
        float d = Mathf.Clamp(toTarget.magnitude, Mathf.Abs(l1 - l2) + 0.001f, l1 + l2 - 0.001f);
        Vector3 dir = toTarget.normalized;

        // Bend plane from the target direction and the pole (elbow hint).
        Vector3 poleDir = pole - Vector3.Project(pole, dir);
        if (poleDir.sqrMagnitude < 1e-6f) return;
        poleDir.Normalize();

        // Law of cosines: where the elbow sits on the reachable circle.
        float x = (l1 * l1 + d * d - l2 * l2) / (2f * d);
        float h = Mathf.Sqrt(Mathf.Max(l1 * l1 - x * x, 0f));
        Vector3 elbow = a + dir * x + poleDir * h;

        // Minimal rotations from the current bone directions to the solved ones —
        // FromToRotation keeps the twist the animation gave the arm.
        Vector3 upperDir = (fore.position - a).normalized;
        Vector3 foreDir = (hand.position - fore.position).normalized;
        Quaternion upperSolved = Quaternion.FromToRotation(upperDir, (elbow - a).normalized) * upper.rotation;
        Quaternion foreSolved = Quaternion.FromToRotation(foreDir, (target.position - elbow).normalized) * fore.rotation;
        upper.rotation = Quaternion.Slerp(upper.rotation, upperSolved, weight);
        fore.rotation = Quaternion.Slerp(fore.rotation, foreSolved, weight);
    }
}

// Call it from LateUpdate, after the animation has written the pose:
// TwoBoneIK.Solve(rightArm, rightForeArm, rightHand, handTarget,
//                 pole: -attacker.transform.forward, weight: reachBlend,
//                 recoil: contactRecoil); // recoil ≈ ${recoil}f at the current settings
`;
}

export interface CodeTab {
  id: string;
  engine: "godot" | "unity";
  label: string;
  code: string;
}

export function buildCodeTabs(p: FeelParams): CodeTab[] {
  return [
    { id: "gd-hit", engine: "godot", label: "hit_feel.gd", code: godotHitFeel(p) },
    { id: "gd-ik", engine: "godot", label: "arm_ik.gd", code: godotArmIK(p) },
    { id: "gd-bones", engine: "godot", label: "local_bones.gd", code: godotLocalBones(p) },
    { id: "cs-hit", engine: "unity", label: "HitFeel.cs", code: unityHitFeel(p) },
    { id: "cs-ik", engine: "unity", label: "TwoBoneIK.cs", code: unityArmIK(p) },
  ];
}
