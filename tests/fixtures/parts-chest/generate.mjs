import {deflateSync} from 'node:zlib';
import {Document,NodeIO} from '@gltf-transform/core';
import {mkdir,writeFile} from 'node:fs/promises';
const root='public/parts-demo';const io=new NodeIO();
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
function thumbnail(color,scale){
 const size=96,data=Buffer.alloc(size*(1+size*4));
 const polygons=[[[[15,30],[55,18],[82,32],[43,46]],1.2],[[[15,30],[43,46],[43,77],[15,61]],.7],[[[43,46],[82,32],[82,63],[43,77]],1]];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*(size*4+1)+1+x*4;let rgb=[26,24,21];
  for(const [points,light] of polygons){let inside=false;const xx=(x-48)/Math.max(.45,scale[0]/2)+48,yy=(y-48)/Math.max(.45,scale[1])+48;
   for(let a=0,b=points.length-1;a<points.length;b=a++){const [ax,ay]=points[a],[bx,by]=points[b];if(((ay>yy)!==(by>yy))&&(xx<(bx-ax)*(yy-ay)/(by-ay)+ax))inside=!inside;}
   if(inside)rgb=color.slice(0,3).map(v=>Math.min(255,Math.round(v*255*light)));
  }data.set([...rgb,255],i);
 }
 const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 const chunk=(type,bytes)=>{const tag=Buffer.from(type),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(bytes.length);c.writeUInt32BE(crc(Buffer.concat([tag,bytes])));return Buffer.concat([n,tag,bytes,c]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(data)),chunk('IEND',Buffer.alloc(0))]);
}
const assets=[];
for(const [palette,color] of [['wood',[.45,.22,.08,1]],['blue',[.05,.35,.9,1]]]){
 const dir=`${root}/${palette}`;await mkdir(`${dir}/parts`,{recursive:true});const parts=[];
 for(const [slot,scale,pos] of [['body',[2,1,1],[0,0,0]],['lock',[.35,.5,.15],[0,0,.6]],['lid',[2,.2,1],[0,.65,0]]]){
 const d=new Document(),b=d.createBuffer(),texture=d.createTexture().setImage(png).setMimeType('image/png');
 const m=d.createMaterial().setBaseColorFactor(color).setBaseColorTexture(texture).setDoubleSided(true);
 // Six faces, independent UVs, positioned in shared product coordinates.
 const vertices=[],uv=[],indices=[];
 const corners=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
 for(const face of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]]){const n=vertices.length/3;for(const i of face)vertices.push(...corners[i].map((v,k)=>v*scale[k]/2+pos[k]));uv.push(0,0,1,0,1,1,0,1);indices.push(n,n+1,n+2,n,n+2,n+3);}
 const attr=(type,array)=>d.createAccessor().setType(type).setArray(array).setBuffer(b);
 const p=d.createPrimitive().setAttribute('POSITION',attr('VEC3',new Float32Array(vertices))).setAttribute('TEXCOORD_0',attr('VEC2',new Float32Array(uv))).setIndices(attr('SCALAR',new Uint16Array(indices))).setMaterial(m);
 d.createScene().addChild(d.createNode(slot).setMesh(d.createMesh(slot).addPrimitive(p)));
 await io.write(`${dir}/parts/${slot}.glb`,d);await writeFile(`${dir}/parts/${slot}.png`,thumbnail(color,scale));
 parts.push({id:slot,slot,name:{en:slot,zh:{body:'箱体',lock:'锁',lid:'箱盖'}[slot],ja:slot,ko:slot,es:slot},glb:`parts/${slot}.glb`,thumb:`parts/${slot}.png`,optional:slot!=='body'});
 }
 await writeFile(`${dir}/meta.json`,JSON.stringify({product_id:'parts-chest',variant:{palette,condition:'intact'},parts},null,2));
 assets.push({id:`parts-chest-${palette}`,product_id:'parts-chest',hidden:true,parts_meta:`../parts-demo/${palette}/meta.json`,name:{en:'Parts test chest',zh:'部件测试宝箱'},category:'props',style_tier:'realistic',palette,state:'intact',tags:['CC0'],glb:{lod0:`../parts-demo/${palette}/parts/body.glb`},license:{id:'CC0 1.0',commercial_use:true}});
}
await writeFile(`${root}/manifest.json`,JSON.stringify({assets},null,2));
