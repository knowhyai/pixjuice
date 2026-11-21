import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../src/templates/gacha/gacha-core.js';
const G = globalThis.PixGacha;
const C = G.validateConfig(G.DEFAULT_CONFIG).config;
function seeded() { let n = 42; return () => ((n = (1664525*n+1013904223) >>> 0) / 2**32); }
test('config normalizes weights; rejects empty pools, unknown rarity and duplicate ids', () => {
 assert.equal(G.validateConfig({}).ok,true);
 assert.equal(G.validateConfig({items:[]}).ok,false);
 assert.equal(G.validateConfig({...C,items:[...C.items,C.items[0]]}).ok,false);
 assert.equal(G.validateConfig({...C,items:C.items.map(i=>({...i,rarity:'XR'}))}).ok,false);
 assert.equal(G.validateConfig({...C,rates:{N:0,R:0,SR:0,SSR:0}}).ok,false);
});
test('base rarity frequencies follow configured probabilities without pity', () => {
 const rng = seeded(), counts = {N:0,R:0,SR:0,SSR:0};
 for(let i=0;i<40000;i++) counts[G.rollOnce(C,G.makeState(),rng).item.rarity]++;
 for(const r of G.RARITIES) assert.ok(Math.abs(counts[r]/40000-C.rates[r])<0.008,r);
});
test('SSR lands exactly at hard pity and resets counters', () => {
 const out=G.pull(C,G.makeState(C.pity.ssr-2,0),2,()=>0);
 assert.deepEqual(out.results.map(x=>x.rarity),['N','SSR']);
 assert.deepEqual(out.state,G.makeState());
});
test('ten-pull includes SR+ even with RNG always drawing N; SSR pity takes precedence',()=>{
 assert.equal(G.pull(C,G.makeState(),10,()=>0).results.at(-1).rarity,'SR');
 assert.equal(G.pull({...C,pity:{ssr:10,sr:10}},G.makeState(),10,()=>0).results.at(-1).rarity,'SSR');
 assert.throws(()=>G.pull({...C,items:[]},G.makeState(),1));
});
test('wheel index uses weights; disclosure sums to one; history is bounded',()=>{
 const cfg={...C,items:C.items.map((it,i)=>({...it,weight:i===0?100:1}))};
 const rng=seeded();let hits=0;
 for(let i=0;i<20000;i++) if(G.wheelPick(cfg,rng)===0) hits++;
 assert.ok(Math.abs(hits/20000-100/107)<0.01);
 assert.ok(Math.abs(C.items.reduce((sum,it)=>sum+G.itemOdds(C,it),0)-1)<1e-9);
 assert.ok(Math.abs(G.wheelSegments(cfg).reduce((sum,s)=>sum+s.odds,0)-1)<1e-9);
 const history=G.record([],Array(80).fill(C.items[0]),123,G.HISTORY_LIMIT);
 assert.equal(history.length,50);assert.equal(history[0].at,123);
});

test('hard-pity effective SSR rate matches the capped-geometric formula', () => {
  assert.equal(G.hardPityEffectiveRate(1, 90), 1);
  assert.equal(G.hardPityEffectiveRate(0.5, 1), 1);
  assert.equal(G.hardPityEffectiveRate(0, 90), 1 / 90);
  assert.ok(Math.abs(G.hardPityEffectiveRate(0.5, 2) - (0.5 / (1 - 0.25))) < 1e-12);
  // Official-style example: 1% base, hard pity at 72 ≈ 1.945%
  const ev = G.hardPityEffectiveRate(0.01, 72);
  assert.ok(Math.abs(ev - 0.01 / (1 - 0.99 ** 72)) < 1e-12);
  assert.ok(ev > 0.019 && ev < 0.02);
});

test('simulate single-pull frequencies follow advertised rates when pity is out of reach', () => {
  // Pity ceiling is capped at 1000, so use a high enough SSR rate that a 1000-miss streak is not a realistic concern.
  const cfg = G.validateConfig({ ...C, rates: { N: 0.4, R: 0.3, SR: 0.2, SSR: 0.1 }, pity: { ssr: 1000, sr: 10 } }).config;
  const out = G.simulate(cfg, { pulls: 40000, mode: 'single', rng: seeded() });
  assert.equal(out.pulls, 40000);
  assert.equal(out.mode, 'single');
  assert.equal(out.forcedSsr, 0);
  for (const r of G.RARITIES) assert.ok(Math.abs(out.observed[r] - cfg.rates[r]) < 0.008, r);
});

test('simulate with hard pity lifts observed SSR toward the formula, not the advertised base rate', () => {
  const rng = seeded();
  const out = G.simulate(C, { pulls: 40000, mode: 'single', rng });
  const expected = G.hardPityEffectiveRate(C.rates.SSR, C.pity.ssr);
  assert.equal(out.expectedSsrHardPity, expected);
  assert.ok(expected > C.rates.SSR);
  assert.ok(Math.abs(out.observed.SSR - expected) < 0.004);
  assert.ok(Math.abs(out.observed.SSR - C.rates.SSR) > Math.abs(out.observed.SSR - expected));
  assert.ok(out.forcedSsr > 0);
  assert.equal(out.advertised.SSR, C.rates.SSR);
  // Disclosure helper stays no-pity (must not silently become a comprehensive rate).
  assert.ok(Math.abs(C.items.reduce((sum, it) => sum + G.itemOdds(C, it), 0) - 1) < 1e-9);
  const ssrItems = C.items.filter(it => it.rarity === 'SSR');
  assert.ok(Math.abs(G.itemOdds(C, ssrItems[0]) - C.rates.SSR) < 1e-12);
});

