import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// The feel modules are TypeScript; transpile them the same way the static
// localization pipeline handles locale files, then import as data: URLs.
async function loadTs(path) {
  const src = fs.readFileSync(path, 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
  return mod;
}

const { PRESETS, DEFAULT_PARAMS, SLIDERS, LAYER_IDS, cloneParams } = await loadTs('./src/feel/params.ts');
const { godotHitFeel, godotArmIK, godotLocalBones, unityHitFeel, unityArmIK, buildCodeTabs } = await loadTs('./src/feel/codegen.ts');

const inRange = (v, meta) => v >= meta.min && v <= meta.max && Math.abs(v / meta.step - Math.round(v / meta.step)) < 1e-6;

test('feel: presets stay inside slider ranges and are distinct', () => {
  for (const [id, p] of Object.entries(PRESETS)) {
    assert.ok(inRange(p.hitStop.frames, SLIDERS.frames), `${id} hitStop.frames`);
    assert.ok(inRange(p.shake.trauma, SLIDERS.trauma), `${id} shake.trauma`);
    assert.ok(inRange(p.shake.decay, SLIDERS.decay), `${id} shake.decay`);
    assert.ok(inRange(p.feedback.flashIntensity, SLIDERS.flashIntensity), `${id} flash`);
    assert.ok(inRange(p.feedback.squashAmount, SLIDERS.squashAmount), `${id} squash`);
    assert.ok(inRange(p.feedback.numberScale, SLIDERS.numberScale), `${id} digits`);
    assert.ok(inRange(p.knockback.distance, SLIDERS.distance), `${id} distance`);
    assert.ok(inRange(p.knockback.stopTime, SLIDERS.stopTime), `${id} stopTime`);
    assert.ok(inRange(p.vfx.sparks, SLIDERS.sparks), `${id} sparks`);
    assert.ok(inRange(p.sfx.volume, SLIDERS.volume), `${id} volume`);
  }
  // the presets must be genuinely different recipes
  assert.notEqual(PRESETS.light.hitStop.frames, PRESETS.heavy.hitStop.frames);
  assert.notEqual(PRESETS.light.knockback.distance, PRESETS.overdone.knockback.distance);
  // overdone is the negative example: everything on, loudest audio
  for (const band of ['low', 'mid', 'high']) assert.ok(PRESETS.overdone.sfx[band]);
  assert.ok(PRESETS.overdone.overdoneExtras && PRESETS.overdone.hitStop.on);
  // light is the default preset, and LAYER_IDS cover the six anchors
  assert.equal(DEFAULT_PARAMS.hitStop.frames, PRESETS.light.hitStop.frames);
  assert.equal(LAYER_IDS.length, 6);
  assert.deepEqual([...LAYER_IDS], ['hit-stop', 'screen-shake', 'hit-feedback', 'knockback', 'directional-vfx', 'impact-sfx']);
});

test('feel: godot code reflects the live parameters', () => {
  const gd = godotHitFeel(PRESETS.heavy);
  assert.ok(gd.includes('extends Node'));
  assert.ok(gd.includes('extends'), 'gdscript header');
  assert.ok(gd.includes(`hit_stop_seconds := ${(PRESETS.heavy.hitStop.frames / 60).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`), 'freeze seconds derive from frames');
  assert.ok(gd.includes('get_tree().create_timer(seconds, true, false, true)'), 'ignore_time_scale is the 4th argument');
  assert.ok(gd.includes('_freeze_for('), 'impact calls the freeze');
  assert.ok(gd.includes(`shake_amount := ${PRESETS.heavy.shake.trauma}`), 'trauma value present');
  assert.ok(gd.includes('Time.get_ticks_msec()'), 'shake decays on the unscaled clock');
  assert.ok(gd.includes('move_toward'), 'knockback decelerates');
  const off = cloneParams(PRESETS.heavy);
  off.hitStop.on = false;
  const gdOff = godotHitFeel(off);
  assert.ok(gdOff.includes('hit_stop_enabled := false'), 'export flag flips off');
  assert.ok(!gdOff.includes(`_freeze_for(${(off.hitStop.frames / 60).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')})`), 'disabling hit stop removes the freeze call');
  const bands = godotHitFeel(PRESETS.overdone);
  assert.ok(bands.includes('"low"') && bands.includes('"mid"') && bands.includes('"high"'), 'all bands listed when enabled');
  const quiet = cloneParams(PRESETS.overdone);
  quiet.sfx.mid = false;
  assert.ok(godotHitFeel(quiet).includes('audio_band_mid := false'));
});

test('feel: godot IK and PhysicalBone snippets use real APIs', () => {
  const ik = godotArmIK(PRESETS.light);
  assert.ok(ik.includes('SkeletonIK3D'));
  assert.ok(ik.includes('root_bone = &"mixamorig:RightArm"'));
  assert.ok(ik.includes('tip_bone = &"mixamorig:RightHand"'));
  assert.ok(ik.includes('.start()'));
  const bones = godotLocalBones(PRESETS.heavy);
  assert.ok(bones.includes('PhysicalBone3D'));
  assert.ok(bones.includes('.simulated = true'));
  assert.ok(bones.includes('create_timer(recover_seconds, true, false, true)'));
});

test('feel: unity code reflects the live parameters', () => {
  const cs = unityHitFeel(PRESETS.light);
  assert.ok(cs.includes('using UnityEngine;'));
  assert.ok(cs.includes('WaitForSecondsRealtime'), 'freeze uses realtime');
  assert.ok(cs.includes('Time.timeScale = 0f') && cs.includes('Time.timeScale = 1f'));
  assert.ok(cs.includes('Time.unscaledDeltaTime'), 'shake decays unscaled');
  assert.ok(cs.includes(`shakeAmount = ${PRESETS.light.shake.trauma}f`));
  assert.ok(!cs.includes('bandMid = true') ? true : PRESETS.light.sfx.mid, 'band flags follow the toggles');
  const heavy = unityHitFeel(PRESETS.overdone);
  assert.ok(heavy.includes('bandMid = true'));
  const ik = unityArmIK(PRESETS.light);
  assert.ok(ik.includes('TwoBoneIK'));
  assert.ok(ik.includes('Mathf.Acos') || ik.includes('law of cosines') || ik.includes('Law of cosines'));
});

test('feel: buildCodeTabs yields five non-empty snippets across both engines', () => {
  const tabs = buildCodeTabs(PRESETS.heavy);
  assert.equal(tabs.length, 5);
  assert.equal(new Set(tabs.map((x) => x.engine)).size, 2);
  for (const tab of tabs) assert.ok(tab.code.length > 400, `${tab.label} has body`);
  assert.ok(tabs.some((x) => x.label === 'hit_feel.gd'));
  assert.ok(tabs.some((x) => x.label === 'HitFeel.cs'));
});
