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
