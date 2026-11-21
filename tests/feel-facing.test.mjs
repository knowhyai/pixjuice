import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Regression for the 2026-11-21 facing bug: the duelists' yaws were eyeballed
// from a wrong "head − hips" forward, so both knights stood back to back, the
// slash swung ~1.9 m wide of the victim, and the high default camera showed a
// cape instead of the clash. These tests load the real GLB headlessly (textures
// stubbed — the skeleton is what matters) and pin the fix: staging.ts's
// measured-forward placement, the slash's approach to the victim chest, and the
// flank default camera. The previously shipped yaws (−86.6° / +72.8°) fail the
// facing assertion on purpose.

// browser-global stubs so GLTFLoader can parse the GLB outside a browser
globalThis.self = globalThis;
globalThis.createImageBitmap = async () => ({ width: 4, height: 4, close() {} });
if (!URL.createObjectURL) URL.createObjectURL = () => 'data:application/octet-stream;base64,';
if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};

const THREE = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
const SkeletonUtils = await import('three/addons/utils/SkeletonUtils.js');

// staging.ts is TypeScript importing "three"; retarget that specifier at the
// workspace copy before transpiling so the data:-URL module shares the instance
async function loadStaging() {
  let src = fs.readFileSync('./src/feel/staging.ts', 'utf8');
  const threeUrl = JSON.stringify(pathToFileURL(path.resolve('node_modules/three/build/three.module.js')).href);
  src = src.replace(/from "three"/g, `from ${threeUrl}`);
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
}
const staging = await loadStaging();

async function loadLocale(lang) {
  const src = fs.readFileSync(`./src/lib/locales/${lang}.ts`, 'utf8');
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  const mod = await import('data:text/javascript;base64,' + Buffer.from(out).toString('base64'));
  return mod.default ?? mod; // locale files `export default` their dict
}

const glb = fs.readFileSync('./public/feel/knight.glb');
const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
const idle = THREE.AnimationClip.findByName(gltf.animations, 'idle');
const slash = THREE.AnimationClip.findByName(gltf.animations, 'slash');
assert.ok(idle && slash, 'knight.glb carries the idle and slash clips');

// bone lookup mirroring the demo's: raw and GLTFLoader-sanitized names
function boneIn(root, name) {
  let found = null;
  const sanitized = THREE.PropertyBinding.sanitizeNodeName(name);
  root.traverse((o) => {
    if (!found && o.isBone && (o.name === name || o.name === sanitized)) found = o;
  });
  return found;
}
const V = () => new THREE.Vector3();
const forwardOf = (model) => {
  const up = boneIn(model, 'mixamorig:Head').getWorldPosition(V()).sub(boneIn(model, 'mixamorig:Hips').getWorldPosition(V()));
  const right = boneIn(model, 'mixamorig:RightShoulder').getWorldPosition(V()).sub(boneIn(model, 'mixamorig:LeftShoulder').getWorldPosition(V()));
  return up.cross(right).setY(0).normalize();
};

/** Demo-equivalent staging: clones in roots, staged, idle pose sampled. */
function buildDuel() {
  const attacker = SkeletonUtils.clone(gltf.scene);
  const victim = SkeletonUtils.clone(gltf.scene);
  const attackerRoot = new THREE.Group();
  const victimRoot = new THREE.Group();
  attackerRoot.add(attacker);
  victimRoot.add(victim);
  staging.placeDuelists(attackerRoot, victimRoot, attacker, victim);
  const mA = new THREE.AnimationMixer(attacker);
  const mV = new THREE.AnimationMixer(victim);
  mA.clipAction(idle).play();
  mV.clipAction(idle).play();
  mA.update(0);
  mV.update(0);
  return { attacker, victim, attackerRoot, victimRoot, mA, mV };
}

test('facing: the rig looks down local +Z — head − hips is up, not forward', () => {
  const model = SkeletonUtils.clone(gltf.scene);
  const fwd = forwardOf(model);
  assert.ok(fwd.z > 0.99 && Math.abs(fwd.x) < 0.02, `measured forward is +Z at identity, got (${fwd.x.toFixed(3)}, ${fwd.z.toFixed(3)})`);
  const up = boneIn(model, 'mixamorig:Head').getWorldPosition(V()).sub(boneIn(model, 'mixamorig:Hips').getWorldPosition(V())).normalize();
  assert.ok(up.y > 0.99, 'head − hips points up');
  assert.ok(Math.abs(up.dot(fwd)) < 0.1, 'head − hips is not the facing');
});

