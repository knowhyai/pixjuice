// Runs in a lazy worker. The original document is read afresh for every ratio.
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { WebIO } from '@gltf-transform/core';
import { weld, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
export function triangleCount(doc) {
  return doc.getRoot().listMeshes().reduce((sum,m)=>sum+m.listPrimitives().reduce((n,p)=>n+(p.getMode()===4?(p.getIndices()?.getCount()||p.getAttribute('POSITION')?.getCount()||0)/3:0),0),0);
}
export async function remesh(bytes, ratio) {
  if(![1,.5,.25,.1].includes(ratio))throw Error('Invalid ratio');
  await MeshoptSimplifier.ready;
  const io=new WebIO().registerExtensions(ALL_EXTENSIONS),doc=await io.readBinary(bytes);
  const originalTriangles=triangleCount(doc);
  if(ratio<1){
    await doc.transform(weld());
    for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
      if(p.getMode()!==4||!p.getIndices())continue;
      const pos=p.getAttribute('POSITION'),src=p.getIndices();
      const attributes=['NORMAL','TEXCOORD_0','TEXCOORD_1'].map(s=>p.getAttribute(s)).filter(Boolean);
      const stride=attributes.reduce((s,a)=>s+a.getElementSize(),0),weights=attributes.flatMap(a=>Array(a.getElementSize()).fill(a.getType()==='VEC3'?.5:1));
      const data=new Float32Array(pos.getCount()*stride),element=[];
      for(let i=0;i<pos.getCount();i++){let offset=0;for(const a of attributes){a.getElement(i,element);for(let j=0;j<a.getElementSize();j++)data[i*stride+offset++]=element[j];}}
      const [indices]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(src.getArray()),new Float32Array(pos.getArray()),3,data,stride,weights,null,Math.max(3,Math.floor(src.getCount()*ratio/3)*3),1,[]);
      p.setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(src.getBuffer()));
      if(src.listParents().length===1)src.dispose();
      compactPrimitive(p);
    }
  }
  return {bytes:ratio===1?bytes:await io.writeBinary(doc),triangles:triangleCount(doc),originalTriangles};
}
