import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {WebIO} from '@gltf-transform/core';
import {remesh} from '../src/lib/assets/remesh.js';
const path='public/free-assets/chest-wood/realistic/wood/intact/chest_LOD0.glb';
test('browser mesh pipeline retains textures, UVs, normals and materials at all ratios',async()=>{
 const input=new Uint8Array(await readFile(path)),io=new WebIO().registerExtensions(ALL_EXTENSIONS),original=await io.readBinary(input);
 const textures=original.getRoot().listTextures().map(t=>t.getImage());
 let previous=Infinity;
 for(const ratio of [1,.5,.25,.1]){
  const out=await remesh(input,ratio),doc=await io.readBinary(out.bytes);
  assert.ok(out.triangles<=previous);assert.ok(out.triangles>0);previous=out.triangles;
  assert.deepEqual(doc.getRoot().listExtensionsUsed().map(e=>e.extensionName),original.getRoot().listExtensionsUsed().map(e=>e.extensionName));
  assert.equal(doc.getRoot().listMaterials().length,original.getRoot().listMaterials().length);
  assert.deepEqual(doc.getRoot().listTextures().map(t=>t.getImage()),textures);
  for(const m of doc.getRoot().listMeshes())for(const p of m.listPrimitives()){assert.ok(p.getAttribute('TEXCOORD_0'));assert.ok(p.getAttribute('NORMAL'));assert.ok(p.getMaterial());}
  if(ratio<1)assert.ok(out.triangles<out.originalTriangles*.8);
 }
});