test('facing: default placement points each knight at the other (old ±90° eyeballed yaws fail)', () => {
  const { attacker, victim, attackerRoot, victimRoot } = buildDuel();
  const dirAV = V().subVectors(victimRoot.position, attackerRoot.position).setY(0).normalize();
  const dotA = forwardOf(attacker).dot(dirAV);
  const dotV = forwardOf(victim).dot(dirAV.clone().negate());
  assert.ok(dotA > 0.9, `attacker faces the victim, dot=${dotA.toFixed(3)}`);
  assert.ok(dotV > 0.9, `victim faces the attacker, dot=${dotV.toFixed(3)}`);
  // the previously shipped pair (−86.6° / +72.8°) pointed both knights away —
  // prove that yaw pair fails this same assertion
  const oldFwd = forwardOf(attacker).applyAxisAngle(V().set(0, 1, 0), -Math.PI / 2 + 0.06 - attackerRoot.rotation.y);
  assert.ok(oldFwd.dot(dirAV) < 0.9, `old attacker yaw fails the dot check (${oldFwd.dot(dirAV).toFixed(3)})`);
});

test('facing: the slash reaches for the victim chest (old yaws missed by ~1.9 m)', () => {
  const { attacker, victim, mA } = buildDuel();
  const hand = boneIn(attacker, 'mixamorig:RightHand');
  const chest = boneIn(victim, 'mixamorig:Spine2').getWorldPosition(V());
  const slashA = mA.clipAction(slash);
  slashA.setLoop(THREE.LoopOnce, 1);
  mA.stopAllAction(); // sample the pure slash, as playback shows after the crossfade
  slashA.reset().play();
  slashA.setEffectiveWeight(1);
  let d0 = Infinity;
  let min = Infinity;
  let minT = 0;
  for (let t = 0; t <= slash.duration + 1e-6; t += 1 / 30) {
    slashA.time = Math.min(t, slash.duration);
    mA.update(0);
    const d = hand.getWorldPosition(V()).distanceTo(chest);
    if (t === 0) d0 = d;
    if (d < min) {
      min = d;
      minT = t;
    }
  }
  assert.ok(min < d0 - 0.3, `hand clearly approaches the chest: min ${min.toFixed(2)} m vs ${d0.toFixed(2)} m at t=0`);
  assert.ok(min < 1.0, `hand closes inside 1 m of the chest (the old yaws missed by ~1.9 m): ${min.toFixed(2)} m @ t=${minT.toFixed(2)}`);
});

test('facing: default camera is a flank view — perpendicular to the clash, behind neither back', () => {
  const { position, target } = staging.DEFAULT_CAMERA;
  const axis = V().subVectors(staging.VICTIM_HOME, staging.ATTACKER_HOME).setY(0).normalize();
  const view = V().subVectors(target, position).normalize();
  assert.ok(Math.abs(view.dot(axis)) < 0.35, `view roughly perpendicular to the attack line (|dot|=${Math.abs(view.dot(axis)).toFixed(3)})`);
  assert.ok(position.z > 1, 'camera sits on the +Z flank, not on the attack line');
  assert.ok(position.x > staging.ATTACKER_HOME.x && position.x < staging.VICTIM_HOME.x, 'camera is not behind either knight');
  const dist = position.distanceTo(target);
  assert.ok(dist > 2.2 && dist < 9, `distance ${dist.toFixed(2)} inside the demo's orbit limits`);
});

test('facing: the demo consumes the staging and can reset to it; the page offers Reset view', () => {
  const demo = fs.readFileSync('./src/feel/demo.ts', 'utf8');
  assert.ok(demo.includes('placeDuelists(attackerRoot, victimRoot, attacker, victim)'), 'demo stages the duel via staging.ts');
  assert.ok(demo.includes('DEFAULT_CAMERA'), 'demo boots on the staged default camera');
  assert.ok(demo.includes('controls.saveState()'), 'default saved for reset');
  assert.ok(demo.includes('resetView'), 'demo exposes resetView()');
  const page = fs.readFileSync('./src/pages/feel-hit.ts', 'utf8');
  assert.ok(page.includes('feel-reset-view'), 'hit page wires the reset button');
  const html = fs.readFileSync('feel/hit/index.html', 'utf8');
  assert.ok(html.includes('data-i18n="feel.resetView"'), 'reset button carries the i18n key');
});

test('facing: the Reset view label exists in every locale', async () => {
  for (const lang of ['en', 'zh', 'ja', 'ko', 'es']) {
    const dict = await loadLocale(lang);
    assert.ok(typeof dict.feel.resetView === 'string' && dict.feel.resetView.length > 1, `${lang} feel.resetView`);
  }
});
