// One-off generator for the /feel/hit/ demo: assemble the default knight outfit
// from the read-only source library, shrink it to a web-sized display GLB, and
// write it to public/feel/. Source files are only ever read, never modified.
//   node scripts/make-feel-knight.mjs
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {mergeDocuments,unpartition,weld,compactPrimitive} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';

const SRC='/workspace/pixjuice-assets/char-knight-semi';
const OUT_DIR='public/feel';
const OUT=`${OUT_DIR}/knight.glb`;
const TMP='/tmp/feel-knight-work';
const SIMPLIFY_RATIO=0.18;          // per-mesh triangle target ratio
const MAX_TRIANGLES=7000;           // hard cap per primitive

const tmp=async(name,bytes)=>{await mkdir(TMP,{recursive:true});const p=`${TMP}/${name}`;await writeFile(p,bytes);return p;};
const ff=(args)=>{const r=spawnSync('ffmpeg',args,{encoding:'buffer'});if(r.status!==0)throw Error('ffmpeg failed: '+args.join(' ')+'\n'+r.stderr.toString().slice(-400));return r;};
const probe=p=>{const r=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',p],{encoding:'utf8'});if(r.status!==0)return null;const [w,h]=r.stdout.trim().split(',').map(Number);return {w,h};};

// Resize an embedded texture with ffmpeg. Roles: albedo keeps the most detail,
// normal maps stay lossless, packed ORM maps can shrink the hardest.
async function resizeTexture(tex,role){
  const bytes=tex.getImage();
  if(!bytes){console.warn('skip texture without embedded image:',tex.getName()||'(unnamed)');return;}
  const mime=tex.getMimeType();
  const ext=mime==='image/png'?'png':mime==='image/jpeg'?'jpg':null;if(!ext)return;
  const hash=createHash('sha1').update(bytes).digest('hex').slice(0,12);
  const src=await tmp(`${hash}-in.${ext}`,bytes);
  const size=probe(src)||{w:0,h:0};
  const budget=role==='albedo'?512:256;
  if(size.w&&size.w<=budget&&size.h<=budget)return; // already small enough
  const outMime='image/jpeg';
  const out=`${TMP}/${hash}-out.jpg`;
  const vf=`scale=min(${budget}\\,iw):min(${budget}\\,ih):force_original_aspect_ratio=decrease:flags=lanczos`;
  const codec=['-q:v',role==='albedo'?'4':'5'];
  ff(['-y','-i',src,'-vf',vf,...codec,'-frames:v','1','-update','1',out]);
  tex.setImage(await readFile(out)).setMimeType(outMime);
}

// Same simplification strategy as the library's remesh worker: weld, then
// simplify with normal/UV attributes locked so silhouettes hold up.
async function simplifyDoc(doc){
  await doc.transform(weld());
  for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
    if(p.getMode()!==4||!p.getIndices())continue;
    const pos=p.getAttribute('POSITION'),src=p.getIndices();
    const attributes=['NORMAL','TEXCOORD_0'].map(s=>p.getAttribute(s)).filter(Boolean);
    const stride=attributes.reduce((s,a)=>s+a.getElementSize(),0),weights=attributes.flatMap(a=>Array(a.getElementSize()).fill(a.getType()==='VEC3'?.5:1));
    const data=new Float32Array(pos.getCount()*stride),element=[];
    for(let i=0;i<pos.getCount();i++){let offset=0;for(const a of attributes){a.getElement(i,element);for(let j=0;j<a.getElementSize();j++)data[i*stride+offset++]=element[j];}}
    const current=src.getCount()/3;
    const target=Math.min(Math.floor(current*SIMPLIFY_RATIO/3)*3,Math.floor(MAX_TRIANGLES/3)*3);
    if(target<3||target>=current)continue;
    const [indices]=MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(src.getArray()),new Float32Array(pos.getArray()),3,data,stride,weights,null,Math.max(3,target),1,[]);
    p.setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(src.getBuffer()));
    if(src.listParents().length===1)src.dispose();
    compactPrimitive(p);
  }
}

const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const meta=JSON.parse(await readFile(`${SRC}/meta.json`,'utf8'));
const preset=meta.presets.find(p=>p.id===meta.default_preset);
const outfit=Object.fromEntries(meta.slots.map(s=>[s.id,preset?.parts[s.id]??s.default_part??null]));

const doc=await io.read(`${SRC}/rig/base.glb`);
const root=doc.getRoot();
const scene=root.getDefaultScene()||root.listScenes()[0];
if(!scene)throw Error('base.glb has no scene');
root.setDefaultScene(scene);

