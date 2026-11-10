import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../src/templates/gacha/case-core.js';
const C=globalThis.PixCase;
function seed(s){return ()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
test('crate: seeded rarity frequencies match every disclosed pool',()=>{
 for(const config of C.cases){const rng=seed(1234),counts={};for(let i=0;i<40000;i++){const {item}=C.openCase(config,rng);counts[item.id]=(counts[item.id]||0)+1;}for(const item of config.items)assert.ok(Math.abs(counts[item.id]/40000-item.probability)<6*Math.sqrt(item.probability*(1-item.probability)/40000)+.0003,item.id);}
});
test('crate: predetermined result and centered reel agree at every rarity and viewport',()=>{
 for(const config of C.cases){let low=0;for(const item of config.items){const rng=()=>low+item.probability/2;const result=C.openCase(config,rng);assert.equal(result.item.id,item.id);assert.equal(result.reel.cards[result.reel.winnerIndex],result.item);for(const viewport of [280,576,900]){const offset=C.stopOffset(result.reel,viewport,144,12);const index=Math.round((viewport/2-offset-72)/156);assert.equal(index,result.reel.winnerIndex);assert.equal(result.reel.cards[index].id,item.id);}low+=item.probability;}}
});
test('crate: deterministic seed, invalid probabilities rejected',()=>{
 assert.deepEqual(C.openCase(C.cases[0],seed(42)),C.openCase(C.cases[0],seed(42)));
 assert.throws(()=>C.openCase({items:[]},()=>.5));assert.throws(()=>C.openCase(C.cases[0],()=>1));
});
