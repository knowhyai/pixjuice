import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync('src/lib/assets/manifest.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {sanitizeManifest,kindOf}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('manifest validation classifies models and sprites and rejects malformed entries',()=>{
 assert.equal(kindOf({glb:{lod0:'x'},sprites:{idle:'x'}}),'2d3d');
 assert.equal(kindOf({glb:{lod0:'x'}}),'3d');assert.equal(kindOf({sprites:{idle:'x'}}),'2d');
 const entries=sanitizeManifest({assets:[{nope:true},{id:'ok',name:{en:'Okay'}}]});
 assert.equal(entries.length,1);assert.equal(entries[0].placeholder,true);
});
test('published manifest files exist; only real assets have downloads',()=>{
 const a=sanitizeManifest(JSON.parse(readFileSync('public/free-assets/manifest.json','utf8')));
 assert.equal(a.length,15);
 for(const x of a.filter(x=>!x.placeholder)) {
  for(const p of [x.thumb,x.license.file,...Object.values(x.glb||{}),...Object.values(x.sprites||{})].filter(Boolean)) assert.ok(existsSync('public/free-assets/'+p),p);
 }
});