test('simulate ten-pull mode applies the SR guarantee and counts forced slots', () => {
  const alwaysN = () => 0;
  const noSsrPity = G.validateConfig({ ...C, pity: { ssr: 1000, sr: 10 } }).config;
  const out = G.simulate(noSsrPity, { pulls: 500, mode: 'ten', rng: alwaysN });
  assert.equal(out.pulls, 500);
  assert.equal(out.counts.SR, 50);
  assert.equal(out.counts.N, 450);
  assert.equal(out.forcedSr, 50);
  assert.equal(out.forcedSsr, 0);
  // Zero advertised SSR with a reachable hard pity: effective rate is 1/N.
  const zeroSsr = G.validateConfig({ ...C, rates: { N: 1, R: 0, SR: 0, SSR: 0 }, pity: { ssr: 90, sr: 10 } }).config;
  const forced = G.simulate(zeroSsr, { pulls: 900, mode: 'single', rng: alwaysN });
  assert.equal(forced.forcedSsr, 10);
  assert.equal(forced.counts.SSR, 10);
  assert.ok(Math.abs(forced.observed.SSR - 1 / 90) < 1e-12);
  assert.equal(forced.firstSsrAt, 90);
});

test('simulate rejects invalid pull counts and does not exceed the cap', () => {
  assert.throws(() => G.simulate(C, { pulls: 0 }));
  assert.throws(() => G.simulate(C, { pulls: 20, maxPulls: 10 }));
  assert.equal(G.SIM_MAX_PULLS, 500000);
});


// Independent of G.hardPityEffectiveRate: expected pulls to SSR from a fresh
// counter by backward recurrence, then invert. Used as a cross-check, not a
// restatement of the same closed form in the production file.
function independentExpectedRate(p, N) {
  if (p >= 1) return 1;
  if (!(N >= 1)) return p;
  if (p <= 0) return 1 / N;
  let E = 1; // from sinceSsr = N-1, the next pull is forced
  for (let k = N - 2; k >= 0; k--) E = 1 + (1 - p) * E;
  return 1 / E;
}

// Independent always-N enumerator of the published rules (hard pity + optional
// ten-pull SR guarantee). Does not call rollOnce / simulate.
function independentAlwaysN(pulls, mode, ssrPity, srPity) {
  const counts = { N: 0, R: 0, SR: 0, SSR: 0 };
  let sinceSsr = 0, forcedSsr = 0, forcedSr = 0, total = 0, firstSsrAt = null;
  function run(pulls, mode) {
    Object.assign(counts, { N: 0, R: 0, SR: 0, SSR: 0 });
    sinceSsr = 0; forcedSsr = 0; forcedSr = 0; total = 0; firstSsrAt = null;
    const pullOne = (forceSrPlus) => {
      const forceSsr = ssrPity >= 1 && sinceSsr + 1 >= ssrPity;
      const rarity = forceSsr ? 'SSR' : (forceSrPlus ? 'SR' : 'N');
      if (forceSsr) forcedSsr++;
      else if (forceSrPlus) forcedSr++;
      counts[rarity]++;
      total++;
      if (rarity === 'SSR' && firstSsrAt == null) firstSsrAt = total;
      sinceSsr = rarity === 'SSR' ? 0 : sinceSsr + 1;
      return rarity;
    };
    if (mode === 'single') {
      for (let i = 0; i < pulls; i++) pullOne(false);
    } else {
      const batchLen = srPity;
      const batches = Math.floor(pulls / batchLen);
      const rem = pulls - batches * batchLen;
      for (let b = 0; b < batches; b++) {
        const got = [];
        for (let i = 0; i < batchLen; i++) {
          const isLast = i === batchLen - 1;
          const noSrYet = !got.some((r) => r === 'SR' || r === 'SSR');
          got.push(pullOne(isLast && batchLen >= 2 && noSrYet));
        }
      }
      for (let i = 0; i < rem; i++) pullOne(false);
    }
    return { pulls: total, counts, forcedSsr, forcedSr, firstSsrAt, observedSSR: counts.SSR / total };
  }
  return run(pulls, mode);
}

test('hard-pity formula matches an independent recurrence, including 0/1 and disabled pity', () => {
  assert.equal(G.hardPityEffectiveRate(0.5, 0), 0.5);
  assert.equal(G.hardPityEffectiveRate(0.2, -3), 0.2);
  assert.equal(G.hardPityEffectiveRate(1, 0), 1);
  for (const [p, N] of [[0.01, 90], [0.01, 72], [0.5, 3], [0, 90], [0.2, 1]]) {
    const a = G.hardPityEffectiveRate(p, N);
    const b = independentExpectedRate(p, N);
    assert.ok(Math.abs(a - b) < 1e-12, `p=${p} N=${N} ${a} vs ${b}`);
  }
});

