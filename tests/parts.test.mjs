import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {WebIO} from '@gltf-transform/core';
import {parseParts,initialParts,replacePart,exportParts} from '../src/lib/assets/parts.js';
const load=async color=>parseParts(JSON.parse(await readFile(`public/parts-demo/${color}/meta.json`)),`http://fixture/parts-demo/${color}/meta.json`);
test('parts metadata, replacement, hiding and product boundary',async()=>{
 const wood=await load('wood'),blue=await load('blue');let s=initialParts(wood);
 s=replacePart(wood,s,'lock',blue,'lock');assert.equal(s.lock.part.glb,blue.parts[1].glb);
 s=replacePart(wood,s,'lid',wood,null);assert.equal(s.lid,null);
 assert.throws(()=>replacePart(wood,s,'body',wood,null));
 assert.throws(()=>replacePart(wood,s,'lock',{...blue,product_id:'knight'},'lock'));
 assert.throws(()=>parseParts({...wood,parts:[{...wood.parts[0],glb:'parts/../body.glb'}]},'http://fixture/meta.json'));
 assert.throws(()=>parseParts({},'http://fixture/meta.json'));
 const bytes=await exportParts(wood,s,async url=>new Uint8Array(await readFile('public'+new URL(url).pathname)));
 const doc=await new WebIO().readBinary(bytes),scene=doc.getRoot().getDefaultScene();
 assert.deepEqual(scene.listChildren().map(n=>n.getName()),['body','lock']);
 assert.deepEqual(doc.getRoot().listMaterials()[1].getBaseColorFactor(),[.05,.35,.9,1]);
 assert.equal(doc.getRoot().listMeshes().length,2);assert.equal(doc.getRoot().listTextures().length,2);
 for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){assert.ok(p.getAttribute('TEXCOORD_0'));assert.ok(p.getMaterial().getBaseColorTexture().getImage().length);}
 assert.throws(()=>replacePart(wood,s,'missing',blue,'lock'));
});

test('parts fixture never enters the published grid manifest',async()=>{
 const raw=JSON.parse(await readFile('public/free-assets/manifest.json'));
 assert.ok(raw.assets.every(a=>a.product_id!=='parts-chest' && !a.id.startsWith('parts-chest')));
});