// The re-exported base.glb can carry a second scene with a duplicate armature
// (same Mixamo names, not in the default graph). Prefer the default scene's
// bones when rebinding parts; otherwise listNodes() order would bind outfits
// to the unused copy and the later unreachable-node sweep would empty those skins.
for(const s of root.listScenes())if(s!==scene)s.dispose();
{
  const reachable=new Set();scene.traverse(n=>reachable.add(n));
  for(const skin of root.listSkins()){
    if(!skin.listJoints().some(j=>reachable.has(j)))skin.dispose();
  }
  for(const n of root.listNodes())if(!reachable.has(n))n.dispose();
}

// Merge each equipped part onto the master armature, exactly like the runtime
// outfit exporter: skins rebind to the base skeleton, mesh nodes join the scene.
const baseNodes=[...root.listNodes()],byName=new Map(baseNodes.map(n=>[n.getName(),n]));
for(const part of meta.parts.filter(p=>outfit[p.slot]===p.id&&p.attach?.mode==='skinned')){
  const source=await io.read(`${SRC}/parts/${part.id}.glb`);
  const map=mergeDocuments(doc,source);
  for(const skin of source.getRoot().listSkins()){
    const copy=map.get(skin);
    for(const joint of skin.listJoints()){const main=byName.get(joint.getName());if(!main)throw Error('missing master bone '+joint.getName());copy.removeJoint(map.get(joint));}
    for(const joint of skin.listJoints())copy.addJoint(byName.get(joint.getName()));
    const skel=skin.getSkeleton();if(skel)copy.setSkeleton(byName.get(skel.getName())||null);
  }
  for(const node of source.getRoot().listNodes().filter(n=>n.getMesh())){const copy=map.get(node);copy.setMatrix(node.getWorldMatrix());scene.addChild(copy);}
  for(const anim of source.getRoot().listAnimations())map.get(anim).dispose();
  for(const s of source.getRoot().listScenes())map.get(s).dispose();
  for(const n of source.getRoot().listNodes().slice().reverse()){
    const c=map.get(n);
    if(!c.getMesh()&&!c.listChildren().length&&!c.listParents().some(x=>x.propertyType==='Skin'||x.propertyType==='Scene'||x.propertyType==='Node'))c.dispose();
  }
}
// Drop armature duplicates that nothing references anymore.
const reachable=new Set();scene.traverse(n=>reachable.add(n));
const jointNodes=new Set(root.listSkins().flatMap(s=>[...s.listJoints(),s.getSkeleton()].filter(Boolean)));
for(const n of root.listNodes()){
  if(reachable.has(n)||jointNodes.has(n))continue;
  n.dispose();
}

// Keep only the clips the demo plays (idle / slash / hit); the walk, run and
// death tracks would more than double the download for no on-page use.
const USED_ANIMS=new Set(['idle','slash','attack','hit_to_body_01','hit']);
for(const anim of root.listAnimations())if(!USED_ANIMS.has(anim.getName()))anim.dispose();

await MeshoptSimplifier.ready;
await simplifyDoc(doc);

// Texture budgets by material role.
const roleOf=new Map();
for(const m of root.listMaterials()){
  if(m.getBaseColorTexture())roleOf.set(m.getBaseColorTexture(),'albedo');
}
for(const m of root.listMaterials()){
  const n=m.getNormalTexture();if(n&&!roleOf.has(n))roleOf.set(n,'normal');
  const mr=m.getMetallicRoughnessTexture();if(mr&&!roleOf.has(mr))roleOf.set(mr,'orm');
  const occ=m.getOcclusionTexture();if(occ&&!roleOf.has(occ))roleOf.set(occ,'orm');
}
for(const tex of root.listTextures())await resizeTexture(tex,roleOf.get(tex)||'orm');

await doc.transform(unpartition());
// Vertex quantization (KHR_mesh_quantization): three.js decodes it natively
// and the skin weights/joints shrink to bytes instead of floats.
const {quantize}=await import('@gltf-transform/functions');
await doc.transform(quantize());
await mkdir(OUT_DIR,{recursive:true});
await writeFile(OUT,await io.writeBinary(doc));

const tris=root.listMeshes().reduce((sum,m)=>sum+m.listPrimitives().reduce((n,p)=>n+(p.getIndices()?.getCount()||p.getAttribute('POSITION')?.getCount()||0)/3,0),0);
const bytes=(await readFile(OUT)).byteLength;
await rm(TMP,{recursive:true,force:true});
console.log(`knight.glb: ${tris.toFixed(0)} triangles, ${(bytes/1048576).toFixed(2)} MB, animations: ${root.listAnimations().map(a=>a.getName()).join(', ')}`);