test('0/1 advertised rates, pity 0/1, and denominator stay honest', () => {
  const alwaysN = () => 0;
  const allSsr = G.validateConfig({ ...C, rates: { N: 0, R: 0, SR: 0, SSR: 1 }, pity: { ssr: 90, sr: 10 } }).config;
  const one = G.simulate(allSsr, { pulls: 200, mode: 'single', rng: alwaysN });
  assert.equal(one.counts.SSR, 200);
  assert.equal(one.observed.SSR, one.counts.SSR / one.pulls);
  assert.equal(one.observed.SSR, 1);

  const pityOne = G.validateConfig({ ...C, rates: { N: 1, R: 0, SR: 0, SSR: 0 }, pity: { ssr: 1, sr: 10 } }).config;
  const every = G.simulate(pityOne, { pulls: 40, mode: 'single', rng: alwaysN });
  assert.equal(every.counts.SSR, 40);
  assert.equal(every.forcedSsr, 40);
  assert.equal(every.firstSsrAt, 1);

  const disabled = G.validateConfig({ ...C, rates: { N: 1, R: 0, SR: 0, SSR: 0 }, pity: { ssr: 0, sr: 10 } }).config;
  assert.equal(disabled.pity.ssr, 0);
  assert.equal(disabled.pity.sr, 10); // ten-pull length must not be clamped to 0
  const none = G.simulate(disabled, { pulls: 300, mode: 'single', rng: alwaysN });
  assert.equal(none.counts.SSR, 0);
  assert.equal(none.forcedSsr, 0);
  assert.equal(none.expectedSsrHardPity, null);

  const tenDisabled = G.simulate(disabled, { pulls: 200, mode: 'ten', rng: alwaysN });
  assert.equal(tenDisabled.expectedSsrHardPity, null);
  assert.equal(tenDisabled.counts.SR, 20);
  assert.equal(tenDisabled.forcedSr, 20);
});

test('pity.ssr = 1 stays a valid ceiling in ten-pull mode; the sr clamp only applies for ceilings >= 2', () => {
  const alwaysN = () => 0;
  const v = G.validateConfig({ ...C, pity: { ssr: 1, sr: 10 } });
  assert.ok(v.ok);
  // Every pull is forced SSR; the SR+ window length must stay usable, not be
  // clamped to 1 (which used to make simulate(mode:"ten") throw).
  assert.equal(v.config.pity.sr, 10);
  const out = G.simulate(v.config, { pulls: 30, mode: 'ten', rng: alwaysN });
  assert.equal(out.counts.SSR, 30);
  assert.equal(out.forcedSsr, 30);
  assert.equal(out.forcedSr, 0);
  // The documented clamp still shortens the SR+ window to an enabled ceiling >= 2.
  const clamped = G.validateConfig({ ...C, pity: { ssr: 5, sr: 10 } });
  assert.equal(clamped.config.pity.sr, 5);
});

test('hard-pity formula stays exact for sub-epsilon base rates', () => {
  // In float64, 1 - (1-p)^n rounds to 0 for tiny p; the old guard then
  // falsely reported a 100% effective rate instead of ~1/n.
  assert.ok(Math.abs(G.hardPityEffectiveRate(1e-18, 90) - 1 / 90) < 1e-12);
  assert.ok(Math.abs(G.hardPityEffectiveRate(1e-300, 7) - 1 / 7) < 1e-12);
});

test('simulate always-N counts match an independent enumerator, including ten-pull vs SSR pity', () => {
  const alwaysN = () => 0;
  const cases = [
    { pity: { ssr: 0, sr: 10 }, pulls: 200, mode: 'ten' },
    { pity: { ssr: 90, sr: 10 }, pulls: 900, mode: 'single' },
    { pity: { ssr: 90, sr: 10 }, pulls: 200, mode: 'ten' },
    { pity: { ssr: 1, sr: 10 }, pulls: 30, mode: 'single' },
  ];
  for (const c of cases) {
    const cfg = G.validateConfig({ ...C, rates: { N: 1, R: 0, SR: 0, SSR: 0 }, pity: c.pity }).config;
    const got = G.simulate(cfg, { pulls: c.pulls, mode: c.mode, rng: alwaysN });
    const exp = independentAlwaysN(c.pulls, c.mode, c.pity.ssr, c.pity.sr);
    assert.equal(got.counts.N, exp.counts.N, JSON.stringify([c, got.counts, exp.counts]));
    assert.equal(got.counts.SR, exp.counts.SR);
    assert.equal(got.counts.SSR, exp.counts.SSR);
    assert.equal(got.forcedSsr, exp.forcedSsr);
    assert.equal(got.forcedSr, exp.forcedSr);
    assert.equal(got.firstSsrAt, exp.firstSsrAt);
    assert.equal(got.observed.SSR, got.counts.SSR / got.pulls);
  }
});
