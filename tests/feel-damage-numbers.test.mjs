import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync('./src/feel/damage-numbers.ts', 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const { MERGE_WINDOW, NUMBER_LIFE, mergeDamage, numberAppearance, numberMotion, spreadAnchor } =
  await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));

test('damage numbers use magnitude for size, grade for color, and preserve the scale multiplier', () => {
  const light = numberAppearance(18, 'normal', 1);
  const bigger = numberAppearance(46, 'normal', 1);
  const heavy = numberAppearance(46, 'heavy', 1);
  assert.ok(light.size < bigger.size && bigger.size < heavy.size);
  assert.equal(light.color, bigger.color);
  assert.notEqual(light.color, heavy.color);
  assert.equal(numberAppearance(46, 'heavy', 1.6).size, heavy.size * 1.6);
});

test('damage stacks merge by grade inside the window and leave time to show a separate number', () => {
  const stack = { value: 18, grade: 'normal', sinceHit: MERGE_WINDOW - 0.01 };
  assert.deepEqual(mergeDamage(stack, 18, 'normal', false), { value: 36, grade: 'normal', sinceHit: 0 });
  assert.equal(stack.value, 18);
  assert.equal(mergeDamage(stack, 46, 'heavy', false), undefined);
  assert.equal(mergeDamage(stack, 18, 'normal', true), undefined);
  const late = { ...stack, sinceHit: MERGE_WINDOW + 0.16 };
  assert.ok(late.sinceHit < NUMBER_LIFE);
  assert.equal(mergeDamage(late, 18, 'normal', false), undefined);
});

test('damage numbers fly along the hit, overshoot, settle and pop again on merge', () => {
  const dir = { x: -0.6, z: 0.8 };
  const pop = numberMotion(0.25, 0.1, dir, false);
  const settled = numberMotion(0.5, 0.5, dir, false);
  assert.ok(pop.x < settled.x && pop.z > settled.z && pop.y > settled.y);
  assert.ok(Math.abs(pop.x * dir.z - pop.z * dir.x) < 1e-9);
  assert.ok(pop.scale > 1);
  assert.equal(settled.scale, 1);
  assert.ok(numberMotion(0.6, 0.1, dir, false).scale > 1);
  assert.deepEqual(numberMotion(0.25, 0.1, dir, true), { x: 0, y: 0, z: 0, scale: 1 });
});

test('overlapping numbers separate sideways and stay in the overlay near an edge', () => {
  const older = { x: 18, y: 40, halfWidth: 16, halfHeight: 10 };
  const newer = { ...older, x: 20 };
  const spread = spreadAnchor(newer, [older], 100, 80);
  assert.equal(spread.y, newer.y);
  assert.ok(spread.x >= older.x + 2 * older.halfWidth + 6);
  assert.ok(spread.x + newer.halfWidth <= 100);
  assert.deepEqual(spreadAnchor(newer, [], 100, 80), newer);
});
