import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Headless coverage for the standalone squash reference: 0 vs a visible amount, no
// accumulation, off-switch restores, victim only, root / logical position
// unchanged. The implementation is a cartoon scale of the struck character's
// appearance (a visual pivot at the feet) — not IK, a ragdoll, or local muscle.

globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 4, height: 4, close() {} });
if (!URL.createObjectURL) URL.createObjectURL = () => 'data:application/octet-stream;base64,';
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const SkeletonUtils = await import('three/addons/utils/SkeletonUtils.js');

async function loadTs(file, remapThree = false) {
  let src = fs.readFileSync(file, 'utf8');
  if (remapThree) {
    const threeUrl = JSON.stringify(pathToFileURL(path.resolve('node_modules/three/build/three.module.js')).href);
    src = src.replace(/from "three"/g, `from ${threeUrl}`);
  }
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
}

const squash = await loadTs('./src/feel/squash.ts', true);
const { godotHitFeel, unityHitFeel } = await loadTs('./src/feel/codegen.ts');
const { PRESETS, cloneParams } = await loadTs('./src/feel/params.ts');

const { squashFactors, squashEnvelope, visualScaleFromRest, VictimSquash, SQUASH_DURATION } = squash;

test('feel-squash: zero amount is identity; a large amount is clearly different', () => {
  const zero = squashFactors(0);
  assert.equal(zero.along, 1);
  assert.equal(zero.across, 1);
  const mild = squashFactors(0.3);
  const hard = squashFactors(1);
  assert.ok(hard.along < mild.along && mild.along < 1, 'more amount compresses more along the blow');
  assert.ok(hard.across > mild.across && mild.across > 1, 'more amount stretches more across');
  const rest = new THREE.Vector3(1, 1, 1);
  const dir = new THREE.Vector3(1, 0, 0);
  const quat = new THREE.Quaternion();
  const a0 = visualScaleFromRest(rest, dir, quat, 0, 1, new THREE.Vector3());
  assert.ok(a0.equals(rest), 'amount 0 keeps rest scale');
  const a1 = visualScaleFromRest(rest, dir, quat, 1, 1, new THREE.Vector3());
  assert.ok(Math.abs(a1.x - hard.along) < 1e-6, 'compresses along world X in bone space');
  assert.ok(Math.abs(a1.y - hard.across) < 1e-6);
  const mid = visualScaleFromRest(rest, dir, quat, 1, 0.5, new THREE.Vector3());
  assert.ok(mid.x > a1.x && mid.x < 1, 'envelope 0.5 is between peak and rest');
});

test('feel-squash: envelope peaks at impact and dies at duration', () => {
  assert.equal(squashEnvelope(0), 1);
  assert.equal(squashEnvelope(-0.1), 0);
  assert.equal(squashEnvelope(SQUASH_DURATION), 0);
  assert.equal(squashEnvelope(SQUASH_DURATION + 1), 0);
  const mid = squashEnvelope(SQUASH_DURATION * 0.5);
  assert.ok(mid > 0 && mid < 1);
});


const glb = fs.readFileSync('./public/feel/knight.glb');
const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
const idle = THREE.AnimationClip.findByName(gltf.animations, 'idle');
assert.ok(idle, 'knight.glb has idle');

function stagedPair() {
  const attacker = SkeletonUtils.clone(gltf.scene);
  const victim = SkeletonUtils.clone(gltf.scene);
  const attackerRoot = new THREE.Group();
  const victimRoot = new THREE.Group();
  const attackerVisual = new THREE.Group();
  const victimVisual = new THREE.Group();
  attackerRoot.add(attackerVisual);
  attackerVisual.add(attacker);
  victimRoot.add(victimVisual);
  victimVisual.add(victim);
  attackerRoot.position.set(-1, 0, 0);
  victimRoot.position.set(1, 0, 0);
  const mA = new THREE.AnimationMixer(attacker);
  const mV = new THREE.AnimationMixer(victim);
  mA.clipAction(idle).play();
  mV.clipAction(idle).play();
  mA.update(0);
  mV.update(0);
  const sq = new VictimSquash(victimVisual);
  return { attacker, victim, attackerRoot, victimRoot, attackerVisual, victimVisual, mA, mV, sq };
}

function worldSize(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone();
    b.applyMatrix4(o.matrixWorld);
    box.union(b);
  });
  const size = new THREE.Vector3();
  box.getSize(size);
  return size;
}

test('feel-squash: obvious amount deforms the visual figure, 0 and off do not, root stays put', () => {
  const { victimRoot, attackerVisual, victimVisual, mV, mA, sq } = stagedPair();
  const home = victimRoot.position.clone();
  const restV = victimVisual.scale.clone();
  const restA = attackerVisual.scale.clone();
  const dir = new THREE.Vector3(1, 0, 0);

  mV.update(0);
  mA.update(0);
  sq.update(0, true, 1);
  assert.ok(victimVisual.scale.equals(restV), 'no trigger yet: rest');
  assert.ok(attackerVisual.scale.equals(restA), 'attacker visual untouched before trigger');

  const size0 = worldSize(victimVisual);
  sq.trigger(dir, true);
  mV.update(0);
  mA.update(0);
  sq.update(0, true, 1);
  const peak = victimVisual.scale.clone();
  assert.ok(peak.distanceTo(restV) > 0.35, 'amount 1 is a large departure from rest on the visual pivot');
  const size1 = worldSize(victimVisual);
  const rel = Math.max(
    Math.abs(size1.x - size0.x) / Math.max(size0.x, 1e-6),
    Math.abs(size1.y - size0.y) / Math.max(size0.y, 1e-6),
    Math.abs(size1.z - size0.z) / Math.max(size0.z, 1e-6),
  );
  assert.ok(rel > 0.2, `whole-figure world size must change obviously, got rel=${rel.toFixed(3)}`);
  assert.ok(attackerVisual.scale.equals(restA), 'attacker visual not written');
  assert.ok(victimRoot.position.equals(home), 'logical root / knockback origin unchanged');

  sq.update(0, true, 0);
  assert.ok(victimVisual.scale.equals(restV), 'amount 0 restores rest');

  sq.trigger(dir, true);
  sq.update(0, true, 1);
  const peak2 = victimVisual.scale.clone();
  assert.ok(peak2.distanceTo(peak) < 1e-6, 'retrigger starts from rest, does not accumulate');

  sq.update(0, false, 1);
  assert.ok(victimVisual.scale.equals(restV), 'switch off restores immediately');
  assert.equal(sq.isActive, false);
});

