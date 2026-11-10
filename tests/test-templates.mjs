import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Load gacha-core and save-core into globalThis via vm
function loadToGlobal(path) {
  const code = fs.readFileSync(path, 'utf8');
  vm.runInThisContext(code, { filename: path });
}

loadToGlobal('./src/templates/gacha/gacha-core.js');
loadToGlobal('./src/templates/save-load/save-core.js');

// Tests for PixGacha
assert.ok(globalThis.PixGacha, 'PixGacha loaded');
const G = globalThis.PixGacha;

test('gacha: validateConfig normalizes rates and items', () => {
  const res = G.validateConfig({});
  assert.strictEqual(res.ok, true);
  const cfg = res.config;
  const sum = cfg.rates.N + cfg.rates.R + cfg.rates.SR + cfg.rates.SSR;
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.ok(cfg.items.length >= 4);
});

test('gacha: pickWeighted with deterministic rng works', () => {
  const arr = [{ w: 1 }, { w: 3 }];
  const pick = G.pickWeighted(arr, (e) => e.w, () => 0.5);
  assert.strictEqual(pick, arr[1]);
});

test('gacha: pity guarantees SSR after pity threshold', () => {
  const cfg = G.validateConfig({}).config;
  const state = G.makeState(cfg.pity.ssr - 1, 0);
  const out = G.rollOnce(cfg, state, () => 0.0);
  assert.strictEqual(out.item.rarity, 'SSR');
});

test('gacha: ten-pull guarantees at least one SR or above', () => {
  const cfg = G.validateConfig({}).config;
  const custom = JSON.parse(JSON.stringify(cfg));
  custom.rates = { N: 0.99, R: 0.009, SR: 0.001, SSR: 0.0 };
  custom.items = [
    { id: 'iN', name: 'n', rarity: 'N' },
    { id: 'iR', name: 'r', rarity: 'R' },
    { id: 'iSR', name: 'sr', rarity: 'SR' },
    { id: 'iSSR', name: 'ssr', rarity: 'SSR' },
  ];
  const res = G.pull(custom, G.makeState(0, 0), 10, () => 0.0);
  assert.ok(res.results.some((it) => it.rarity === 'SR' || it.rarity === 'SSR'));
});

// Tests for PixSave
assert.ok(globalThis.PixSave, 'PixSave loaded');
const S = globalThis.PixSave;

test('save: memoryAdapter read/write/remove/list', () => {
  const a = S.memoryAdapter();
  const ns = 'testns';
  const e = S.newGame('s1');
  e.name = 'Alice';
  S.write(a, ns, e);
  const r = S.read(a, ns, 's1');
  assert.strictEqual(r.name, 'Alice');
  const l = S.list(a, ns, ['s1', 's2']);
  assert.ok(l.s1 && l.s1.name === 'Alice');
  S.remove(a, ns, 's1');
  const r2 = S.read(a, ns, 's1');
  assert.strictEqual(r2, null);
});

test('save: export/import roundtrip', () => {
  const e = S.newGame('s1');
  e.name = 'Bob';
  const txt = S.exportText(e);
  const parsed = S.parseImport(txt);
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.entry.name, 'Bob');
});

test('save: formatPlaytime produces human strings', () => {
  assert.strictEqual(S.formatPlaytime(42), '42s');
  assert.strictEqual(S.formatPlaytime(90), '1m 30s');
  assert.ok(S.formatPlaytime(3600).includes('h'));
});
