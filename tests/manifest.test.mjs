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
  assert.equal(x.license.id,'CC0 1.0');
  const license=readFileSync('public/free-assets/'+x.license.file,'utf8');
  assert.ok(license.includes('CC0 1.0 Universal'));
  assert.ok(license.includes('distribute and sell'));
  assert.ok(license.includes('without asking permission or providing attribution'));
  for(const p of [x.thumb,x.license.file,...Object.values(x.glb||{}),...Object.values(x.sprites||{})].filter(Boolean)) assert.ok(existsSync('public/free-assets/'+p),p);
 }
});
test('one product card, no placeholders; variant tags and hidden flags govern visibility',async()=>{
 const {visibleProducts}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const assets=sanitizeManifest(JSON.parse(readFileSync('public/free-assets/manifest.json','utf8')));
 const chests=assets.filter(a=>a.product_id==='chest-wood');
 assert.ok(chests.length>=4);assert.ok(chests.every(a=>a.product_hidden));
 assert.equal(visibleProducts(assets).length,0);
 const published=assets.map(a=>a.product_id==='chest-wood'&&a.style_tier==='realistic'?{...a,product_hidden:false}:a);
 assert.equal(visibleProducts(published).length,1);assert.equal(visibleProducts(published)[0].length,4);
 assert.ok(visibleProducts(published)[0].every(a=>a.style_tier==='realistic'));
 const gold=visibleProducts(published,a=>a.palette==='gold');assert.equal(gold.length,1);assert.ok(gold[0].every(a=>a.palette==='gold'));
 assert.equal(visibleProducts(published.map(a=>({...a,hidden:true}))).length,0);
 assert.equal(visibleProducts(published.map((a,i)=>({...a,product_hidden:a.product_id==='chest-wood'}))).length,0);
});
test('four broad categories expose vehicles only after a finished visible vehicle arrives',async()=>{
 const {availableCategories,ASSET_CATEGORIES}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 assert.deepEqual(ASSET_CATEGORIES,['props','characters','vehicles','environment']);
 const assets=sanitizeManifest(JSON.parse(readFileSync('public/free-assets/manifest.json','utf8')));
 assert.deepEqual(availableCategories(assets),[]);
 const published=assets.map(a=>a.product_id==='chest-wood'&&a.style_tier==='realistic'?{...a,product_hidden:false}:a);
 assert.deepEqual(availableCategories(published),['props']);
 const car={...published[0],id:'sedan',product_id:'sedan',category:'vehicles',product_hidden:false,hidden:false,placeholder:false,style_tier:'realistic'};
 assert.deepEqual(availableCategories([...published,car]),['props','vehicles']);
 assert.deepEqual(availableCategories([...published,{...car,placeholder:true}]),['props']);
});

test('sitemap lists the library index but omits unpublished chest and placeholder pages',()=>{
 const xml=readFileSync('public/sitemap.xml','utf8');
 assert.ok(xml.includes('https://pixjuice.pages.dev/free-assets/'));
 assert.equal((xml.match(/free-assets\/chest-wood/g)||[]).length,0);
 assert.equal((xml.match(/free-assets\/(wall-stone|gold-pile|barrel-wood)\//g)||[]).length,0);
});