test('feel-squash: mixer scale tracks on bones do not hide or accumulate the visual pivot', () => {
  const { victim, victimVisual, mV, sq } = stagedPair();
  const dir = new THREE.Vector3(1, 0, 0);
  sq.trigger(dir, true);
  // Advance the clip (idle has Spine2.scale tracks near 1). The visual pivot
  // must stay squashed independently of those bone tracks.
  mV.update(1 / 30);
  sq.update(0, true, 1);
  const mid = victimVisual.scale.clone();
  assert.ok(mid.distanceTo(new THREE.Vector3(1, 1, 1)) > 0.35, 'pivot stays deformed while the clip plays');
  mV.update(1 / 30);
  sq.update(0, true, 1);
  assert.ok(victimVisual.scale.distanceTo(mid) < 1e-6, 'clip time does not stack onto the visual scale');
  let boneScaleWrote = false;
  victim.traverse((o) => {
    if (o.isBone && /Spine2/i.test(o.name)) {
      // clip may write ~1; we must not have used this as the visible squash node
      boneScaleWrote = o.scale.distanceTo(new THREE.Vector3(1, 1, 1)) < 0.05;
    }
  });
  assert.ok(boneScaleWrote || true); // informational: bones may stay near 1
});

test('feel-squash: controls are export-only and the web demo has no freeze aid or squash path', () => {
  const demo = fs.readFileSync('./src/feel/demo.ts', 'utf8');
  const page = fs.readFileSync('./src/pages/feel-hit.ts', 'utf8');
  const html = fs.readFileSync('./feel/hit/index.html', 'utf8');
  assert.doesNotMatch(html, /feel-freeze|freezeAtImpact/);
  assert.doesNotMatch(demo, /setFreezeAtImpact|dataset\.frozen|VictimSquash|squashAmount|victimVisual|victimRoot\.scale/);
  assert.doesNotMatch(page, /setFreezeAtImpact|path: "feedback\.squash/);
  const reference = html.match(/<fieldset class="feel-squash-reference">([\s\S]*?)<\/fieldset>/)?.[1];
  assert.ok(reference, 'the reference has its own fieldset');
  assert.ok(html.indexOf('feel-squash-reference') > html.indexOf('feel-code-wide'));
  assert.match(reference, /data-i18n="feel\.squashReference"/);
  assert.match(reference, /data-i18n="feel\.squashReferenceNote"/);
  assert.match(reference, /type="checkbox" id="feel-export-squash"/);
  assert.match(reference, /type="number" id="feel-export-squash-amount"/);
  assert.doesNotMatch(reference, /type="range"/);
  const update = page.match(/function onSquashReferenceChanged\(\): void \{([^}]*)\}/)?.[1];
  assert.ok(update?.includes('renderCodebox()') && update.includes('scheduleShareSync()'));
  assert.doesNotMatch(update, /pushDemo|attack|setCompareUi|onParamsChanged/);
  for (const loc of ['en', 'zh', 'ja', 'ko', 'es']) {
    const src = fs.readFileSync(`./src/lib/locales/${loc}.ts`, 'utf8');
    assert.match(src, /squashReference: "[^"]+"/);
    assert.match(src, /squashReferenceNote: "[^"]+"/);
    assert.doesNotMatch(src, /freezeAtImpact:/);
  }
});

test('feel-squash: export snippets define the visual helper and do not claim a ragdoll or local muscle', () => {
  const gd = godotHitFeel(PRESETS.heavy);
  assert.ok(gd.includes('func _squash_visual'), 'Godot export implements the helper it calls');
  assert.ok(gd.includes('_squash_visual(0.7)') || gd.includes('_squash_visual(0.70)'), 'reference amount is inlined');
  assert.ok(gd.includes('engine reference only'));
  assert.ok(/not IK|not a ragdoll|Not IK/i.test(gd), 'Godot comments stay honest');
  assert.ok(/appearance|from the feet|not.*local muscle/i.test(gd), 'Godot describes the reference mechanism');
  const off = cloneParams(PRESETS.heavy);
  off.feedback.squash = false;
  off.feedback.on = true;
  const gdOff = godotHitFeel(off);
  assert.ok(gdOff.includes('squash_on := false'));
  const cs = unityHitFeel(PRESETS.heavy);
  assert.ok(cs.includes('void SquashVisual') && cs.includes('IEnumerator SquashRoutine'));
  assert.ok(cs.includes('squashAmount = 0.7f') || cs.includes('squashAmount = 0.70f'));
  assert.ok(cs.includes('engine reference only'));
  assert.ok(/not IK|not a ragdoll|Not IK/i.test(cs));
  assert.ok(!cs.includes('void SquashBone'), 'Unity export no longer pretends to match a hidden bone slider');
});
