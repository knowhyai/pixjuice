import {deflateSync} from 'node:zlib';
import {Document,NodeIO} from '@gltf-transform/core';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {parseParts} from '../src/lib/assets/parts.js';
const root='public/parts-demo',io=new NodeIO();
const png=thumbnail([1,1,1,1],[100,100,100]);
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
const names=(en,zh,ja=en,ko=en,es=en)=>({en,zh,ja,ko,es});
const label={head:names('Head','头部','頭部','머리','Cabeza'),chest:names('Chest','胸部','胴','가슴','Pecho'),legs:names('Legs','腿甲','脚','다리','Piernas'),main_hand:names('Main hand','主手','メインハンド','주손','Mano principal'),off_hand:names('Off hand','副手','オフハンド','보조손','Mano secundaria'),body:names('Body','箱体','本体','본체','Cuerpo'),lid:names('Lid','箱盖','蓋','뚜껑','Tapa'),lock:names('Lock','锁','錠','자물쇠','Candado'),strap:names('Strap','束带','ベルト','띠','Correa')};
const steel=[.38,.49,.61,1],gold=[.8,.5,.12,1],blue=[.12,.23,.65,1],wood=[.38,.18,.065,1];
function setup(){const d=new Document();d.createBuffer();d.createScene('Demo');return d;}
const attr=(d,type,array)=>d.createAccessor().setType(type).setArray(array).setBuffer(d.getRoot().listBuffers()[0]);
function box(d,id,scale,pos,color,skin){
 const vertices=[],uv=[],normals=[],indices=[];const corners=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
 for(const [fi,face] of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]].entries()){const n=vertices.length/3;for(const i of face){vertices.push(...corners[i].map((v,k)=>v*scale[k]/2+pos[k]));normals.push(...[[0,0,-1],[0,0,1],[-1,0,0],[1,0,0],[0,1,0],[0,-1,0]][fi]);}uv.push(0,0,1,0,1,1,0,1);indices.push(n,n+1,n+2,n,n+2,n+3);}
 const texture=d.createTexture().setImage(png).setMimeType('image/png'),material=d.createMaterial(id).setBaseColorFactor(color).setBaseColorTexture(texture).setMetallicFactor(.25).setRoughnessFactor(.55);
 const p=d.createPrimitive().setAttribute('POSITION',attr(d,'VEC3',new Float32Array(vertices))).setAttribute('NORMAL',attr(d,'VEC3',new Float32Array(normals))).setAttribute('TEXCOORD_0',attr(d,'VEC2',new Float32Array(uv))).setIndices(attr(d,'SCALAR',new Uint16Array(indices))).setMaterial(material);
 if(skin){p.setAttribute('JOINTS_0',attr(d,'VEC4',new Uint16Array(vertices.length/3*4))).setAttribute('WEIGHTS_0',attr(d,'VEC4',new Float32Array(Array.from({length:vertices.length/3},()=>[1,0,0,0]).flat())));}
 const node=d.createNode(id).setMesh(d.createMesh(id).addPrimitive(p));if(skin)node.setSkin(skin);d.getRoot().listScenes()[0].addChild(node);return node;
}
function skeleton(d){const arm=d.createNode('Armature'),hips=d.createNode('mixamorig:Hips'),spine=d.createNode('mixamorig:Spine').setTranslation([0,1.2,0]),head=d.createNode('mixamorig:Head').setTranslation([0,.85,0]),right=d.createNode('mixamorig:RightHand').setTranslation([.72,.1,0]),left=d.createNode('mixamorig:LeftHand').setTranslation([-.72,.1,0]);arm.addChild(hips);hips.addChild(spine);spine.addChild(head).addChild(right).addChild(left);d.getRoot().listScenes()[0].addChild(arm);const joints=[hips,spine,head,right,left],ib=[];for(const pos of [[0,0,0],[0,1.2,0],[0,2.05,0],[.72,1.3,0],[-.72,1.3,0]])ib.push(1,0,0,0,0,1,0,0,0,0,1,0,...pos.map(v=>-v),1);return {skin:d.createSkin('Master').setSkeleton(hips).setInverseBindMatrices(attr(d,'MAT4',new Float32Array(ib))),joints,hips};}
function animate(d,node,clip,rot=false){const sampler=d.createAnimationSampler().setInput(attr(d,'SCALAR',new Float32Array([0,1.5,3]))).setOutput(attr(d,rot?'VEC4':'VEC3',new Float32Array(rot?[0,0,0,1,-.32,0,0,.94741754,0,0,0,1]:[0,0,0,0,.065,0,0,0,0])));d.createAnimation(clip).addSampler(sampler).addChannel(d.createAnimationChannel().setTargetNode(node).setTargetPath(rot?'rotation':'translation').setSampler(sampler));}
await rm(`${root}/wood`,{recursive:true,force:true});await rm(`${root}/blue`,{recursive:true,force:true});const assets=[];
for(const kind of ['character','prop']){
 const product_id=`outfit-${kind}`,dir=`${root}/${kind}`;await mkdir(`${dir}/rig`,{recursive:true});await mkdir(`${dir}/parts`,{recursive:true});
 const sockets=kind==='character'?[{id:'main_hand',node:'mixamorig:RightHand'},{id:'off_hand',node:'mixamorig:LeftHand'}]:['body','lid','lock','strap'].map(id=>({id,node:`socket_${id}`}));
 const slots=(kind==='character'?['head','chest','legs','main_hand','off_hand']:['body','lid','lock','strap']).map(id=>({id,name:label[id],required:kind==='character'?id==='chest':['body','lid'].includes(id),bind:kind==='character'&&!id.includes('hand')?'skinned':'socket',...(kind==='prop'||id.includes('hand')?{socket:id}:{}),...({chest:'cuirass-steel',body:'body-wood',lid:'lid-wood'}[id]?{default_part:{chest:'cuirass-steel',body:'body-wood',lid:'lid-wood'}[id]}:{})}));
 const d=setup();if(kind==='character'){const rig=skeleton(d);rig.joints.forEach(j=>rig.skin.addJoint(j));box(d,'body-base',[.35,1.55,.27],[0,.9,0],[.18,.16,.14,1],rig.skin);box(d,'face-base',[.3,.32,.3],[0,2.02,0],[.72,.5,.32,1],rig.skin);animate(d,rig.hips,'Idle');}else{const nodes=Object.fromEntries(sockets.map(s=>[s.id,d.createNode(s.node)]));nodes.lid.setTranslation([0,.55,-.48]);nodes.lid.addChild(nodes.lock.setTranslation([0,-.12,1.02]));d.getRoot().listScenes()[0].addChild(nodes.body).addChild(nodes.lid).addChild(nodes.strap);animate(d,nodes.lid,'Open',true);}
 await io.write(`${dir}/rig/base.glb`,d);
 const specs=kind==='character'?[
 ['helm-steel','head',names('Steel helm','钢盔','鋼の兜','강철 투구','Yelmo'),[.47,.34,.43],[0,2.18,0],steel,['plate']],
 ['cuirass-steel','chest',names('Steel cuirass','钢胸甲','鋼の胴','강철 흉갑','Coraza'),[.88,.8,.48],[0,1.45,0],steel,['plate']],
 ['robe-mage-blue','chest',names('Blue mage robe','蓝色法师长袍','青いローブ','푸른 로브','Túnica azul'),[.94,1.65,.52],[0,1.05,0],blue,['cloth','mage'],{slots:['legs'],tags:['fitted-legs']}],
 ['greaves-steel','legs',names('Steel greaves','钢腿甲','鋼の脚甲','강철 다리갑옷','Grebas'),[.65,.82,.4],[0,.48,0],steel,['fitted-legs']],
 ['sword-steel','main_hand',names('Steel sword','钢剑','鋼の剣','강철 검','Espada'),[.12,1.05,.13],[0,.2,0],steel,['one-hand']],
 ['greatsword-steel','main_hand',names('Greatsword','双手巨剑','大剣','대검','Mandoble'),[.21,1.65,.15],[0,.35,0],gold,['two-hand'],{slots:['off_hand']}],
 ['shield-steel','off_hand',names('Shield','盾牌','盾','방패','Escudo'),[.6,.8,.15],[0,0,.14],gold,['shield'],{}, {slots:['main_hand'],tags:['one-hand']}]
 ]:[
 ['body-wood','body',names('Wood body','木箱体','木の本体','나무 본체','Cuerpo de madera'),[1.9,1,1],[0,0,0],wood,['wood']],
 ['lid-wood','lid',names('Wood lid','木箱盖','木の蓋','나무 뚜껑','Tapa de madera'),[2,.22,1.1],[0,0,.48],wood,['wood']],
 ['lid-steel','lid',names('Steel lid','钢箱盖','鋼の蓋','강철 뚜껑','Tapa de acero'),[2,.24,1.1],[0,0,.48],steel,['steel']],
 ['lock-gold','lock',names('Gold lock','金锁','金の錠','금 자물쇠','Candado dorado'),[.32,.4,.16],[0,-.15,0],gold,['gold']],
 ['lock-iron','lock',names('Iron lock','铁锁','鉄の錠','철 자물쇠','Candado de hierro'),[.24,.35,.2],[0,-.15,0],steel,['iron']],
 ['strap-leather','strap',names('Leather strap','皮革束带','革ベルト','가죽 띠','Correa'),[.15,1.04,1.06],[.55,0,0],[.12,.065,.025,1],['leather']]
 ];
 const parts=[];for(const [id,slot,name,scale,pos,color,tags,conflicts={},requires={}] of specs){const doc=setup(),skinned=slots.find(s=>s.id===slot).bind==='skinned';let skin;if(skinned){const rig=skeleton(doc);rig.joints.forEach(j=>rig.skin.addJoint(j));skin=rig.skin;}box(doc,'root',scale,pos,color,skin);await io.write(`${dir}/parts/${id}.glb`,doc);await writeFile(`${dir}/parts/${id}.png`,thumbnail(color,scale));parts.push({id,slot,name,glb:`parts/${id}.glb`,thumb:`parts/${id}.png`,tags,conflicts:{slots:[],tags:[],parts:[],...conflicts},requires:{slots:[],tags:[],...requires},attach:skinned?{mode:'skinned'}:{mode:'socket',socket:slot,origin:'root',offset:{translation:[0,0,0],rotation_xyzw:[0,0,0,1],scale:[1,1,1]}}});}
 const presets=kind==='character'?[{id:'full-plate',name:names('Full plate','全身板甲','フルプレート','전신 갑옷','Armadura completa'),parts:{head:'helm-steel',chest:'cuirass-steel',legs:'greaves-steel',main_hand:'sword-steel',off_hand:'shield-steel'}},{id:'mage',name:names('Mage','法师','魔術師','마법사','Mago'),parts:{chest:'robe-mage-blue',main_hand:'greatsword-steel'}}]:[{id:'wood-gold',name:names('Wood and gold','木箱金锁','木と金','나무와 금','Madera y oro'),parts:{body:'body-wood',lid:'lid-wood',lock:'lock-gold',strap:'strap-leather'}},{id:'iron',name:names('Iron fittings','铁制配件','鉄の装具','철 장식','Herrajes'),parts:{body:'body-wood',lid:'lid-steel',lock:'lock-iron'}}];
 const meta={schema_version:1,product_id,kind,name:kind==='character'?names('Outfit character demo','角色自动换装演示','着せ替えデモ','캐릭터 데모','Demo de personaje'):names('Socket prop demo','道具挂点演示','ソケットデモ','소켓 데모','Demo de objeto'),rig:{glb:'rig/base.glb',profile:kind==='character'?'mixamo':'custom',...(kind==='character'?{armature:'Armature',skeleton_root:'mixamorig:Hips'}:{}),animations:[kind==='character'?'Idle':'Open'],sockets},slots,parts,presets,default_preset:presets[0].id};parseParts(meta,`http://fixture/parts-demo/${kind}/meta.json`);await writeFile(`${dir}/meta.json`,JSON.stringify(meta,null,2));await writeFile(`${dir}/LICENSE.txt`,'CC0 1.0 Universal — public domain dedication.\nhttps://creativecommons.org/publicdomain/zero/1.0/\n');assets.push({id:product_id,product_id,hidden:true,parts_meta:`../parts-demo/${kind}/meta.json`,name:meta.name,category:kind==='character'?'characters':'props',style_tier:'realistic',palette:'demo',state:'intact',tags:['CC0'],glb:{lod0:`../parts-demo/${kind}/rig/base.glb`},license:{id:'CC0 1.0',commercial_use:true}});
}
await writeFile(`${root}/manifest.json`,JSON.stringify({assets},null,2));
